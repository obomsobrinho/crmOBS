-- R-04 / R-06 / R-17 / R-18 / R-19 (auditoria 2026-10-01, DATA-02, DATA-03,
-- DATA-10, DATA-11, DATA-13, PERF-02): o painel e a tela de assinatura deixam de
-- baixar linhas de chat_messages para contar em memoria.
--
-- POR QUE: o "Max rows" do PostgREST e 1000 (confirmado pelo dono). Todo
-- `.limit(20000)` e todo `rpc` que devolve um conjunto de linhas e cortado em
-- 1000 em silencio, entao os numeros do painel e o "desde o inicio" do passo de
-- cancelar estao errados para qualquer tenant acima de 1.000 mensagens. A
-- correcao nao pode depender de trazer linhas: estas funcoes devolvem so
-- ESCALARES por janela e um jsonb pequeno e LIMITADO (por data e por semana x
-- minuto do dia, nao pelo volume de mensagens). jsonb e uma linha so, entao o
-- Max rows nao o corta.
--
-- O QUE CONTINUA EM TS (fonte unica, lib/):
--   - as janelas (lib/periodo.ts): chegam aqui como PARAMETROS (p_de / p_ate);
--   - horario de atendimento, fim de semana, feriado (lib/valor.ts): o SQL so
--     entrega contagens por (dia da semana, minuto do dia) e por data; quem diz
--     "dentro/fora do horario" e "feriado" e o TS;
--   - a mediana, a media, os limiares (lib/metrics.ts, lib/valor.ts): o SQL
--     entrega n, soma e os dois valores centrais ordenados.
--
-- O QUE PRECISA EXISTIR EM SQL (e esta declarado em lib/mensagem.ts, com o teste
-- de paridade e2e/painel-agregado.serial.spec.ts): "quem respondeu" e "a linha e
-- importada". Aqui a regra e escrita assim, e SO assim:
--   importada      = message_type is distinct from 'imported' (excluida de tudo)
--   resposta da IA = tem bot_message E message_type is distinct from 'manual'
--                    (a importada ja saiu antes)
--   resposta humana (manual) = tem bot_message E message_type is not distinct from 'manual'
--   tem mensagem recebida / tem resposta = coalesce(col, '') <> ''  (sem btrim,
--     igual a `!!m.user_message` / `!!m.bot_message` de lib/mensagem.ts)
-- `is distinct from`, nunca `<>`: message_type NULL e resposta da IA (n8n grava
-- assim), e `<>` com NULL descartaria a linha.
--
-- O numero que RECEBE os avisos do time nao e cliente (lib/avisos.ts): `p_fora`
-- traz as grafias dele (lib/inbox-lista.ts, `foraDaLista`) e o telefone da linha
-- e comparado so pelos digitos, o mesmo `replace(/\D/g, "")` do TS.
--
-- Tudo security invoker (RLS do tenant vale) e com `p_client` explicito, que e o
-- que o indice (client_id, created_at desc) da migration anterior serve.

-- ---------------------------------------------------------------------------
-- painel_janelas: um conjunto de ESCALARES por janela (no maximo 1 + a quantidade
-- de janelas pedidas, nunca perto de 1000 linhas).
--
-- janela 0 = o acumulado: de sempre ate p_agora. As demais vem de p_de / p_ate
-- (mesmos limites que lib/periodo.ts calcula; [de, ate), como `naJanela`).
--
-- Exatidao: os limites das janelas sao instantes quebrados (agora - 7 dias), e a
-- primeira resposta de cada conversa DENTRO da janela depende deles. Por isso as
-- linhas sao cortadas em segmentos pelos proprios limites (width_bucket sobre os
-- cortes), agregadas por (telefone, segmento) numa passada so, e cada janela e a
-- uniao dos segmentos que cabem nela. Nenhum limite e arredondado.
--
-- Colunas (as mesmas contas de computeMetrics e resumoDeValor, por telefone):
--   conversas     telefones com alguma linha nao importada na janela
--   sem_humano    dessas, as sem nenhuma resposta manual na janela
--   respostas_ia  linhas que sao resposta da IA
--   recebidas     linhas com mensagem recebida
--   dif_n         telefones com primeira resposta da IA >= primeira recebida
--                 (as duas DENTRO da janela), dif_soma a soma das diferencas em ms,
--                 dif_rapidas quantas ficaram abaixo de p_rapida_ms
--   dif_lo/dif_hi os dois valores centrais da lista ordenada (a mediana e feita
--                 em TS: lib/metrics.ts `medianaDeCentrais`)
--   pessoas_novas telefones cuja primeira linha nao importada da CONTA cai na janela
--   primeira_em   (so janela 0) a primeira linha nao importada da conta, em ms
--   leads/pausar/agendar  qualificacoes na janela: telefones distintos, e as
--                 contagens de action 'pausar' e 'agendar'
-- Os instantes viram milissegundos (floor), como o Date.parse do JS.
-- ---------------------------------------------------------------------------
create or replace function public.painel_janelas(
  p_client uuid,
  p_fora text[],
  p_agora timestamptz,
  p_de timestamptz[],
  p_ate timestamptz[],
  p_rapida_ms bigint default 60000
)
returns table (
  janela int,
  conversas int,
  sem_humano int,
  respostas_ia bigint,
  recebidas bigint,
  dif_n int,
  dif_lo bigint,
  dif_hi bigint,
  dif_soma bigint,
  dif_rapidas int,
  pessoas_novas int,
  primeira_em bigint,
  leads int,
  pausar int,
  agendar int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with jan as (
    select 0 as k, '-infinity'::timestamptz as de, p_agora as ate
    union all
    select i, p_de[i], p_ate[i] from generate_subscripts(p_de, 1) as i
  ),
  cortes as (
    select array_agg(x order by x) as c
    from (select de as x from jan union select ate from jan) s
  ),
  segs as (
    select s as seg, (c.c)[s] as lo, (c.c)[s + 1] as hi
    from cortes c cross join lateral generate_series(1, cardinality(c.c) - 1) s
  ),
  base as (
    select m.phone,
           width_bucket(m.created_at, (select c from cortes)) as seg,
           m.created_at as t,
           coalesce(m.user_message, '') <> '' as u,
           (coalesce(m.bot_message, '') <> '' and m.message_type is distinct from 'manual') as ia,
           (coalesce(m.bot_message, '') <> '' and m.message_type is not distinct from 'manual') as hum
    from public.chat_messages m
    where m.client_id = p_client
      and m.message_type is distinct from 'imported'
      and m.created_at < p_agora
      and (coalesce(cardinality(p_fora), 0) = 0
           or regexp_replace(coalesce(m.phone, ''), '\D', '', 'g') <> all (p_fora))
  ),
  porseg as (
    select phone, seg,
           min(t) as tmin,
           min(t) filter (where u) as pu,
           min(t) filter (where ia) as pia,
           bool_or(hum) as h,
           count(*) filter (where ia) as nia,
           count(*) filter (where u) as nu
    from base
    group by phone, seg
  ),
  porjan as (
    select j.k, p.phone,
           min(p.pu) as pu, min(p.pia) as pia, bool_or(p.h) as h,
           sum(p.nia) as nia, sum(p.nu) as nu
    from jan j
    join segs s on s.lo >= j.de and s.hi <= j.ate
    join porseg p on p.seg = s.seg
    group by j.k, p.phone
  ),
  prim as (
    select phone, min(tmin) as f from porseg group by phone
  ),
  agg as (
    select k,
           count(*) as conversas,
           count(*) filter (where not h) as sem_humano,
           sum(nia) as nia,
           sum(nu) as nu
    from porjan
    group by k
  ),
  dd as (
    select k, d,
           row_number() over (partition by k order by d) as rn,
           count(*) over (partition by k) as n
    from (
      select k,
             (floor(extract(epoch from pia) * 1000) - floor(extract(epoch from pu) * 1000))::bigint as d
      from porjan
      where pia is not null and pu is not null
    ) x
    where d >= 0
  ),
  dstat as (
    select k,
           max(n) as n,
           sum(d) as soma,
           count(*) filter (where d < p_rapida_ms) as rapidas,
           max(d) filter (where rn = (n + 1) / 2) as lo,
           max(d) filter (where rn = n / 2 + 1) as hi
    from dd
    group by k
  ),
  pn as (
    select j.k, count(*) as n
    from jan j
    join prim p on p.f >= j.de and p.f < j.ate
    group by j.k
  ),
  q as (
    select j.k,
           count(distinct x.phone) as leads,
           count(*) filter (where x.action = 'pausar') as pausar,
           count(*) filter (where x.action = 'agendar') as agendar
    from jan j
    join public.conversation_qualifications x
      on x.client_id = p_client and x.created_at >= j.de and x.created_at < j.ate
    where coalesce(cardinality(p_fora), 0) = 0
       or regexp_replace(coalesce(x.phone, ''), '\D', '', 'g') <> all (p_fora)
    group by j.k
  )
  select j.k,
         coalesce(a.conversas, 0)::int,
         coalesce(a.sem_humano, 0)::int,
         coalesce(a.nia, 0)::bigint,
         coalesce(a.nu, 0)::bigint,
         coalesce(ds.n, 0)::int,
         ds.lo,
         ds.hi,
         coalesce(ds.soma, 0)::bigint,
         coalesce(ds.rapidas, 0)::int,
         coalesce(pn.n, 0)::int,
         case when j.k = 0
              then (select floor(extract(epoch from min(f)) * 1000)::bigint from prim)
         end,
         coalesce(q.leads, 0)::int,
         coalesce(q.pausar, 0)::int,
         coalesce(q.agendar, 0)::int
  from jan j
  left join agg a on a.k = j.k
  left join dstat ds on ds.k = j.k
  left join pn on pn.k = j.k
  left join q on q.k = j.k
  order by j.k;
$$;

-- ---------------------------------------------------------------------------
-- painel_series: o material das contas que dependem de DATA e HORA, num jsonb.
-- Tudo em America/Sao_Paulo, so linhas nao importadas, antes de p_ate, sem o
-- numero de avisos. Tamanho limitado por data (uma entrada por dia com
-- resposta) e por semana x minuto do dia (no maximo 7 x 1440), nunca pelo
-- volume de mensagens.
--
--   dias      [[data, respostas_ia, respostas_manuais], ...]  (so dias com resposta)
--   horas     [[data, hora, respostas_ia, respostas_manuais], ...] desde p_horas_de
--   cubo      [[dia_da_semana, minuto_do_dia, respostas_ia], ...]  (0 = domingo)
--   cubo_mes  o mesmo, so em [p_mes_de, p_mes_ate)
--   picos     [[dia_da_semana, hora, recebidas, ultima_em_ms], ...]
--   picos_mes o mesmo, so em [p_mes_de, p_mes_ate)
-- `ultima_em_ms` existe para o desempate do pico reproduzir a ordem em que o JS
-- via as linhas (da mais nova para a mais velha).
-- p_mes_de / p_mes_ate nulos deixam cubo_mes e picos_mes vazios.
-- ---------------------------------------------------------------------------
create or replace function public.painel_series(
  p_client uuid,
  p_fora text[],
  p_ate timestamptz,
  p_horas_de timestamptz,
  p_mes_de timestamptz default null,
  p_mes_ate timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select (m.created_at at time zone 'America/Sao_Paulo') as l,
           m.created_at as t,
           coalesce(m.user_message, '') <> '' as u,
           (coalesce(m.bot_message, '') <> '' and m.message_type is distinct from 'manual') as ia,
           (coalesce(m.bot_message, '') <> '' and m.message_type is not distinct from 'manual') as man
    from public.chat_messages m
    where m.client_id = p_client
      and m.message_type is distinct from 'imported'
      and m.created_at < p_ate
      and (coalesce(cardinality(p_fora), 0) = 0
           or regexp_replace(coalesce(m.phone, ''), '\D', '', 'g') <> all (p_fora))
  ),
  g as (
    select l::date as d,
           (extract(hour from l) * 60 + extract(minute from l))::int as mm,
           count(*) filter (where ia) as ia,
           count(*) filter (where man) as man,
           count(*) filter (where u) as u,
           max(t) filter (where u) as ult,
           count(*) filter (where ia and t >= p_mes_de and t < p_mes_ate) as ia_mes,
           count(*) filter (where u and t >= p_mes_de and t < p_mes_ate) as u_mes,
           max(t) filter (where u and t >= p_mes_de and t < p_mes_ate) as ult_mes,
           count(*) filter (where ia and t >= p_horas_de) as ia_h,
           count(*) filter (where man and t >= p_horas_de) as man_h
    from base
    group by 1, 2
  )
  select jsonb_build_object(
    'dias', coalesce((
      select jsonb_agg(jsonb_build_array(d, ia, man) order by d)
      from (select d, sum(ia)::int as ia, sum(man)::int as man from g group by d
            having sum(ia) + sum(man) > 0) x
    ), '[]'::jsonb),
    'horas', coalesce((
      select jsonb_agg(jsonb_build_array(d, h, ia, man) order by d, h)
      from (select d, mm / 60 as h, sum(ia_h)::int as ia, sum(man_h)::int as man from g
            group by d, mm / 60 having sum(ia_h) + sum(man_h) > 0) x
    ), '[]'::jsonb),
    'cubo', coalesce((
      select jsonb_agg(jsonb_build_array(dw, mm, n) order by dw, mm)
      from (select extract(dow from d)::int as dw, mm, sum(ia)::int as n from g
            group by 1, 2 having sum(ia) > 0) x
    ), '[]'::jsonb),
    'cubo_mes', coalesce((
      select jsonb_agg(jsonb_build_array(dw, mm, n) order by dw, mm)
      from (select extract(dow from d)::int as dw, mm, sum(ia_mes)::int as n from g
            group by 1, 2 having sum(ia_mes) > 0) x
    ), '[]'::jsonb),
    'picos', coalesce((
      select jsonb_agg(jsonb_build_array(dw, h, n, ult) order by dw, h)
      from (select extract(dow from d)::int as dw, mm / 60 as h, sum(u)::int as n,
                   floor(extract(epoch from max(ult)) * 1000)::bigint as ult
            from g group by 1, 2 having sum(u) > 0) x
    ), '[]'::jsonb),
    'picos_mes', coalesce((
      select jsonb_agg(jsonb_build_array(dw, h, n, ult) order by dw, h)
      from (select extract(dow from d)::int as dw, mm / 60 as h, sum(u_mes)::int as n,
                   floor(extract(epoch from max(ult_mes)) * 1000)::bigint as ult
            from g group by 1, 2 having sum(u_mes) > 0) x
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- painel_verbatim (R-17, R-18): mesma saida e mesma regra de antes, sem varrer o
-- tenant. Antes, `humano` era um `select distinct phone` sobre TODAS as respostas
-- manuais/importadas do tenant, a cada visita. Agora a pergunta "este telefone
-- teve resposta humana?" e um `not exists` correlacionado, avaliado so enquanto
-- se anda pela lista de candidatas em created_at desc (para no primeiro acerto),
-- servido por (client_id, phone, created_at) e pelo parcial de bot_message.
--
-- Regra de quem respondeu: a mesma de painel_janelas. Unica diferenca declarada
-- (e e de proposito, nao divergencia): a candidata exige texto NAO VAZIO depois
-- do btrim, porque escolherVerbatim (lib/painel.ts) filtra `!!bot_message?.trim()`
-- logo em seguida. Resposta so de espacos e "resposta da IA" para as contagens
-- (igual a `!!bot_message`), mas nunca vira frase de vitrine.
-- ---------------------------------------------------------------------------
create or replace function public.painel_verbatim(p_client uuid, p_min int default 120, p_fora text[] default '{}')
returns table (phone text, nomewpp text, user_message text, bot_message text, message_type text, created_at timestamptz, conversa_com_humano boolean)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with cand as (
    (select i.* from public.chat_messages i
      where i.client_id = p_client
        and coalesce(i.bot_message, '') <> ''
        and btrim(i.bot_message) <> ''
        and i.message_type is distinct from 'manual'
        and i.message_type is distinct from 'imported'
        and (coalesce(cardinality(p_fora), 0) = 0
             or regexp_replace(coalesce(i.phone, ''), '\D', '', 'g') <> all (p_fora))
        and not exists (
          select 1 from public.chat_messages h
          where h.client_id = p_client and h.phone = i.phone
            and coalesce(h.bot_message, '') <> ''
            and h.message_type in ('manual', 'imported'))
      order by i.created_at desc limit 1)
    union
    (select i.* from public.chat_messages i
      where i.client_id = p_client
        and coalesce(i.bot_message, '') <> ''
        and btrim(i.bot_message) <> ''
        and i.message_type is distinct from 'manual'
        and i.message_type is distinct from 'imported'
        and (coalesce(cardinality(p_fora), 0) = 0
             or regexp_replace(coalesce(i.phone, ''), '\D', '', 'g') <> all (p_fora))
        and length(btrim(i.bot_message)) >= p_min
      order by i.created_at desc limit 1)
  ),
  linhas as (
    select c.* from cand c
    union
    select x.* from cand c
    cross join lateral (
      select m.* from public.chat_messages m
      where m.client_id = p_client and m.phone = c.phone and m.created_at < c.created_at
      order by m.created_at desc limit 30
    ) x
  )
  select l.phone, l.nomewpp, l.user_message, l.bot_message, l.message_type, l.created_at,
         exists (
           select 1 from public.chat_messages h
           where h.client_id = p_client and h.phone = l.phone
             and coalesce(h.bot_message, '') <> ''
             and h.message_type in ('manual', 'imported'))
  from linhas l;
end;
$$;

revoke execute on function public.painel_janelas(uuid, text[], timestamptz, timestamptz[], timestamptz[], bigint) from anon, public;
revoke execute on function public.painel_series(uuid, text[], timestamptz, timestamptz, timestamptz, timestamptz) from anon, public;
revoke execute on function public.painel_verbatim(uuid, int, text[]) from anon, public;
grant execute on function public.painel_janelas(uuid, text[], timestamptz, timestamptz[], timestamptz[], bigint) to authenticated;
grant execute on function public.painel_series(uuid, text[], timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function public.painel_verbatim(uuid, int, text[]) to authenticated;
