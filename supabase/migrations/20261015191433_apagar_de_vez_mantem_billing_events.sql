-- Central "Clientes": o "Apagar de vez" MANTEM o historico de cobranca
-- (billing_events, registro fiscal), decisao do dono de 15/10/2026.
-- Porque: docs/adr/2026-10-15-two-step-company-deletion.md.
--
-- ADITIVA e compativel com o codigo implantado:
-- 1. billing_events ganha deleted_client_id e deleted_client_name (nulas; nenhuma
--    linha muda). A chave billing_events.client_id -> clients ja e
--    "on delete set null" desde 20260814033651: apagar o cliente nao apaga nem
--    trava o historico, mas o client_id vira nulo. As duas colunas guardam de
--    quem era a linha, para o historico continuar legivel sem a linha de clients.
-- 2. admin_apagar_cliente ganha p_mantidas (default vazio): as tabelas com
--    client_id que FICAM de proposito. A conferencia do catalogo passa a ser
--    sobre p_tabelas mais p_mantidas, entao uma tabela NOVA com client_id que nao
--    esteja em nenhuma das duas listas continua abortando tudo. Uma tabela
--    mantida precisa: nao estar tambem em p_tabelas; ter uma chave para clients
--    que seja "on delete set null" (ou nenhuma); e ter as duas colunas acima,
--    que a funcao preenche antes de apagar o cliente.
--    A versao de cinco parametros cai e a nova tem um default no sexto: o codigo
--    implantado, que chama com cinco argumentos nomeados (e billing_events em
--    p_tabelas), segue funcionando igual ate o deploy.

-- ---------------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------------
alter table public.billing_events
  add column if not exists deleted_client_id uuid,
  add column if not exists deleted_client_name text;

comment on column public.billing_events.deleted_client_id is
  'Id do cliente quando ele foi apagado de vez (admin_apagar_cliente): client_id vira nulo pela chave on delete set null, e este guarda de quem era a linha. Nulo enquanto o cliente existe.';
comment on column public.billing_events.deleted_client_name is
  'Nome do cliente no momento do apagar de vez (admin_apagar_cliente). Nulo enquanto o cliente existe.';

-- ---------------------------------------------------------------------------
-- 2. Apagar de vez com as tabelas mantidas
-- ---------------------------------------------------------------------------
drop function if exists public.admin_apagar_cliente(uuid, uuid, text, text[], integer);

create or replace function public.admin_apagar_cliente(
  p_quem uuid,
  p_client uuid,
  p_nome text,
  p_tabelas text[],
  p_usuarios integer default 0,
  p_mantidas text[] default '{}'::text[]
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c record;
  v_faltando text[];
  v_t text;
  v_n bigint;
  v_contagem jsonb := '{}'::jsonb;
  v_mantidas jsonb := '{}'::jsonb;
begin
  select cl.name, cl.created_at, cl.desativada_em into c
    from public.clients cl
   where cl.id = p_client
   for update;
  if not found then
    return 'nao_encontrado';
  end if;
  if c.desativada_em is null then
    return 'nao_desativado';
  end if;
  if btrim(coalesce(p_nome, '')) is distinct from btrim(c.name) then
    return 'nome_diferente';
  end if;

  if coalesce(p_tabelas, '{}'::text[]) && coalesce(p_mantidas, '{}'::text[]) then
    raise exception 'tabela ao mesmo tempo apagada e mantida: %',
      array_to_string(array(select unnest(p_tabelas) intersect select unnest(p_mantidas)), ', ');
  end if;

  v_faltando := public.admin_tabelas_fora_da_purga(coalesce(p_tabelas, '{}'::text[]) || coalesce(p_mantidas, '{}'::text[]));
  if cardinality(v_faltando) > 0 then
    raise exception 'tabelas com client_id fora da rotina de apagar: %', array_to_string(v_faltando, ', ');
  end if;

  -- As mantidas: conferidas e marcadas ANTES de qualquer delete.
  foreach v_t in array coalesce(p_mantidas, '{}'::text[]) loop
    if not exists (
      select 1
        from pg_class t
        join pg_namespace n on n.oid = t.relnamespace
        join pg_attribute a on a.attrelid = t.oid and a.attname = 'client_id' and a.attnum > 0 and not a.attisdropped
       where n.nspname = 'public' and t.relname = v_t and t.relkind = 'r'
    ) then
      raise exception 'tabela mantida sem client_id: %', v_t;
    end if;
    if exists (
      select 1
        from pg_constraint k
        join pg_class t on t.oid = k.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public'
         and t.relname = v_t
         and k.contype = 'f'
         and k.confrelid = 'public.clients'::regclass
         and k.confdeltype <> 'n'
    ) then
      raise exception 'tabela mantida com chave para clients que nao e on delete set null: %', v_t;
    end if;
    execute format(
      'update public.%I set deleted_client_id = $1, deleted_client_name = $2 where client_id = $1',
      v_t
    ) using p_client, c.name;
    get diagnostics v_n = row_count;
    v_mantidas := v_mantidas || jsonb_build_object(v_t, v_n);
  end loop;

  foreach v_t in array coalesce(p_tabelas, '{}'::text[]) loop
    if not exists (
      select 1
        from pg_class t
        join pg_namespace n on n.oid = t.relnamespace
        join pg_attribute a on a.attrelid = t.oid and a.attname = 'client_id' and a.attnum > 0 and not a.attisdropped
       where n.nspname = 'public' and t.relname = v_t and t.relkind = 'r'
    ) then
      raise exception 'tabela da lista sem client_id: %', v_t;
    end if;
    execute format('delete from public.%I where client_id = $1', v_t) using p_client;
    get diagnostics v_n = row_count;
    v_contagem := v_contagem || jsonb_build_object(v_t, v_n);
  end loop;

  delete from public.clients where id = p_client;

  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (
    p_quem,
    'apagar_cliente',
    p_client::text,
    jsonb_build_object('nome', c.name, 'id', p_client, 'criado_em', c.created_at, 'desativada_em', c.desativada_em),
    jsonb_build_object('linhas', v_contagem, 'mantidas', v_mantidas, 'usuarios_a_apagar', coalesce(p_usuarios, 0))
  );
  return 'ok';
end;
$$;
revoke execute on function public.admin_apagar_cliente(uuid, uuid, text, text[], integer, text[]) from public, anon, authenticated;
grant execute on function public.admin_apagar_cliente(uuid, uuid, text, text[], integer, text[]) to service_role;
