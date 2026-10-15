-- Central "Clientes" do dono, entrega 2: Financeiro, Vitalicio, bloqueio manual,
-- Desativar/Reativar e Apagar de vez (docs/plano-central-clientes.md).
-- Porque: docs/adr/2026-10-15-vitalicio-replaces-the-beta-switch.md e
-- docs/adr/2026-10-15-two-step-company-deletion.md.
--
-- ADITIVO e compativel com o codigo ja implantado (entrega 1): tres colunas novas
-- e nulas em clients (nenhuma linha muda), funcoes novas so para service_role, e
-- admin_empresas_pagina ganha tres colunas de SAIDA com os mesmos sete
-- parametros (quem chama pela assinatura antiga segue funcionando e ignora as
-- colunas a mais). Nenhum dado real e tocado.
--
-- 1. clients.vitalicio_desde, clients.bloqueado_em, clients.desativada_em: so as
--    funcoes do admin escrevem (gatilho clients_guarda_da_conta). O acesso sai de
--    accessState (lib/billing.ts); a desativacao, de lib/auth.ts.
-- 2. Gatilho: (a) as tres colunas so mudam dentro de uma funcao do admin (que
--    liga app.acao_admin na propria transacao); (b) enquanto a conta e vitalicia,
--    ninguem fora do admin muda subscription_status, trial_ends_at nem grace_until
--    (o webhook do Asaas, por exemplo): os valores antigos ficam e sai um warning.
-- 3. admin_empresas_pagina: as tres colunas na saida e os filtros novos
--    (vitalicio, bloqueado, desativado); os filtros de status excluem quem tem
--    uma das tres marcas, como `situacaoDaConta` (lib/admin-alertas.ts).
-- 4. admin_mudar_conta: UMA funcao, UMA transacao por acao do Financeiro e das
--    Acoes, com a linha em admin_acoes.
-- 5. admin_bloqueados_sem_beta: quantos ficariam bloqueados se BETA_ABERTO fosse
--    desligado hoje. ESPELHA accessState (lib/billing.ts); mudou la, muda aqui.
-- 6. Apagar de vez: admin_usuarios_so_do_cliente, admin_arquivos_do_cliente,
--    admin_registrar_exportacao, admin_exportar_lote e admin_apagar_cliente (que
--    confere no catalogo se toda tabela com client_id esta na lista recebida).

-- ---------------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------------
alter table public.clients add column if not exists vitalicio_desde timestamptz;
alter table public.clients add column if not exists bloqueado_em timestamptz;
alter table public.clients add column if not exists desativada_em timestamptz;

comment on column public.clients.vitalicio_desde is
  'Vitalicio (central do dono): acesso pleno, nunca cobrado, nunca bloqueado por teste, pagamento ou carencia. null = nao. So admin_mudar_conta escreve.';
comment on column public.clients.bloqueado_em is
  'Bloqueio manual do dono do produto (modo leitura, como a assinatura bloqueada; vale mesmo com BETA_ABERTO). null = nao. So admin_mudar_conta escreve.';
comment on column public.clients.desativada_em is
  'Conta desativada pelo dono do produto: IA parada e logins barrados (lib/auth.ts), nada apagado, reversivel. Pre-requisito de admin_apagar_cliente. So admin_mudar_conta escreve.';

create index if not exists clients_vitalicio_nome_id_idx on public.clients (name, id) where vitalicio_desde is not null;
create index if not exists clients_bloqueado_nome_id_idx on public.clients (name, id) where bloqueado_em is not null;
create index if not exists clients_desativada_nome_id_idx on public.clients (name, id) where desativada_em is not null;

-- ---------------------------------------------------------------------------
-- 2. Gatilho de guarda
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
    raise warning 'cliente % e vitalicio: estado de assinatura mantido', old.id;
    new.subscription_status := old.subscription_status;
    new.trial_ends_at := old.trial_ends_at;
    new.grace_until := old.grace_until;
  end if;
  return new;
end;
$$;
revoke execute on function public.clients_guarda_da_conta() from public, anon, authenticated;

drop trigger if exists clients_guarda_da_conta on public.clients;
create trigger clients_guarda_da_conta
  before update on public.clients
  for each row execute function public.clients_guarda_da_conta();

-- ---------------------------------------------------------------------------
-- 3. Lista da central
-- ---------------------------------------------------------------------------
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
    select c.id as e_id, c.name as e_nome, c.account_type as e_tipo, c.billing_plan as e_plano,
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
  select pg.e_id, pg.e_nome, pg.e_tipo, pg.e_plano, pg.e_ligado, pg.e_pub, pg.e_limite,
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

-- ---------------------------------------------------------------------------
-- 4. Acoes do Financeiro e das Acoes: uma funcao, uma transacao, um registro
-- ---------------------------------------------------------------------------
-- Devolve 'ok', 'sem_mudanca' (ja estava assim; nada gravado) ou o motivo da
-- recusa. Nenhuma recusa grava nada.
create or replace function public.admin_mudar_conta(
  p_quem uuid,
  p_client uuid,
  p_acao text,
  p_dias integer default null,
  p_plano text default null
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c record;
  v_agora timestamptz := now();
  v_vitalicio timestamptz;
  v_bloqueado timestamptz;
  v_desativada timestamptz;
  v_teste timestamptz;
  v_plano text;
  v_antes jsonb;
  v_depois jsonb;
begin
  select cl.subscription_status, cl.trial_ends_at, cl.billing_plan, cl.billing_subscription_id,
         cl.vitalicio_desde, cl.bloqueado_em, cl.desativada_em
    into c
    from public.clients cl
   where cl.id = p_client
   for update;
  if not found then
    return 'nao_encontrado';
  end if;

  v_vitalicio := c.vitalicio_desde;
  v_bloqueado := c.bloqueado_em;
  v_desativada := c.desativada_em;
  v_teste := c.trial_ends_at;
  v_plano := c.billing_plan;

  if p_acao = 'vitalicio' then
    if c.vitalicio_desde is not null then return 'sem_mudanca'; end if;
    -- Vitalicio nunca e cobrado: com assinatura no gateway, cancele antes.
    if c.billing_subscription_id is not null then return 'tem_assinatura'; end if;
    v_vitalicio := v_agora;
    v_antes := jsonb_build_object('vitalicio_desde', null);
    v_depois := jsonb_build_object('vitalicio_desde', v_agora);

  elsif p_acao = 'remover_vitalicio' then
    if c.vitalicio_desde is null then return 'sem_mudanca'; end if;
    v_vitalicio := null;
    v_antes := jsonb_build_object('vitalicio_desde', c.vitalicio_desde);
    v_depois := jsonb_build_object('vitalicio_desde', null);

  elsif p_acao = 'estender_teste' then
    if p_dias is null or p_dias < 1 then return 'dias_invalidos'; end if;
    if c.vitalicio_desde is not null then return 'vitalicio'; end if;
    if c.subscription_status <> 'trialing' then return 'nao_em_teste'; end if;
    -- Teste sem prazo nao vence: estender criaria um prazo que nao existe.
    if c.trial_ends_at is null then return 'sem_prazo'; end if;
    -- Conta a partir do que for mais tarde: o fim atual ou agora (teste ja vencido).
    v_teste := greatest(v_agora, c.trial_ends_at) + make_interval(days => p_dias);
    v_antes := jsonb_build_object('trial_ends_at', c.trial_ends_at);
    v_depois := jsonb_build_object('trial_ends_at', v_teste, 'dias', p_dias);

  elsif p_acao = 'mudar_plano' then
    if p_plano is null then return 'plano_invalido'; end if;
    -- Com assinatura no gateway a troca e pela tela de assinatura (muda o valor cobrado).
    if c.billing_subscription_id is not null then return 'tem_assinatura'; end if;
    if c.billing_plan is not distinct from p_plano then return 'sem_mudanca'; end if;
    v_plano := p_plano;
    v_antes := jsonb_build_object('billing_plan', c.billing_plan);
    v_depois := jsonb_build_object('billing_plan', p_plano);

  elsif p_acao = 'bloquear' then
    if c.bloqueado_em is not null then return 'sem_mudanca'; end if;
    v_bloqueado := v_agora;
    v_antes := jsonb_build_object('bloqueado_em', null);
    v_depois := jsonb_build_object('bloqueado_em', v_agora);

  elsif p_acao = 'liberar' then
    if c.bloqueado_em is null then return 'sem_mudanca'; end if;
    v_bloqueado := null;
    v_antes := jsonb_build_object('bloqueado_em', c.bloqueado_em);
    v_depois := jsonb_build_object('bloqueado_em', null);

  elsif p_acao = 'desativar' then
    if c.desativada_em is not null then return 'sem_mudanca'; end if;
    v_desativada := v_agora;
    v_antes := jsonb_build_object('desativada_em', null);
    v_depois := jsonb_build_object('desativada_em', v_agora);

  elsif p_acao = 'reativar' then
    if c.desativada_em is null then return 'sem_mudanca'; end if;
    v_desativada := null;
    v_antes := jsonb_build_object('desativada_em', c.desativada_em);
    v_depois := jsonb_build_object('desativada_em', null);

  else
    return 'acao_invalida';
  end if;

  -- O gatilho clients_guarda_da_conta deixa passar SO este update: a marca e
  -- ligada logo antes e desligada logo depois, dentro desta transacao.
  perform set_config('app.acao_admin', 'on', true);
  update public.clients
     set vitalicio_desde = v_vitalicio,
         bloqueado_em = v_bloqueado,
         desativada_em = v_desativada,
         trial_ends_at = v_teste,
         billing_plan = v_plano,
         billing_updated_at = case when p_acao in ('estender_teste', 'mudar_plano') then v_agora else billing_updated_at end
   where id = p_client;
  perform set_config('app.acao_admin', '', true);

  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (p_quem, p_acao, p_client::text, v_antes, v_depois);
  return 'ok';
end;
$$;
revoke execute on function public.admin_mudar_conta(uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.admin_mudar_conta(uuid, uuid, text, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Aviso do BETA_ABERTO
-- ---------------------------------------------------------------------------
-- ESPELHO de accessState (lib/billing.ts) sem a chave do beta: bloqueia teste
-- vencido (trialing com trial_ends_at <= agora), past_due sem carencia valida
-- (grace_until nulo ou <= agora) e canceled. Fica de fora quem ja nao entra hoje
-- (desativada, bloqueio manual) e quem nunca bloqueia (vitalicio). Uma contagem,
-- nenhuma linha lida para contar.
create or replace function public.admin_bloqueados_sem_beta(p_agora timestamptz default now())
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::int
    from public.clients c
   where c.desativada_em is null
     and c.bloqueado_em is null
     and c.vitalicio_desde is null
     and (
       (c.subscription_status = 'trialing' and c.trial_ends_at is not null and c.trial_ends_at <= p_agora)
       or (c.subscription_status = 'past_due' and (c.grace_until is null or c.grace_until <= p_agora))
       or c.subscription_status = 'canceled'
     );
$$;
revoke execute on function public.admin_bloqueados_sem_beta(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_bloqueados_sem_beta(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Apagar de vez
-- ---------------------------------------------------------------------------
-- Os logins que so pertencem a este cliente (a rotina os apaga depois do banco).
create or replace function public.admin_usuarios_so_do_cliente(p_client uuid)
returns table (user_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select uc.user_id
    from public.user_clients uc
   where uc.client_id = p_client
     and not exists (
       select 1 from public.user_clients o
        where o.user_id = uc.user_id and o.client_id <> p_client
     );
$$;
revoke execute on function public.admin_usuarios_so_do_cliente(uuid) from public, anon, authenticated;
grant execute on function public.admin_usuarios_so_do_cliente(uuid) to service_role;

-- Arquivos do cliente no Storage (todo caminho comeca por "{client_id}/"), em
-- lotes: a rotina remove pela API do Storage e pede o proximo lote.
create or replace function public.admin_arquivos_do_cliente(p_client uuid, p_limite integer default 1000)
returns table (bucket text, nome text)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.bucket_id, o.name
    from storage.objects o
   where o.name like p_client::text || '/%'
   order by o.bucket_id, o.name
   limit greatest(1, least(coalesce(p_limite, 1000), 1000));
$$;
revoke execute on function public.admin_arquivos_do_cliente(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_arquivos_do_cliente(uuid, integer) to service_role;

-- A exportacao LGPD tambem deixa rastro (quem, quando, qual cliente; sem conteudo).
create or replace function public.admin_registrar_exportacao(p_quem uuid, p_client uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nome text;
begin
  select cl.name into v_nome from public.clients cl where cl.id = p_client;
  if not found then
    return false;
  end if;
  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (p_quem, 'exportar_dados', p_client::text, null, jsonb_build_object('nome', v_nome));
  return true;
end;
$$;
revoke execute on function public.admin_registrar_exportacao(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_registrar_exportacao(uuid, uuid) to service_role;

-- Um lote da exportacao: as linhas de UMA tabela com client_id, em ordem da chave
-- primaria, depois de `p_depois` (a chave da ultima linha do lote anterior, um
-- array jsonb). Memoria limitada: o app pede lote a lote e escreve o CSV.
create or replace function public.admin_exportar_lote(
  p_tabela text,
  p_client uuid,
  p_depois jsonb default null,
  p_limite integer default 200
) returns table (chave jsonb, linha jsonb)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_rel regclass;
  v_cols text;
  v_vals text;
  v_chave text;
  v_lim int := greatest(1, least(coalesce(p_limite, 200), 1000));
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

  select string_agg(format('t.%I', a.attname), ', ' order by k.ord),
         string_agg(format('(($2->>%s)::%s)', k.ord - 1, format_type(a.atttypid, a.atttypmod)), ', ' order by k.ord),
         string_agg(format('to_jsonb(t.%I)', a.attname), ', ' order by k.ord)
    into v_cols, v_vals, v_chave
    from pg_index i
    cross join unnest(i.indkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
   where i.indrelid = v_rel and i.indisprimary;
  if v_cols is null then
    raise exception 'tabela sem chave primaria: %', p_tabela;
  end if;

  return query execute format(
    'select jsonb_build_array(%s), to_jsonb(t) from %s t where t.client_id = $1 and ($2 is null or (%s) > (%s)) order by %s limit $3',
    v_chave, v_rel, v_cols, v_vals, v_cols
  ) using p_client, p_depois, v_lim;
end;
$$;
revoke execute on function public.admin_exportar_lote(text, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.admin_exportar_lote(text, uuid, jsonb, integer) to service_role;

-- O banco do cliente, numa transacao: so para conta DESATIVADA e com o nome
-- digitado igual. `p_tabelas` e a lista do app (lib/admin-purga.ts), na ordem de
-- apagar; antes de apagar, o catalogo e conferido: uma tabela com client_id que
-- nao esta na lista ABORTA tudo (tabela nova nunca e esquecida em silencio). O
-- registro em admin_acoes (nome, id, contagens; nenhum conteudo) nao tem chave
-- para clients, entao sobrevive.
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

  select array_agg(t.relname::text order by t.relname) into v_faltando
    from pg_class t
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relkind = 'r'
     and not t.relispartition
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = t.oid and a.attname = 'client_id' and a.attnum > 0 and not a.attisdropped
     )
     and not (t.relname::text = any (coalesce(p_tabelas, '{}'::text[])));
  if v_faltando is not null then
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
