-- Central "Clientes" do dono, entrega 1, ajustes da revisao (/simplify):
-- docs/plano-central-clientes.md e docs/adr/2026-10-14-clientes-central-with-tabs.md.
-- Aditivo e so service_role; a migration 20261014215549 nao e editada.
--
-- 1. admin_empresas_pagina ganha p_id (default null): com ele devolve UM cliente
--    pela MESMA selecao da lista, e o detalhe deixa de remontar a linha em TS.
--    Todos os parametros novos tem default, entao quem chama pela assinatura
--    anterior (inclusive o codigo em producao, que passa so os cinco primeiros)
--    segue funcionando. A funcao de seis parametros cai e a de sete nasce.
-- 2. admin_cliente_solucoes passa a receber as janelas em ARRAY (como
--    painel_motivos): as quatro janelas da aba Atendimento saem numa chamada so.
--    A de uma janela cai (nenhum codigo implantado a usa).
-- 3. Indice para o filtro de situacao com o keyset por nome: a lista filtrada por
--    subscription_status le em ordem de (name, id) sem ordenar.

drop function if exists public.admin_empresas_pagina(date, text, text, uuid, integer, text);

create function public.admin_empresas_pagina(
  p_mes date,
  p_busca text default null,
  p_cursor_nome text default null,
  p_cursor_id uuid default null,
  p_limite integer default 10,
  p_situacao text default null,
  p_id uuid default null
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
    where (p_id is null or c.id = p_id)
      and (v_q is null or public.sem_acento(c.name) like '%' || v_q || '%')
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
revoke execute on function public.admin_empresas_pagina(date, text, text, uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_empresas_pagina(date, text, text, uuid, integer, text, uuid) to service_role;

drop function if exists public.admin_cliente_solucoes(uuid, text[], timestamptz, timestamptz);

create function public.admin_cliente_solucoes(
  p_client uuid,
  p_fora text[] default '{}',
  p_de timestamptz[] default '{}',
  p_ate timestamptz[] default '{}'
) returns table (janela int, solucao text, aberto boolean, n int)
language sql
stable
security invoker
set search_path = ''
as $$
  select j.i::int, h.solucao, (h.closed_at is null), count(*)::int
  from generate_subscripts(p_de, 1) as j(i)
  join public.handoffs h
    on h.client_id = p_client
   and h.opened_at >= p_de[j.i]
   and h.opened_at < p_ate[j.i]
   and not (split_part(h.phone, '@', 1) = any (coalesce(p_fora, '{}')))
  group by j.i, h.solucao, (h.closed_at is null);
$$;
revoke execute on function public.admin_cliente_solucoes(uuid, text[], timestamptz[], timestamptz[]) from public, anon, authenticated;
grant execute on function public.admin_cliente_solucoes(uuid, text[], timestamptz[], timestamptz[]) to service_role;

create index if not exists clients_situacao_nome_id_idx
  on public.clients (subscription_status, name, id);
