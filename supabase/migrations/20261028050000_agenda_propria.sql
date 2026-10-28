-- Agenda propria, 28/10/2026 (docs/plano-agenda.md, docs/adr/2026-10-28-own-agenda-slots-in-prompt.md).
-- Decisao do dono: a fonte de verdade e a nossa agenda, nao o Google. Minima: um agenda por
-- tenant, servicos com duracao, bloqueios e agendamentos. A conta de horario livre mora em
-- lib/agenda.ts; aqui so o que o banco precisa garantir.
--
-- NAO APLICADA. Escrita numa madrugada sem o dono; aplicar so com o OK dele (supabase/README.md).
--
-- Escrita: so rotas do servidor e o cerebro (service_role). Leitura: membros do tenant, por RLS.
-- Dois agendamentos confirmados do mesmo tenant nunca se sobrepoem: exclusion constraint com
-- btree_gist (o codigo tambem confere, mas a garantia e do banco, inclusive entre duas conversas
-- marcando no mesmo segundo).

create extension if not exists btree_gist with schema extensions;

-- Configuracao (null = agenda nunca configurada, desligada). Normalizada por
-- normalizarConfigDaAgenda (lib/agenda.ts). Escrita so pela rota do dono (service_role).
alter table public.clients add column if not exists agenda_config jsonb;

create table public.agenda_servicos (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  duracao_min integer not null check (duracao_min between 5 and 480),
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index agenda_servicos_do_tenant on public.agenda_servicos (client_id, ordem, id);

create table public.agenda_bloqueios (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text check (motivo is null or char_length(motivo) <= 120),
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint agenda_bloqueios_periodo check (fim > inicio)
);
create index agenda_bloqueios_do_tenant on public.agenda_bloqueios (client_id, fim);

create table public.agendamentos (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Liga ao contato por dados_cliente.telefone no mesmo tenant (sem FK, como chat_messages).
  phone text not null,
  nome text,
  servico_id bigint references public.agenda_servicos(id) on delete set null,
  servico_nome text not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'confirmado' check (status in ('confirmado', 'cancelado')),
  origem text not null check (origem in ('ia', 'time')),
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  cancelado_em timestamptz,
  cancelado_por text check (cancelado_por in ('cliente', 'time')),
  remarcado_de bigint references public.agendamentos(id) on delete set null,
  constraint agendamentos_periodo check (fim > inicio),
  -- Cancelamento coerente: a data existe exatamente quando esta cancelado.
  constraint agendamentos_cancelamento_coerente check (
    (status = 'cancelado') = (cancelado_em is not null)
  ),
  constraint agendamentos_sem_sobreposicao exclude using gist (
    client_id with =,
    tstzrange(inicio, fim) with &&
  ) where (status = 'confirmado')
);
-- Lista da tela (dia/semana, keyset por inicio, id) e os futuros de um contato no turno.
create index agendamentos_do_tenant on public.agendamentos (client_id, inicio, id);
create index agendamentos_do_contato on public.agendamentos (client_id, phone, inicio)
  where status = 'confirmado';

alter table public.agenda_servicos enable row level security;
alter table public.agenda_bloqueios enable row level security;
alter table public.agendamentos enable row level security;

create policy agenda_servicos_leitura_do_tenant on public.agenda_servicos
  for select to authenticated
  using (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid())));
create policy agenda_bloqueios_leitura_do_tenant on public.agenda_bloqueios
  for select to authenticated
  using (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid())));
create policy agendamentos_leitura_do_tenant on public.agendamentos
  for select to authenticated
  using (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid())));

revoke all on public.agenda_servicos, public.agenda_bloqueios, public.agendamentos from anon, authenticated;
grant select on public.agenda_servicos, public.agenda_bloqueios, public.agendamentos to authenticated;
grant all on public.agenda_servicos, public.agenda_bloqueios, public.agendamentos to service_role;

-- A tela atualiza UMA linha por evento (useCanalTenant). Sem isto o handler fica mudo.
alter table public.agendamentos replica identity full;
alter publication supabase_realtime add table public.agendamentos;
