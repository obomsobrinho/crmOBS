-- R-16 (auditoria 2026-10-01, DATA-09): escala das funcoes SQL que alimentam as listas.
--
-- Cada pagina custava uma varredura do tenant inteiro: a ordem era uma coluna
-- calculada (grupo por CASE), as buscas aplicavam sem_acento() em todas as linhas
-- sem usar o trigram, e os contadores eram contagens sobre tudo. Aqui cada leitura
-- passa a andar um indice na ordem pedida e parar no limite.
--
-- Medido em tabelas temporarias dentro de transacao com rollback (nada gravado), um
-- tenant com 55 mil contatos, 50 mil conversas e 500 mil mensagens (mais 10 tenants
-- pequenos), com os indices atuais de producao copiados para o "antes". Tempo de
-- uma chamada (melhor de 2) e linhas lidas por seq scan / index (contadores da
-- transacao, pg_stat_xact):
--   inbox_pagina Tudo, 1a pagina       107 ms (105 mil idx)    ->   1,4 ms (258 idx)
--   inbox_pagina Tudo, pagina funda    181 ms (69 mil idx)     ->   1,2 ms (20 idx)
--   inbox_pagina Hoje / 7 dias         4,0 / 14,6 ms           ->   1,6 / 1,5 ms
--   inbox_pagina "nao respondidas"     60 ms (124 mil seq)     ->   1,2 ms
--   inbox_pagina busca por nome        724 ms (100 mil idx)    ->   6,3 ms
--   inbox_pagina busca por telefone    719 ms                  ->  20 ms
--   inbox_pagina busca em mensagem     985 ms (105 mil idx)    -> 135 ms (trigram)
--   inbox_contagens Hoje / 7 dias      31 / 26 ms (59 mil seq) -> 0,9 / 1,4 ms
--   inbox_contagens Tudo               35 ms                   ->  23 ms (linear)
--   pipeline_coluna (uma coluna)       79 a 132 ms             -> 1,3 a 1,5 ms
--   pipeline_coluna sem coluna         311 ms                  ->  1,2 ms
--   pipeline_coluna busca              292 ms                  ->  38 ms
--   pipeline_contagens                 127 ms                  ->  37 ms (linear)
--   pipeline_contagens busca           491 ms                  ->  45 ms
--   clientes_pagina 1a pagina          82 ms                   ->  4,7 ms
--   clientes_pagina filtros            57 a 117 ms             ->  4 a 6 ms
--   clientes_pagina busca              1,1 a 1,2 s             -> 0,5 a 0,6 s (linear)
-- Percorrer 25 paginas de 50 (cursor, empates de minuto incluidos): inbox Tudo
-- 8,2 s -> 63 ms, nao respondidas 4,8 s -> 50 ms, clientes 3,2 s -> 150 ms, cauda
-- de clientes (contatos sem conversa) 6,3 s -> 438 ms, pipeline 3,6 s -> 69 ms.
-- Em todos os casos o resultado (linhas, ordem, colunas) saiu identico ao da funcao
-- atual (md5 do resultado completo, inclusive cada pagina das caminhadas).
-- Continuam lineares no tenant, por natureza: os totais (inbox_contagens Tudo,
-- pipeline_contagens, clientes_contagens 71 ms) e a busca de clientes, que casa
-- texto composto de nome, e-mail, etiquetas e campos personalizados.
--
-- Semantica preservada: assinatura, colunas, ordem; o pedido aberto (handoff) nunca
-- some pela janela de tempo; o numero de avisos continua fora (p_fora); Hoje, 7 dias
-- e Tudo seguem o p_inicio que o app calcula em America/Sao_Paulo.
--
-- ATENCAO AO APLICAR: `create index` simples bloqueia ESCRITA na tabela enquanto
-- constroi. conversations e dados_cliente recebem escrita do n8n de producao.
-- Hoje as tabelas sao pequenas (milissegundos); se crescerem antes de aplicar,
-- rode cada create index fora de transacao com `create index concurrently`.
-- As funcoes mantem assinatura, colunas, ordem e semantica (create or replace
-- preserva os grants) e ganham `set plan_cache_mode = force_custom_plan`: os
-- parametros opcionais (`p_x is null or ...`) so viram indice quando o plano e
-- feito para o valor concreto (com plano generico o ramo morto continua no plano).

-- ---------------------------------------------------------------------------
-- Indices
-- ---------------------------------------------------------------------------

-- Grupo "time" da lista (sem pedido aberto, com responsavel), na mesma ordem da
-- lista. Parcial: so as linhas desse grupo entram no indice.
create index if not exists conversations_atribuida_ultima_idx
  on public.conversations (client_id, last_message_at desc nulls last, id desc)
  where handoff_at is null and assigned_user_id is not null and last_message_at is not null;

-- Grupo "IA" (sem pedido aberto, sem responsavel).
create index if not exists conversations_sem_dono_ultima_idx
  on public.conversations (client_id, last_message_at desc nulls last, id desc)
  where handoff_at is null and assigned_user_id is null and last_message_at is not null;

-- Uma coluna do funil, da mais recente para a mais antiga (pipeline_coluna).
create index if not exists conversations_client_stage_ultima_idx
  on public.conversations (client_id, stage, last_message_at desc nulls last, id desc)
  where last_message_at is not null;

-- Busca por nome na lista: a expressao e EXATAMENTE a das funcoes (display_name e
-- nomewpp). O dados_cliente_busca_trgm existente indexa outra expressao (com email e
-- telefone), por isso o planejador nunca o usava aqui.
create index if not exists dados_cliente_nome_trgm
  on public.dados_cliente
  using gin (public.sem_acento(coalesce(display_name, '') || ' ' || coalesce(nomewpp, '')) gin_trgm_ops);

-- Contatos sem conversa, do mais novo para o mais velho (clientes_pagina).
create index if not exists dados_cliente_client_id_idx
  on public.dados_cliente (client_id, id desc);

-- ---------------------------------------------------------------------------
-- inbox_pagina
-- ---------------------------------------------------------------------------
create or replace function public.inbox_pagina(p_client uuid, p_inicio timestamp with time zone default null::timestamp with time zone, p_filtro text default 'all'::text, p_eu uuid default null::uuid, p_busca text default null::text, p_fora text[] default '{}'::text[], p_telefone text default null::text, p_cursor_grupo integer default null::integer, p_cursor_em timestamp with time zone default null::timestamp with time zone, p_cursor_id bigint default null::bigint, p_limite integer default 10)
 returns table(id bigint, phone text, last_message_at timestamp with time zone, last_message_preview text, last_message_from text, unread_count integer, assigned_user_id uuid, handoff_at timestamp with time zone, stage text, display_name text, nomewpp text, atendimento_ia text, foto_path text, resumo text, trecho text, grupo integer)
 language plpgsql
 stable
 set search_path to ''
 set plan_cache_mode to 'force_custom_plan'
as $function$
#variable_conflict use_column
declare
  v_q text := nullif(public.sem_acento(btrim(coalesce(p_busca, ''))), '');
  v_dig text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
  v_agrupa boolean := coalesce(p_filtro, 'all') = 'all' and v_q is null;
  v_lim int := greatest(1, least(coalesce(p_limite, 10), 50));
  v_g1 int := case when v_agrupa then 1 else 0 end;
begin
  if v_q is null then
    -- Sem busca. A ordem (grupo, ultima mensagem, id) vira ate tres leituras
    -- keyset, cada uma na ordem de um indice, com limit proprio, e o limit final
    -- junta. O pedido aberto (handoff) nunca e escondido pela janela de tempo.
    return query
    with h as (
      select c.id as b_id, c.phone as b_phone, c.last_message_at as b_em,
        c.last_message_preview as b_prev, c.last_message_from as b_from,
        c.unread_count as b_unread, c.assigned_user_id as b_assigned,
        c.handoff_at as b_handoff, c.stage as b_stage, 0 as b_grupo
      from public.conversations c
      where c.client_id = p_client
        and c.handoff_at is not null
        and c.last_message_at is not null
        and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
        and (p_telefone is null or c.phone = p_telefone)
        and (coalesce(p_filtro, 'all') = 'all'
          or p_filtro = 'needs'
          or (p_filtro = 'unanswered' and c.last_message_from = 'in')
          or (p_filtro = 'mine' and p_eu is not null and c.assigned_user_id = p_eu))
        and (p_cursor_id is null or 0 > p_cursor_grupo
          or (0 = p_cursor_grupo and (c.last_message_at, c.id) < (p_cursor_em, p_cursor_id)))
      order by c.last_message_at desc nulls last, c.id desc
      limit v_lim
    ),
    n1 as (
      -- Agrupada: grupo 1 (com responsavel). Plana: todas sem pedido aberto, grupo 0.
      select c.id as b_id, c.phone as b_phone, c.last_message_at as b_em,
        c.last_message_preview as b_prev, c.last_message_from as b_from,
        c.unread_count as b_unread, c.assigned_user_id as b_assigned,
        c.handoff_at as b_handoff, c.stage as b_stage, v_g1 as b_grupo
      from public.conversations c
      where c.client_id = p_client
        and c.handoff_at is null
        and c.last_message_at is not null
        and (not v_agrupa or c.assigned_user_id is not null)
        and (p_inicio is null or c.last_message_at >= p_inicio)
        and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
        and (p_telefone is null or c.phone = p_telefone)
        and coalesce(p_filtro, 'all') <> 'needs'
        and (coalesce(p_filtro, 'all') = 'all'
          or (p_filtro = 'unanswered' and c.last_message_from = 'in')
          or (p_filtro = 'mine' and p_eu is not null and c.assigned_user_id = p_eu))
        and (p_cursor_id is null or v_g1 > p_cursor_grupo
          or (v_g1 = p_cursor_grupo and (c.last_message_at, c.id) < (p_cursor_em, p_cursor_id)))
      order by c.last_message_at desc nulls last, c.id desc
      limit v_lim
    ),
    n2 as (
      -- So agrupada: grupo 2 (sem responsavel, a IA atende).
      select c.id as b_id, c.phone as b_phone, c.last_message_at as b_em,
        c.last_message_preview as b_prev, c.last_message_from as b_from,
        c.unread_count as b_unread, c.assigned_user_id as b_assigned,
        c.handoff_at as b_handoff, c.stage as b_stage, 2 as b_grupo
      from public.conversations c
      where v_agrupa
        and c.client_id = p_client
        and c.handoff_at is null
        and c.assigned_user_id is null
        and c.last_message_at is not null
        and (p_inicio is null or c.last_message_at >= p_inicio)
        and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
        and (p_telefone is null or c.phone = p_telefone)
        and (p_cursor_id is null or 2 > p_cursor_grupo
          or (2 = p_cursor_grupo and (c.last_message_at, c.id) < (p_cursor_em, p_cursor_id)))
      order by c.last_message_at desc nulls last, c.id desc
      limit v_lim
    ),
    pg as (
      select * from h
      union all select * from n1
      union all select * from n2
      order by b_grupo, b_em desc, b_id desc
      limit v_lim
    )
    select
      b.b_id, b.b_phone, b.b_em, b.b_prev, b.b_from, b.b_unread, b.b_assigned,
      b.b_handoff, b.b_stage, d.display_name, d.nomewpp, d.atendimento_ia, d.foto_path,
      case when b.b_handoff is not null then (
        select q.summary from public.conversation_qualifications q
        where q.client_id = p_client and q.phone = b.b_phone and q.summary is not null
        order by q.created_at desc limit 1
      ) end,
      null::text,
      b.b_grupo
    from pg b
    left join public.dados_cliente d
      on d.client_id = p_client and d.telefone = b.b_phone
    order by b.b_grupo, b.b_em desc, b.b_id desc;
  else
    -- Com busca: o conjunto de telefones que casam (nome, digitos do telefone ou
    -- texto de mensagem) sai de indices (trigram), e so entao ordena e pagina.
    -- A busca ignora a janela de tempo (como antes). O trecho da mensagem so e
    -- buscado para as linhas da pagina.
    return query
    with cand as (
      select d.telefone as fone
      from public.dados_cliente d
      where d.client_id = p_client
        and public.sem_acento(coalesce(d.display_name, '') || ' ' || coalesce(d.nomewpp, '')) like '%' || v_q || '%'
      union
      select c.phone
      from public.conversations c
      where length(v_dig) >= 3
        and c.client_id = p_client
        and split_part(c.phone, '@', 1) like '%' || v_dig || '%'
      union
      select m.phone
      from public.chat_messages m
      where length(v_q) >= 2
        and m.client_id = p_client
        and (public.sem_acento(m.user_message) like '%' || v_q || '%'
          or public.sem_acento(m.bot_message) like '%' || v_q || '%')
    ),
    pg as (
      select c.id as b_id, c.phone as b_phone, c.last_message_at as b_em,
        c.last_message_preview as b_prev, c.last_message_from as b_from,
        c.unread_count as b_unread, c.assigned_user_id as b_assigned,
        c.handoff_at as b_handoff, c.stage as b_stage
      from public.conversations c
      where c.client_id = p_client
        and c.last_message_at is not null
        and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
        and (p_telefone is null or c.phone = p_telefone)
        and c.phone in (select fone from cand)
        and (
          coalesce(p_filtro, 'all') = 'all'
          or (p_filtro = 'needs' and c.handoff_at is not null)
          or (p_filtro = 'unanswered' and c.last_message_from = 'in')
          or (p_filtro = 'mine' and p_eu is not null and c.assigned_user_id = p_eu)
        )
        and (p_cursor_id is null or 0 > p_cursor_grupo
          or (0 = p_cursor_grupo and (c.last_message_at, c.id) < (p_cursor_em, p_cursor_id)))
      order by c.last_message_at desc nulls last, c.id desc
      limit v_lim
    )
    select
      b.b_id, b.b_phone, b.b_em, b.b_prev, b.b_from, b.b_unread, b.b_assigned,
      b.b_handoff, b.b_stage, d.display_name, d.nomewpp, d.atendimento_ia, d.foto_path,
      case when b.b_handoff is not null then (
        select q.summary from public.conversation_qualifications q
        where q.client_id = p_client and q.phone = b.b_phone and q.summary is not null
        order by q.created_at desc limit 1
      ) end,
      case when not (
        public.sem_acento(coalesce(d.display_name, '') || ' ' || coalesce(d.nomewpp, '')) like '%' || v_q || '%'
        or (length(v_dig) >= 3 and split_part(b.b_phone, '@', 1) like '%' || v_dig || '%')
      ) then (
        select case when public.sem_acento(m.user_message) like '%' || v_q || '%'
                    then m.user_message else m.bot_message end
        from public.chat_messages m
        where m.client_id = p_client and m.phone = b.b_phone
          and length(v_q) >= 2
          and (public.sem_acento(m.user_message) like '%' || v_q || '%'
            or public.sem_acento(m.bot_message) like '%' || v_q || '%')
        order by m.created_at desc limit 1
      ) end,
      0
    from pg b
    left join public.dados_cliente d
      on d.client_id = p_client and d.telefone = b.b_phone
    order by b.b_em desc, b.b_id desc;
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- inbox_contagens
-- ---------------------------------------------------------------------------
-- Duas leituras: pedidos abertos (indice parcial, sem janela) e o resto dentro da
-- janela (faixa do indice por last_message_at). "Hoje" e "7 dias" deixam de ler o
-- tenant inteiro; "Tudo" (p_inicio nulo) continua linear por natureza.
create or replace function public.inbox_contagens(p_client uuid, p_inicio timestamp with time zone default null::timestamp with time zone, p_eu uuid default null::uuid, p_fora text[] default '{}'::text[])
 returns table(todas bigint, esperando bigint, sem_resposta bigint, suas bigint, grupo_time bigint, grupo_ia bigint, existe_alguma boolean)
 language plpgsql
 stable
 set search_path to ''
 set plan_cache_mode to 'force_custom_plan'
as $function$
#variable_conflict use_column
begin
  return query
  with h as (
    select count(*) as t,
      count(*) filter (where c.last_message_from = 'in') as sr,
      count(*) filter (where p_eu is not null and c.assigned_user_id = p_eu) as su
    from public.conversations c
    where c.client_id = p_client
      and c.handoff_at is not null
      and c.last_message_at is not null
      and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
  ),
  n as (
    select count(*) as t,
      count(*) filter (where c.last_message_from = 'in') as sr,
      count(*) filter (where p_eu is not null and c.assigned_user_id = p_eu) as su,
      count(*) filter (where c.assigned_user_id is not null) as gt,
      count(*) filter (where c.assigned_user_id is null) as gi
    from public.conversations c
    where c.client_id = p_client
      and c.handoff_at is null
      and c.last_message_at is not null
      and (p_inicio is null or c.last_message_at >= p_inicio)
      and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
  )
  select h.t + n.t, h.t, h.sr + n.sr, h.su + n.su, n.gt, n.gi,
    exists (
      select 1 from public.conversations c
      where c.client_id = p_client
        and c.last_message_at is not null
        and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
    )
  from h, n;
end;
$function$;

-- ---------------------------------------------------------------------------
-- pipeline_coluna
-- ---------------------------------------------------------------------------
-- A coluna calculada (`case when stage = any(ativos) then stage else padrao`) vira
-- duas leituras com indice: a coluna e uma etapa ativa (stage = coluna, indice por
-- etapa) ou e a coluna padrao (estagio nulo ou fora das ativas). O nome/summary
-- so e lido para a pagina.
create or replace function public.pipeline_coluna(p_client uuid, p_coluna text, p_padrao text, p_ativos text[], p_busca text default null::text, p_atendente text default 'all'::text, p_so_esperando boolean default false, p_fora text[] default '{}'::text[], p_telefone text default null::text, p_cursor_em timestamp with time zone default null::timestamp with time zone, p_cursor_id bigint default null::bigint, p_limite integer default 10)
 returns table(id bigint, phone text, last_message_at timestamp with time zone, last_message_preview text, last_message_from text, unread_count integer, assigned_user_id uuid, coluna text, stage_source text, handoff_at timestamp with time zone, display_name text, nomewpp text, atendimento_ia text, foto_path text, resumo text)
 language plpgsql
 stable
 set search_path to ''
 set plan_cache_mode to 'force_custom_plan'
as $function$
#variable_conflict use_column
declare
  v_q text := nullif(public.sem_acento(btrim(coalesce(p_busca, ''))), '');
  v_dig text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
  v_lim int := greatest(1, least(coalesce(p_limite, 10), 50));
begin
  return query
  with cand as (
    select d.telefone as fone
    from public.dados_cliente d
    where v_q is not null
      and d.client_id = p_client
      and public.sem_acento(coalesce(d.display_name, '') || ' ' || coalesce(d.nomewpp, '')) like '%' || v_q || '%'
    union
    select c.phone
    from public.conversations c
    where v_q is not null
      and length(v_dig) >= 3
      and c.client_id = p_client
      and split_part(c.phone, '@', 1) like '%' || v_dig || '%'
  ),
  a as (
    select c.id as b_id, c.phone as b_phone, c.last_message_at as b_em,
      c.last_message_preview as b_prev, c.last_message_from as b_from,
      c.unread_count as b_unread, c.assigned_user_id as b_assigned,
      c.stage as b_stage, c.stage_source as b_fonte, c.handoff_at as b_handoff
    from public.conversations c
    where p_coluna is null
      and c.client_id = p_client
      and c.last_message_at is not null
      and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
      and (p_telefone is null or c.phone = p_telefone)
      and (not coalesce(p_so_esperando, false) or c.handoff_at is not null)
      and (
        coalesce(p_atendente, 'all') = 'all'
        or (p_atendente = 'none' and c.assigned_user_id is null)
        or (p_atendente not in ('all', 'none') and c.assigned_user_id::text = p_atendente)
      )
      and (v_q is null or c.phone in (select fone from cand))
      and (p_cursor_id is null or (c.last_message_at, c.id) < (p_cursor_em, p_cursor_id))
    order by c.last_message_at desc nulls last, c.id desc
    limit v_lim
  ),
  b as (
    -- coluna e uma etapa ativa
    select c.id as b_id, c.phone as b_phone, c.last_message_at as b_em,
      c.last_message_preview as b_prev, c.last_message_from as b_from,
      c.unread_count as b_unread, c.assigned_user_id as b_assigned,
      c.stage as b_stage, c.stage_source as b_fonte, c.handoff_at as b_handoff
    from public.conversations c
    where p_coluna is not null
      and p_coluna = any (p_ativos)
      and c.client_id = p_client
      and c.stage = p_coluna
      and c.last_message_at is not null
      and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
      and (p_telefone is null or c.phone = p_telefone)
      and (not coalesce(p_so_esperando, false) or c.handoff_at is not null)
      and (
        coalesce(p_atendente, 'all') = 'all'
        or (p_atendente = 'none' and c.assigned_user_id is null)
        or (p_atendente not in ('all', 'none') and c.assigned_user_id::text = p_atendente)
      )
      and (v_q is null or c.phone in (select fone from cand))
      and (p_cursor_id is null or (c.last_message_at, c.id) < (p_cursor_em, p_cursor_id))
    order by c.last_message_at desc nulls last, c.id desc
    limit v_lim
  ),
  p as (
    -- coluna e a padrao: estagio nulo ou fora das etapas ativas
    select c.id as b_id, c.phone as b_phone, c.last_message_at as b_em,
      c.last_message_preview as b_prev, c.last_message_from as b_from,
      c.unread_count as b_unread, c.assigned_user_id as b_assigned,
      c.stage as b_stage, c.stage_source as b_fonte, c.handoff_at as b_handoff
    from public.conversations c
    where p_coluna is not null
      and p_padrao = p_coluna
      and c.client_id = p_client
      and not coalesce(c.stage = any (p_ativos), false)
      and c.last_message_at is not null
      and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
      and (p_telefone is null or c.phone = p_telefone)
      and (not coalesce(p_so_esperando, false) or c.handoff_at is not null)
      and (
        coalesce(p_atendente, 'all') = 'all'
        or (p_atendente = 'none' and c.assigned_user_id is null)
        or (p_atendente not in ('all', 'none') and c.assigned_user_id::text = p_atendente)
      )
      and (v_q is null or c.phone in (select fone from cand))
      and (p_cursor_id is null or (c.last_message_at, c.id) < (p_cursor_em, p_cursor_id))
    order by c.last_message_at desc nulls last, c.id desc
    limit v_lim
  ),
  pg as (
    select * from a
    union all select * from b
    union all select * from p
    order by b_em desc, b_id desc
    limit v_lim
  )
  select
    x.b_id, x.b_phone, x.b_em, x.b_prev, x.b_from, x.b_unread, x.b_assigned,
    case when x.b_stage = any (p_ativos) then x.b_stage else p_padrao end,
    x.b_fonte, x.b_handoff, d.display_name, d.nomewpp, d.atendimento_ia, d.foto_path,
    (select q.summary from public.conversation_qualifications q
      where q.client_id = p_client and q.phone = x.b_phone and q.summary is not null
      order by q.created_at desc limit 1)
  from pg x
  left join public.dados_cliente d on d.client_id = p_client and d.telefone = x.b_phone
  order by x.b_em desc, x.b_id desc;
end;
$function$;

-- ---------------------------------------------------------------------------
-- pipeline_contagens
-- ---------------------------------------------------------------------------
-- Uma leitura so (antes eram duas: `filtrada` e `base`): os totais por coluna sao
-- agregados filtrados (`filter`) e a linha '*' conta o conjunto sem os filtros. O
-- nome que casa com a busca sai do indice trigram (cand) em vez de aplicar
-- sem_acento() a cada contato do tenant.
create or replace function public.pipeline_contagens(p_client uuid, p_padrao text, p_ativos text[], p_busca text default null::text, p_atendente text default 'all'::text, p_so_esperando boolean default false, p_fora text[] default '{}'::text[])
 returns table(coluna text, total bigint, esperando bigint, mais_antigo timestamp with time zone)
 language plpgsql
 stable
 set search_path to ''
 set plan_cache_mode to 'force_custom_plan'
as $function$
#variable_conflict use_column
declare
  v_q text := nullif(public.sem_acento(btrim(coalesce(p_busca, ''))), '');
  v_dig text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
begin
  return query
  with cand as (
    select d.telefone as fone
    from public.dados_cliente d
    where v_q is not null
      and d.client_id = p_client
      and public.sem_acento(coalesce(d.display_name, '') || ' ' || coalesce(d.nomewpp, '')) like '%' || v_q || '%'
  ),
  base as (
    select
      case when c.stage = any (p_ativos) then c.stage else p_padrao end as b_coluna,
      c.handoff_at as b_handoff, c.last_message_at as b_em,
      (
        (not coalesce(p_so_esperando, false) or c.handoff_at is not null)
        and (
          coalesce(p_atendente, 'all') = 'all'
          or (p_atendente = 'none' and c.assigned_user_id is null)
          or (p_atendente not in ('all', 'none') and c.assigned_user_id::text = p_atendente)
        )
        and (
          v_q is null
          or c.phone in (select fone from cand)
          or (length(v_dig) >= 3 and split_part(c.phone, '@', 1) like '%' || v_dig || '%')
        )
      ) as b_ok
    from public.conversations c
    where c.client_id = p_client
      and c.last_message_at is not null
      and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
  )
  select
    case when grouping(b.b_coluna) = 1 then '*' else b.b_coluna end,
    case when grouping(b.b_coluna) = 1 then count(*) else count(*) filter (where b.b_ok) end,
    case when grouping(b.b_coluna) = 1
      then count(*) filter (where b.b_handoff is not null)
      else count(*) filter (where b.b_ok and b.b_handoff is not null) end,
    case when grouping(b.b_coluna) = 1 then null else min(b.b_em) filter (where b.b_ok) end
  from base b
  group by grouping sets ((b.b_coluna), ())
  having grouping(b.b_coluna) = 1 or count(*) filter (where b.b_ok) > 0
  order by grouping(b.b_coluna), 1;
end;
$function$;

-- ---------------------------------------------------------------------------
-- clientes_pagina
-- ---------------------------------------------------------------------------
-- Sem busca: a ordem (ultima mensagem, id do contato) vira uma leitura keyset pelo
-- indice da conversa (contatos com conversa) e, so se a pagina nao encher, uma
-- leitura pelo id (contatos sem conversa). O empate de last_message_at e quebrado
-- pelo id do CONTATO (nao da conversa): pega-se o corte da pagina pelo indice e
-- depois todos os empatados nesse instante, e so entao ordena. Tags so da pagina.
-- Com busca: a mesma expressao de antes, mas as tags do tenant sao agregadas uma
-- vez (uma linha por conversa) em vez de uma subconsulta por contato, e o
-- jsonb_each_text so roda para quem tem campos personalizados.
create or replace function public.clientes_pagina(p_client uuid, p_filtro text default 'todos'::text, p_busca text default null::text, p_fora text[] default '{}'::text[], p_hoje timestamp with time zone default null::timestamp with time zone, p_frio_antes timestamp with time zone default null::timestamp with time zone, p_cursor_em timestamp with time zone default null::timestamp with time zone, p_cursor_id bigint default null::bigint, p_limite integer default 10)
 returns table(id bigint, telefone text, nomewpp text, display_name text, atendimento_ia text, custom_fields jsonb, email text, birth_date date, created_at timestamp with time zone, foto_path text, conversa_id bigint, last_message_at timestamp with time zone, assigned_user_id uuid, tags jsonb, k timestamp with time zone)
 language plpgsql
 stable
 set search_path to ''
 set plan_cache_mode to 'force_custom_plan'
as $function$
#variable_conflict use_column
declare
  v_q text := nullif(public.sem_acento(btrim(coalesce(p_busca, ''))), '');
  v_dig text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
  v_var text[];
  v_lim int := greatest(1, least(coalesce(p_limite, 10), 50));
  v_f text := coalesce(p_filtro, 'todos');
  v_corte timestamptz;
begin
  -- As variantes do telefone buscado, com e sem o nono digito (variantesSemNove).
  v_var := array[v_dig];
  if length(v_dig) = 11 and substr(v_dig, 3, 1) = '9' then
    v_var := v_var || (left(v_dig, 2) || substr(v_dig, 4));
  end if;
  if length(v_dig) = 13 and left(v_dig, 2) = '55' and substr(v_dig, 5, 1) = '9' then
    v_var := v_var || (left(v_dig, 4) || substr(v_dig, 6));
  end if;

  if v_q is null then
    -- O corte entra na consulta como valor, nao como subconsulta: com um InitPlan o
    -- planejador nao estima a faixa e cai em hash join sobre todos os contatos.
    if v_f in ('todos', 'conversa', 'frio', 'incompleto') then
      select min(s.em) into v_corte
      from (
        select c.last_message_at as em
        from public.conversations c
        join public.dados_cliente d on d.client_id = c.client_id and d.telefone = c.phone
        where c.client_id = p_client
          and c.last_message_at is not null
          and not (split_part(d.telefone, '@', 1) = any (coalesce(p_fora, '{}')))
          and (v_f = 'todos'
            or (v_f = 'conversa' and p_hoje is not null and c.last_message_at >= p_hoje)
            or (v_f = 'frio' and p_frio_antes is not null and c.last_message_at < p_frio_antes)
            or (v_f = 'incompleto' and not (
                  nullif(btrim(coalesce(d.display_name, '')), '') is not null
                  and d.birth_date is not null
                  and nullif(btrim(coalesce(d.email, '')), '') is not null)))
          and (p_cursor_id is null or c.last_message_at <= p_cursor_em)
          and (p_cursor_id is null or c.last_message_at < p_cursor_em
            or (c.last_message_at = p_cursor_em and d.id < p_cursor_id))
        order by c.last_message_at desc nulls last, c.id desc
        limit v_lim
      ) s;
    end if;

    return query
    with g1 as (
      select
        d.id as b_id, d.telefone as b_tel, d.nomewpp as b_nw, d.display_name as b_dn,
        d.atendimento_ia as b_ia, d.custom_fields as b_cf, d.email as b_email,
        d.birth_date as b_nasc, d.created_at as b_criado, d.foto_path as b_foto,
        c.id as b_conv, c.last_message_at as b_em, c.assigned_user_id as b_assigned,
        c.last_message_at as b_k
      from public.conversations c
      join public.dados_cliente d on d.client_id = c.client_id and d.telefone = c.phone
      where v_f in ('todos', 'conversa', 'frio', 'incompleto')
        and c.client_id = p_client
        and c.last_message_at is not null
        and c.last_message_at >= v_corte
        and (p_cursor_id is null or c.last_message_at <= p_cursor_em)
        and not (split_part(d.telefone, '@', 1) = any (coalesce(p_fora, '{}')))
        and (v_f = 'todos'
          or (v_f = 'conversa' and p_hoje is not null and c.last_message_at >= p_hoje)
          or (v_f = 'frio' and p_frio_antes is not null and c.last_message_at < p_frio_antes)
          or (v_f = 'incompleto' and not (
                nullif(btrim(coalesce(d.display_name, '')), '') is not null
                and d.birth_date is not null
                and nullif(btrim(coalesce(d.email, '')), '') is not null)))
        and (p_cursor_id is null or c.last_message_at < p_cursor_em
          or (c.last_message_at = p_cursor_em and d.id < p_cursor_id))
      order by c.last_message_at desc, d.id desc
      limit v_lim
    ),
    g2 as (
      select
        d.id as b_id, d.telefone as b_tel, d.nomewpp as b_nw, d.display_name as b_dn,
        d.atendimento_ia as b_ia, d.custom_fields as b_cf, d.email as b_email,
        d.birth_date as b_nasc, d.created_at as b_criado, d.foto_path as b_foto,
        c.id as b_conv, c.last_message_at as b_em, c.assigned_user_id as b_assigned,
        '-infinity'::timestamptz as b_k
      from (
        -- Contatos sem mensagem, do id maior ao menor. O not exists deixa o planejador
        -- andar o indice (client_id, id desc) e parar no limite.
        select d0.*
        from public.dados_cliente d0
        where (select count(*) from g1) < v_lim
          and v_f in ('todos', 'nunca', 'incompleto')
          and d0.client_id = p_client
          and not exists (
            select 1 from public.conversations c0
            where c0.client_id = d0.client_id and c0.phone = d0.telefone
              and c0.last_message_at is not null)
          and not (split_part(d0.telefone, '@', 1) = any (coalesce(p_fora, '{}')))
          and (v_f in ('todos', 'nunca')
            or (v_f = 'incompleto' and not (
                  nullif(btrim(coalesce(d0.display_name, '')), '') is not null
                  and d0.birth_date is not null
                  and nullif(btrim(coalesce(d0.email, '')), '') is not null)))
          and (p_cursor_id is null or '-infinity'::timestamptz < p_cursor_em
            or ('-infinity'::timestamptz = p_cursor_em and d0.id < p_cursor_id))
        order by d0.id desc
        limit v_lim
      ) d
      left join public.conversations c on c.client_id = d.client_id and c.phone = d.telefone
    ),
    pg as (
      select * from g1
      union all select * from g2
      order by b_k desc, b_id desc
      limit v_lim
    )
    select
      x.b_id, x.b_tel, x.b_nw, x.b_dn, x.b_ia, x.b_cf, x.b_email, x.b_nasc, x.b_criado,
      x.b_foto, x.b_conv, x.b_em, x.b_assigned,
      coalesce((
        select jsonb_agg(jsonb_build_object('name', t.name, 'color', t.color) order by t.name)
        from public.conversation_tags ct
        join public.tags t on t.id = ct.tag_id
        where x.b_conv is not null and ct.conversation_id = x.b_conv
      ), '[]'::jsonb),
      x.b_k
    from pg x
    order by x.b_k desc, x.b_id desc;
  else
    return query
    with tn as (
      select ct.conversation_id as cid, string_agg(t.name, ' ' order by t.name) as nomes
      from public.conversation_tags ct
      join public.tags t on t.id = ct.tag_id
      where ct.client_id = p_client
      group by ct.conversation_id
    ),
    base as (
      select
        d.id as b_id, d.telefone as b_tel, d.nomewpp as b_nw, d.display_name as b_dn,
        d.atendimento_ia as b_ia, d.custom_fields as b_cf, d.email as b_email,
        d.birth_date as b_nasc, d.created_at as b_criado, d.foto_path as b_foto,
        c.id as b_conv, c.last_message_at as b_em, c.assigned_user_id as b_assigned,
        coalesce(c.last_message_at, '-infinity'::timestamptz) as b_k,
        split_part(d.telefone, '@', 1) as b_fone,
        tn.nomes as b_tn
      from public.dados_cliente d
      left join public.conversations c
        on c.client_id = d.client_id and c.phone = d.telefone
      left join tn on tn.cid = c.id
      where d.client_id = p_client
        and not (split_part(d.telefone, '@', 1) = any (coalesce(p_fora, '{}')))
    ),
    pg as (
      select x.*
      from base x
      where
        (
          v_f = 'todos'
          or (p_filtro = 'conversa' and p_hoje is not null and x.b_em >= p_hoje)
          or (p_filtro = 'frio' and p_frio_antes is not null and x.b_em < p_frio_antes)
          or (p_filtro = 'nunca' and x.b_em is null)
          or (p_filtro = 'incompleto' and not (
                nullif(btrim(coalesce(x.b_dn, '')), '') is not null
                and x.b_nasc is not null
                and nullif(btrim(coalesce(x.b_email, '')), '') is not null))
        )
        and (
          public.sem_acento(
            concat_ws(' ', coalesce(x.b_dn, x.b_nw), x.b_email, x.b_tn,
              case when x.b_cf = '{}'::jsonb then null
                   else (select string_agg(v, ' ') from jsonb_each_text(x.b_cf) as f(c, v)) end)
          ) like '%' || v_q || '%'
          or (length(v_dig) >= 2 and exists (
                select 1 from unnest(v_var) vv
                where x.b_fone like '%' || vv || '%'
                   or (case when length(x.b_fone) = 13 and left(x.b_fone, 2) = '55' and substr(x.b_fone, 5, 1) = '9'
                            then left(x.b_fone, 4) || substr(x.b_fone, 6) else x.b_fone end) like '%' || vv || '%'))
        )
        and (
          p_cursor_id is null
          or x.b_k < p_cursor_em
          or (x.b_k = p_cursor_em and x.b_id < p_cursor_id)
        )
      order by x.b_k desc, x.b_id desc
      limit v_lim
    )
    select
      x.b_id, x.b_tel, x.b_nw, x.b_dn, x.b_ia, x.b_cf, x.b_email, x.b_nasc, x.b_criado,
      x.b_foto, x.b_conv, x.b_em, x.b_assigned,
      coalesce((
        select jsonb_agg(jsonb_build_object('name', t.name, 'color', t.color) order by t.name)
        from public.conversation_tags ct
        join public.tags t on t.id = ct.tag_id
        where x.b_conv is not null and ct.conversation_id = x.b_conv
      ), '[]'::jsonb),
      x.b_k
    from pg x
    order by x.b_k desc, x.b_id desc;
  end if;
end;
$function$;
