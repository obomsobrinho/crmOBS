-- Central "Clientes", entrega 2, revisao (/simplify). Aditiva e compativel com o
-- codigo implantado (entrega 1): nada que ele chama muda de assinatura; as funcoes
-- trocadas so sao chamadas pelo codigo novo. Porque:
-- docs/adr/2026-10-15-vitalicio-replaces-the-beta-switch.md e
-- docs/adr/2026-10-15-two-step-company-deletion.md.
--
-- 1. clients_guarda_da_conta: com o cliente vitalicio, uma escrita de fora do admin
--    em subscription_status, trial_ends_at ou grace_until FALHA (antes era desfeita
--    em silencio com um warning). O webhook ja nem tenta escrever num vitalicio.
-- 2. admin_apagar_cliente usa admin_tabelas_fora_da_purga (uma conferencia do
--    catalogo so, nao duas copias da mesma consulta).
-- 3. admin_exportar_lote: lotes por um indice que JA existe, (client_id, created_at)
--    ou (client_id, opened_at), mais o id para desempate (p_ordem), com uma segunda
--    passada para as linhas de ordem nula (p_nulos); sem p_ordem, a chave primaria
--    como antes. Nenhum indice novo (criar indice em chat_messages trava a escrita).
--    A versao de quatro parametros cai (so o codigo novo a chamava).
-- 4. admin_arquivos_do_cliente: faixa por balde com o collate "C" do indice
--    (bucket_id, name collate "C"), em vez de like sem indice.
-- 5. Os dois gemeos de accessState em SQL dizem isso no comentario da funcao.

-- ---------------------------------------------------------------------------
-- 1. Gatilho
-- ---------------------------------------------------------------------------
create or replace function public.clients_guarda_da_conta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_admin boolean := coalesce(current_setting('app.acao_admin', true), '') = 'on';
begin
  if not v_admin
     and (new.vitalicio_desde, new.bloqueado_em, new.desativada_em)
         is distinct from (old.vitalicio_desde, old.bloqueado_em, old.desativada_em) then
    raise exception 'vitalicio, bloqueio e desativacao so mudam por admin_mudar_conta'
      using errcode = '42501';
  end if;
  if not v_admin
     and old.vitalicio_desde is not null
     and (new.subscription_status, new.trial_ends_at, new.grace_until)
         is distinct from (old.subscription_status, old.trial_ends_at, old.grace_until) then
    raise exception 'cliente % e vitalicio: o estado da assinatura so muda por admin_mudar_conta', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.clients_guarda_da_conta() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Apagar de vez com UMA conferencia do catalogo
-- ---------------------------------------------------------------------------
create or replace function public.admin_apagar_cliente(
  p_quem uuid,
  p_client uuid,
  p_nome text,
  p_tabelas text[],
  p_usuarios integer default 0
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

  v_faltando := public.admin_tabelas_fora_da_purga(p_tabelas);
  if cardinality(v_faltando) > 0 then
    raise exception 'tabelas com client_id fora da rotina de apagar: %', array_to_string(v_faltando, ', ');
  end if;

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
    jsonb_build_object('linhas', v_contagem, 'usuarios_a_apagar', coalesce(p_usuarios, 0))
  );
  return 'ok';
end;
$$;
revoke execute on function public.admin_apagar_cliente(uuid, uuid, text, text[], integer) from public, anon, authenticated;
grant execute on function public.admin_apagar_cliente(uuid, uuid, text, text[], integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Exportacao por um indice existente
-- ---------------------------------------------------------------------------
drop function if exists public.admin_exportar_lote(text, uuid, jsonb, integer);

-- `p_ordem` (opcional): as colunas da ordem, a primeira coberta por um indice
-- (client_id, <coluna>) que ja existe e a ultima uma coluna unica (id) para
-- desempate. Sem ela, a chave primaria. A chave devolvida e o array dos valores
-- dessas colunas na ultima linha; o proximo lote comeca depois dela.
-- `p_nulos`: a passada das linhas com a primeira coluna NULA (a comparacao de
-- linha as pula), em ordem das colunas restantes.
create function public.admin_exportar_lote(
  p_tabela text,
  p_client uuid,
  p_depois jsonb default null,
  p_limite integer default 2000,
  p_ordem text[] default null,
  p_nulos boolean default false
) returns table (chave jsonb, linha jsonb)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_rel regclass;
  v_cols text[];
  v_tipos text[];
  v_lista text;
  v_vals text;
  v_chave text;
  v_onde text := 't.client_id = $1';
  v_lim int := greatest(1, least(coalesce(p_limite, 2000), 5000));
  v_primeira text;
begin
  select t.oid::regclass into v_rel
    from pg_class t
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = p_tabela
     and t.relkind = 'r'
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = t.oid and a.attname = 'client_id' and a.attnum > 0 and not a.attisdropped
     );
  if v_rel is null then
    raise exception 'tabela sem client_id: %', p_tabela;
  end if;

  if p_ordem is null or cardinality(p_ordem) = 0 then
    select array_agg(a.attname::text order by k.ord), array_agg(format_type(a.atttypid, a.atttypmod) order by k.ord)
      into v_cols, v_tipos
      from pg_index i
      cross join unnest(i.indkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = v_rel and i.indisprimary;
    if v_cols is null then
      raise exception 'tabela sem chave primaria: %', p_tabela;
    end if;
  else
    select array_agg(a.attname::text order by o.ord), array_agg(format_type(a.atttypid, a.atttypmod) order by o.ord)
      into v_cols, v_tipos
      from unnest(p_ordem) with ordinality as o(col, ord)
      join pg_attribute a on a.attrelid = v_rel and a.attname = o.col and a.attnum > 0 and not a.attisdropped;
    if v_cols is null or cardinality(v_cols) <> cardinality(p_ordem) then
      raise exception 'coluna de ordem inexistente em %: %', p_tabela, p_ordem;
    end if;
    v_primeira := format('t.%I', v_cols[1]);
    if p_nulos then
      -- So as linhas de primeira coluna nula, em ordem do resto.
      v_onde := v_onde || ' and ' || v_primeira || ' is null';
      v_cols := v_cols[2:];
      v_tipos := v_tipos[2:];
    else
      v_onde := v_onde || ' and ' || v_primeira || ' is not null';
    end if;
  end if;

  select string_agg(format('t.%I', c), ', ' order by i),
         string_agg(format('(($2->>%s)::%s)', i - 1, v_tipos[i]), ', ' order by i),
         string_agg(format('to_jsonb(t.%I)', c), ', ' order by i)
    into v_lista, v_vals, v_chave
    from unnest(v_cols) with ordinality as u(c, i);

  return query execute format(
    'select jsonb_build_array(%s), to_jsonb(t) from %s t where %s and ($2 is null or (%s) > (%s)) order by %s limit $3',
    v_chave, v_rel, v_onde, v_lista, v_vals, v_lista
  ) using p_client, p_depois, v_lim;
end;
$$;
revoke execute on function public.admin_exportar_lote(text, uuid, jsonb, integer, text[], boolean) from public, anon, authenticated;
grant execute on function public.admin_exportar_lote(text, uuid, jsonb, integer, text[], boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Arquivos do cliente por faixa no indice
-- ---------------------------------------------------------------------------
-- "{id}/" ate "{id}0" em collate "C" ('/' e 0x2F, '0' e 0x30): exatamente os nomes
-- que comecam por "{id}/", pela faixa do indice (bucket_id, name collate "C").
create or replace function public.admin_arquivos_do_cliente(p_client uuid, p_limite integer default 1000)
returns table (bucket text, nome text)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, o.name
    from storage.buckets b
    cross join lateral (
      select x.name
        from storage.objects x
       where x.bucket_id = b.id
         and x.name collate "C" >= (p_client::text || '/') collate "C"
         and x.name collate "C" < (p_client::text || '0') collate "C"
       order by x.name collate "C"
       limit greatest(1, least(coalesce(p_limite, 1000), 1000))
    ) o
   order by b.id, o.name collate "C"
   limit greatest(1, least(coalesce(p_limite, 1000), 1000));
$$;
revoke execute on function public.admin_arquivos_do_cliente(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_arquivos_do_cliente(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Os gemeos de accessState
-- ---------------------------------------------------------------------------
comment on function public.admin_empresas_pagina(date, text, text, uuid, integer, text, uuid) is
  'Lista da central do dono. O filtro p_situacao e GEMEO de accessState (lib/billing.ts): mesma precedencia desativado, bloqueado, vitalicio, status gravado. Mudou la, muda aqui.';
comment on function public.admin_bloqueados_sem_beta(timestamptz) is
  'Quantos clientes ficariam bloqueados sem BETA_ABERTO. GEMEO de accessState (lib/billing.ts) sem a chave do beta, fora desativados e bloqueio manual (cairiaSemBeta, lib/admin-alertas.ts). Mudou la, muda aqui.';
