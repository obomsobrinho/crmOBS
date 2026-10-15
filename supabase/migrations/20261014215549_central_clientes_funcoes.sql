-- Central "Clientes" do dono do produto, entrega 1 (docs/plano-central-clientes.md).
-- Porque: docs/adr/2026-10-14-clientes-central-with-tabs.md.
--
-- Tudo aditivo e so service_role (a central le por rotas do admin):
-- 1. admin_empresas_pagina evolui: filtro por situacao (subscription_status) e as
--    colunas que a lista precisa para a situacao, o alerta e o WhatsApp
--    (subscription_status, trial_ends_at, grace_until, created_at, tem_instancia).
--    A assinatura muda (parametro novo e colunas novas), entao a funcao antiga cai
--    e a nova nasce; nenhum dado e tocado. Continua UMA consulta keyset por
--    (name, id), 10 por vez, busca por trigram em sem_acento(name); os joins do
--    mes e da ultima atividade acontecem so depois do limite.
-- 2. admin_cliente_uso: o uso de IA de UMA empresa por dia (turnos e tokens) e a
--    grade de dia da semana x hora, numa janela limitada (o app pede 31 dias).
--    Le agent_turns pelo indice (client_id, created_at). Dia e hora em
--    America/Sao_Paulo.
-- 3. admin_cliente_solucoes: pedidos de ajuda que ABRIRAM numa janela, por solucao
--    gravada (e quantos seguem abertos), na mesma regra de painel_motivos.

-- ---------------------------------------------------------------------------
-- 1. Lista de clientes
-- ---------------------------------------------------------------------------
drop function if exists public.admin_empresas_pagina(date, text, text, uuid, integer);

create function public.admin_empresas_pagina(
  p_mes date,
  p_busca text default null,
  p_cursor_nome text default null,
  p_cursor_id uuid default null,
  p_limite integer default 10,
  p_situacao text default null
) returns table (
  id uuid,
  name text,
  account_type text,
  billing_plan text,
  agent_enabled boolean,
  agent_published_at timestamptz,
  ia_limite_tokens bigint,
  tokens_entrada bigint,
  tokens_cache bigint,
  tokens_saida bigint,
  ultima_atividade timestamptz,
  subscription_status text,
  trial_ends_at timestamptz,
  grace_until timestamptz,
  created_at timestamptz,
  tem_instancia boolean
)
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  v_q text := nullif(public.sem_acento(btrim(coalesce(p_busca, ''))), '');
  v_lim int := greatest(1, least(coalesce(p_limite, 10), 50));
  v_sit text := nullif(btrim(coalesce(p_situacao, '')), '');
begin
  return query
  with pg as (
    select c.id as e_id, c.name as e_nome, c.account_type as e_tipo, c.billing_plan as e_plano,
      c.agent_enabled as e_ligado, c.agent_published_at as e_pub, c.ia_limite_tokens as e_limite,
      c.subscription_status as e_status, c.trial_ends_at as e_teste, c.grace_until as e_carencia,
      c.created_at as e_criado, (c.evolution_instance is not null) as e_instancia
    from public.clients c
    where (v_q is null or public.sem_acento(c.name) like '%' || v_q || '%')
      and (v_sit is null or c.subscription_status = v_sit)
      and (p_cursor_id is null or (c.name, c.id) > (p_cursor_nome, p_cursor_id))
    order by c.name, c.id
    limit v_lim
  )
  select pg.e_id, pg.e_nome, pg.e_tipo, pg.e_plano, pg.e_ligado, pg.e_pub, pg.e_limite,
    coalesce(m.tokens_entrada, 0)::bigint,
    coalesce(m.tokens_cache, 0)::bigint,
    coalesce(m.tokens_saida, 0)::bigint,
    (select t.created_at from public.agent_turns t
      where t.client_id = pg.e_id
      order by t.created_at desc
      limit 1),
    pg.e_status, pg.e_teste, pg.e_carencia, pg.e_criado, pg.e_instancia
  from pg
  left join public.consumo_ia_mensal m on m.client_id = pg.e_id and m.mes = p_mes
  order by pg.e_nome, pg.e_id;
end;
$$;
revoke execute on function public.admin_empresas_pagina(date, text, text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.admin_empresas_pagina(date, text, text, uuid, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Uso de IA de uma empresa: por dia e por dia da semana x hora
-- ---------------------------------------------------------------------------
-- Conta os turnos que CHAMARAM o modelo (entrada ou saida de tokens preenchida, a
-- mesma condicao com que o logTurn soma no mes), bancada incluida, como o teto.
--   dias  [[data, turnos, entrada, cache, saida], ...]   so dias com turno
--   cubo  [[dia_da_semana, hora, turnos], ...]            0 = domingo; so a partir de p_cubo_de
create or replace function public.admin_cliente_uso(
  p_client uuid,
  p_de timestamptz,
  p_ate timestamptz,
  p_cubo_de timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with g as (
    select (t.created_at at time zone 'America/Sao_Paulo') as l,
           t.created_at as quando,
           coalesce(t.input_tokens, 0)::bigint as i,
           coalesce(t.cached_input_tokens, 0)::bigint as c,
           coalesce(t.output_tokens, 0)::bigint as o
    from public.agent_turns t
    where t.client_id = p_client
      and t.created_at >= p_de
      and t.created_at < p_ate
      and (t.input_tokens is not null or t.output_tokens is not null)
  ),
  h as (
    select l::date as d,
           extract(hour from l)::int as hr,
           count(*) as n,
           sum(i) as i,
           sum(c) as c,
           sum(o) as o,
           count(*) filter (where quando >= p_cubo_de) as n_cubo
    from g
    group by 1, 2
  )
  select jsonb_build_object(
    'dias', coalesce((
      select jsonb_agg(jsonb_build_array(d, n, i, c, o) order by d)
      from (select d, sum(n)::int as n, sum(i)::bigint as i, sum(c)::bigint as c, sum(o)::bigint as o
            from h group by d) x
    ), '[]'::jsonb),
    'cubo', coalesce((
      select jsonb_agg(jsonb_build_array(dw, hr, n) order by dw, hr)
      from (select extract(dow from d)::int as dw, hr, sum(n_cubo)::int as n
            from h group by 1, 2 having sum(n_cubo) > 0) x
    ), '[]'::jsonb)
  );
$$;
revoke execute on function public.admin_cliente_uso(uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_cliente_uso(uuid, timestamptz, timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Pedidos de ajuda por solucao
-- ---------------------------------------------------------------------------
-- Pedidos que ABRIRAM em [p_de, p_ate), por solucao gravada e por estar aberto ou
-- fechado. Mesma janela e mesma exclusao do numero de avisos de painel_motivos.
-- Solucao nula com aberto = false e pedido fechado antes de a solucao existir.
create or replace function public.admin_cliente_solucoes(
  p_client uuid,
  p_fora text[],
  p_de timestamptz,
  p_ate timestamptz
) returns table (solucao text, aberto boolean, n int)
language sql
stable
security invoker
set search_path = ''
as $$
  select h.solucao, (h.closed_at is null), count(*)::int
  from public.handoffs h
  where h.client_id = p_client
    and h.opened_at >= p_de
    and h.opened_at < p_ate
    and not (split_part(h.phone, '@', 1) = any (coalesce(p_fora, '{}')))
  group by h.solucao, (h.closed_at is null);
$$;
revoke execute on function public.admin_cliente_solucoes(uuid, text[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_cliente_solucoes(uuid, text[], timestamptz, timestamptz) to service_role;
