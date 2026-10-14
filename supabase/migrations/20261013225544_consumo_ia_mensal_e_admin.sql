-- P1 item 6: uso de IA por empresa com teto mensal em TOKENS (docs/plano-custo-ia.md,
-- aprovado pelo dono em 13/10/2026). O beta e pago pelo dono: cada resposta da IA
-- em cada empresa sai da conta OpenAI dele, e ninguem via quanto cada uma gastava.
-- Porque: docs/adr/2026-10-13-ai-usage-cap-in-tokens.md.
--
-- 1. clients.ia_limite_tokens: teto do mes por empresa (null = o padrao do codigo,
--    LIMITE_PADRAO_TOKENS em lib/custo-ia.ts). Escrito so pela rota do admin
--    (service_role); nenhum grant de coluna ao navegador.
-- 2. consumo_ia_mensal: contador por empresa e mes civil de Sao Paulo, somado por
--    turno dentro do logTurn (somar_consumo_ia, um upsert atomico). A checagem do
--    turno e uma leitura pela chave primaria, nunca uma soma sobre agent_turns.
-- 3. consumo_ia_avisos: cada aviso (80% e 100%) sai uma vez por empresa, mes e
--    nivel; quem consegue inserir a linha e quem manda (marcar_aviso_consumo).
-- 4. admin_acoes: registro de toda acao do admin (quem, o que, alvo, antes, depois).
-- 5. admin_empresas_pagina: a lista de Empresas do /admin, 10 por vez, por nome,
--    com busca por trigram na mesma expressao do indice.
-- Tudo service_role: RLS ligada sem policy, nada para anon nem authenticated.

-- ---------------------------------------------------------------------------
-- 1. Teto por empresa
-- ---------------------------------------------------------------------------
alter table public.clients add column if not exists ia_limite_tokens bigint;
alter table public.clients drop constraint if exists clients_ia_limite_tokens_positivo;
alter table public.clients
  add constraint clients_ia_limite_tokens_positivo check (ia_limite_tokens is null or ia_limite_tokens > 0);
comment on column public.clients.ia_limite_tokens is
  'Teto de tokens de IA por mes civil de Sao Paulo (entrada + saida). null = o padrao do codigo (lib/custo-ia.ts). Escrito so pelo admin (service_role).';
revoke all (ia_limite_tokens) on public.clients from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Contador do mes
-- ---------------------------------------------------------------------------
create table if not exists public.consumo_ia_mensal (
  client_id uuid not null references public.clients (id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  tokens_entrada bigint not null default 0 check (tokens_entrada >= 0),
  tokens_cache bigint not null default 0 check (tokens_cache >= 0),
  tokens_saida bigint not null default 0 check (tokens_saida >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (client_id, mes)
);
comment on table public.consumo_ia_mensal is
  'Tokens de IA por empresa e mes (America/Sao_Paulo). tokens_entrada inclui os do cache (tokens_cache e a parte cacheada, so para o custo). Somado por somar_consumo_ia no logTurn.';
alter table public.consumo_ia_mensal enable row level security;
revoke all on public.consumo_ia_mensal from anon, authenticated;
grant select, insert, update, delete on public.consumo_ia_mensal to service_role;

-- Soma atomica de um turno. Devolve o total do mes ja somado (o processTurn decide
-- os avisos por ele). Valores negativos ou nulos contam como zero.
create or replace function public.somar_consumo_ia(
  p_client uuid,
  p_mes date,
  p_entrada bigint,
  p_cache bigint,
  p_saida bigint
) returns table (tokens_entrada bigint, tokens_cache bigint, tokens_saida bigint)
language sql
security invoker
set search_path = ''
as $$
  insert into public.consumo_ia_mensal as c (client_id, mes, tokens_entrada, tokens_cache, tokens_saida)
  values (
    p_client,
    p_mes,
    greatest(coalesce(p_entrada, 0), 0),
    greatest(coalesce(p_cache, 0), 0),
    greatest(coalesce(p_saida, 0), 0)
  )
  on conflict (client_id, mes) do update
     set tokens_entrada = c.tokens_entrada + excluded.tokens_entrada,
         tokens_cache = c.tokens_cache + excluded.tokens_cache,
         tokens_saida = c.tokens_saida + excluded.tokens_saida,
         atualizado_em = now()
  returning c.tokens_entrada, c.tokens_cache, c.tokens_saida;
$$;
revoke execute on function public.somar_consumo_ia(uuid, date, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.somar_consumo_ia(uuid, date, bigint, bigint, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Avisos uma vez por empresa, mes e nivel
-- ---------------------------------------------------------------------------
create table if not exists public.consumo_ia_avisos (
  client_id uuid not null references public.clients (id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  nivel text not null check (nivel in ('aviso', 'parado')),
  enviado_em timestamptz not null default now(),
  primary key (client_id, mes, nivel)
);
comment on table public.consumo_ia_avisos is
  'Aviso de uso de IA ja disparado (aviso = 80%, parado = 100%). Uma linha por empresa, mes e nivel: quem insere manda.';
alter table public.consumo_ia_avisos enable row level security;
revoke all on public.consumo_ia_avisos from anon, authenticated;
grant select, insert, delete on public.consumo_ia_avisos to service_role;

-- true so para quem inseriu agora (insert ... on conflict do nothing).
create or replace function public.marcar_aviso_consumo(
  p_client uuid,
  p_mes date,
  p_nivel text
) returns boolean
language sql
security invoker
set search_path = ''
as $$
  with feito as (
    insert into public.consumo_ia_avisos (client_id, mes, nivel)
    values (p_client, p_mes, p_nivel)
    on conflict (client_id, mes, nivel) do nothing
    returning 1
  )
  select exists (select 1 from feito);
$$;
revoke execute on function public.marcar_aviso_consumo(uuid, date, text) from public, anon, authenticated;
grant execute on function public.marcar_aviso_consumo(uuid, date, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Registro das acoes do admin (so acrescenta)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_acoes (
  id bigint generated always as identity primary key,
  quem uuid not null,
  acao text not null,
  alvo text,
  antes jsonb,
  depois jsonb,
  em timestamptz not null default now()
);
comment on table public.admin_acoes is
  'Toda acao do admin (/admin): quem (auth.users.id), acao, alvo, valor antes e depois. Append-only, service_role.';
create index if not exists admin_acoes_em_idx on public.admin_acoes (em desc);
alter table public.admin_acoes enable row level security;
revoke all on public.admin_acoes from anon, authenticated;
grant select, insert on public.admin_acoes to service_role;

-- ---------------------------------------------------------------------------
-- 5. Lista de Empresas do admin
-- ---------------------------------------------------------------------------
create index if not exists clients_nome_id_idx on public.clients (name, id);
create index if not exists clients_nome_trgm
  on public.clients using gin (public.sem_acento(name) gin_trgm_ops);

-- 10 por vez em ordem de nome (keyset por nome e id). O consumo do mes e a ultima
-- atividade (ultimo turno do agente, inclusive bancada) entram so DEPOIS do limite.
create or replace function public.admin_empresas_pagina(
  p_mes date,
  p_busca text default null,
  p_cursor_nome text default null,
  p_cursor_id uuid default null,
  p_limite integer default 10
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
  ultima_atividade timestamptz
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
begin
  return query
  with pg as (
    select c.id as e_id, c.name as e_nome, c.account_type as e_tipo, c.billing_plan as e_plano,
      c.agent_enabled as e_ligado, c.agent_published_at as e_pub, c.ia_limite_tokens as e_limite
    from public.clients c
    where (v_q is null or public.sem_acento(c.name) like '%' || v_q || '%')
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
      limit 1)
  from pg
  left join public.consumo_ia_mensal m on m.client_id = pg.e_id and m.mes = p_mes
  order by pg.e_nome, pg.e_id;
end;
$$;
revoke execute on function public.admin_empresas_pagina(date, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_empresas_pagina(date, text, text, uuid, integer) to service_role;
