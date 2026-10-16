-- APPLY AFTER THE DEPLOY of the code that no longer reads clients.account_type (16/10/2026).
-- Do NOT apply before: the code that is live today still selects the column (the list of the
-- central, the LGPD export) and would fail with "column does not exist".
--
-- The beta is over (owner decision of 16/10/2026): the account type (interno, beta, pago)
-- identified the free testers and nothing else, and it never decided access (accessState reads
-- only the subscription columns and the Vitalicio, manual block and deactivation marks). The
-- code stopped reading and writing it; this migration removes the column and its check.
-- See docs/adr/2026-10-16-account-type-removed.md.
--
-- The only function that returned the column is admin_empresas_pagina (the list of the
-- central). It is recreated first without account_type, with the same body, grants and
-- precedence (desativado, bloqueado, vitalicio, stored status), so nothing references the
-- column when it is dropped. The return type changes, so the function is dropped and created.

drop function if exists public.admin_empresas_pagina(date, text, text, uuid, integer, text, uuid);

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
  tem_instancia boolean,
  vitalicio_desde timestamptz,
  bloqueado_em timestamptz,
  desativada_em timestamptz
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
  -- Os filtros espelham a precedencia de `situacaoDaConta` (lib/admin-alertas.ts):
  -- desativado, depois bloqueado, depois vitalicio, depois o status gravado.
  return query
  with pg as (
    select c.id as e_id, c.name as e_nome, c.billing_plan as e_plano,
      c.agent_enabled as e_ligado, c.agent_published_at as e_pub, c.ia_limite_tokens as e_limite,
      c.subscription_status as e_status, c.trial_ends_at as e_teste, c.grace_until as e_carencia,
      c.created_at as e_criado, (c.evolution_instance is not null) as e_instancia,
      c.vitalicio_desde as e_vitalicio, c.bloqueado_em as e_bloqueado, c.desativada_em as e_desativada
    from public.clients c
    where (p_id is null or c.id = p_id)
      and (v_q is null or public.sem_acento(c.name) like '%' || v_q || '%')
      and (
        v_sit is null
        or (v_sit = 'desativado' and c.desativada_em is not null)
        or (v_sit = 'bloqueado' and c.desativada_em is null and c.bloqueado_em is not null)
        or (v_sit = 'vitalicio' and c.desativada_em is null and c.bloqueado_em is null
            and c.vitalicio_desde is not null)
        or (c.desativada_em is null and c.bloqueado_em is null and c.vitalicio_desde is null
            and c.subscription_status = v_sit)
      )
      and (p_cursor_id is null or (c.name, c.id) > (p_cursor_nome, p_cursor_id))
    order by c.name, c.id
    limit v_lim
  )
  select pg.e_id, pg.e_nome, pg.e_plano, pg.e_ligado, pg.e_pub, pg.e_limite,
    coalesce(m.tokens_entrada, 0)::bigint,
    coalesce(m.tokens_cache, 0)::bigint,
    coalesce(m.tokens_saida, 0)::bigint,
    (select t.created_at from public.agent_turns t
      where t.client_id = pg.e_id
      order by t.created_at desc
      limit 1),
    pg.e_status, pg.e_teste, pg.e_carencia, pg.e_criado, pg.e_instancia,
    pg.e_vitalicio, pg.e_bloqueado, pg.e_desativada
  from pg
  left join public.consumo_ia_mensal m on m.client_id = pg.e_id and m.mes = p_mes
  order by pg.e_nome, pg.e_id;
end;
$$;
revoke execute on function public.admin_empresas_pagina(date, text, text, uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_empresas_pagina(date, text, text, uuid, integer, text, uuid) to service_role;

-- The column and its check (dropping the column drops the check; the explicit line documents it).
alter table public.clients drop constraint if exists clients_account_type_check;
alter table public.clients drop column if exists account_type;
