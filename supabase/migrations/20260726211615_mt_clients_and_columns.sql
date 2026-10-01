-- Tabela de tenants
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  evolution_instance text unique,
  persona text,
  notify_group_jid text,
  created_at timestamptz not null default now()
);

-- Vínculo usuário <-> cliente (suporta 1+ usuários por cliente)
create table if not exists public.user_clients (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  primary key (user_id, client_id)
);

-- client_id nas tabelas do bot (nullable durante a transição)
alter table public.chat_messages add column if not exists client_id uuid references public.clients(id);
alter table public.dados_cliente add column if not exists client_id uuid references public.clients(id);

-- Índices por tenant
create index if not exists chat_messages_client_phone_created_idx
  on public.chat_messages (client_id, phone, created_at);
create index if not exists dados_cliente_client_telefone_idx
  on public.dados_cliente (client_id, telefone);

-- RLS das novas tabelas
alter table public.clients enable row level security;
alter table public.user_clients enable row level security;

drop policy if exists "user reads own memberships" on public.user_clients;
create policy "user reads own memberships" on public.user_clients
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "user reads own clients" on public.clients;
create policy "user reads own clients" on public.clients
  for select to authenticated
  using (id in (select client_id from public.user_clients where user_id = auth.uid()));
