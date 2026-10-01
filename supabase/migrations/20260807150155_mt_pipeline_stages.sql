-- Fase 3 / Bloco 0: estágios de pipeline POR TENANT.
-- Espelha o padrão das tabelas próprias do CRM (tags): tabela compartilhada +
-- client_id + RLS por tenant. Diferença: a GESTÃO dos estágios é dono-only
-- (o board/mover card continua liberado a qualquer membro via conversations.stage).

create table if not exists public.pipeline_stages (
  id           bigint generated always as identity primary key,
  client_id    uuid not null references public.clients(id) on delete cascade,
  key          text not null,      -- slug estável; conversations.stage e a IA referenciam isto
  name         text not null,      -- rótulo exibido (renomeável sem quebrar o key)
  position     integer not null default 0,
  is_canonical boolean not null default false, -- estágio que a IA pode setar sozinha
  is_default   boolean not null default false, -- onde conversa nova (stage null) aparece
  archived     boolean not null default false,
  color        text not null default 'gray',
  created_at   timestamptz not null default now(),
  unique (client_id, key)
);

comment on table public.pipeline_stages is
  'Estágios do pipeline (funil) por tenant. Board Kanban. RLS por tenant: leitura por membro, CRUD (gestão) só dono. conversations.stage referencia (client_id, key). Escrita normal por browser (authenticated); a IA (service_role em /api/agent) só avança estágios is_canonical.';
comment on column public.pipeline_stages.key is
  'Slug estável do estágio (ex.: novo). conversations.stage guarda este valor. Não muda ao renomear.';
comment on column public.pipeline_stages.is_canonical is
  'true = estágio que a IA pode setar sozinha (novo/qualificado/aguardando_humano). A IA só avança (position maior) e nunca sobrescreve estágio manual.';
comment on column public.pipeline_stages.is_default is
  'true = coluna onde a conversa nova (conversations.stage null) é exibida. Exatamente um por tenant.';

-- Exatamente um default por tenant (e default nunca arquivado).
create unique index if not exists pipeline_stages_one_default
  on public.pipeline_stages (client_id) where is_default;

-- Ordenação do board.
create index if not exists pipeline_stages_client_pos
  on public.pipeline_stages (client_id, position);

-- conversations.stage passa a referenciar a chave do estágio do MESMO tenant.
-- MATCH SIMPLE (padrão): com stage null a FK não é checada (conversa "nova" =
-- coluna default). Sem ON DELETE: excluir estágio em uso é bloqueado -> a UI
-- arquiva em vez de excluir.
create index if not exists conversations_client_stage
  on public.conversations (client_id, stage);

alter table public.conversations
  add constraint conversations_stage_fkey
  foreign key (client_id, stage)
  references public.pipeline_stages (client_id, key);

-- RLS no padrão da casa.
alter table public.pipeline_stages enable row level security;

-- Leitura: qualquer membro do tenant (board precisa das colunas).
create policy "tenant read pipeline_stages"
  on public.pipeline_stages for select to authenticated
  using (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid()));

-- Gestão (criar/renomear/reordenar/arquivar): só o dono do tenant.
create policy "owner insert pipeline_stages"
  on public.pipeline_stages for insert to authenticated
  with check (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid() and uc.role = 'dono'));
create policy "owner update pipeline_stages"
  on public.pipeline_stages for update to authenticated
  using (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid() and uc.role = 'dono'))
  with check (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid() and uc.role = 'dono'));
create policy "owner delete pipeline_stages"
  on public.pipeline_stages for delete to authenticated
  using (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid() and uc.role = 'dono'));

grant select, insert, update, delete on public.pipeline_stages to authenticated;

-- Seed do funil default para os tenants existentes (idempotente).
-- Canônicos (a IA avança): novo (default) -> qualificado -> aguardando_humano.
-- Manual: fechado (só humano move). Rótulos em linguagem de dono.
insert into public.pipeline_stages (client_id, key, name, position, is_canonical, is_default, color)
select c.id, v.key, v.name, v.position, v.is_canonical, v.is_default, v.color
from public.clients c
cross join (values
  ('novo',              'Novo',                    0, true,  true,  'blue'),
  ('qualificado',       'Qualificado',             1, true,  false, 'violet'),
  ('aguardando_humano', 'Aguardando atendimento',  2, true,  false, 'amber'),
  ('fechado',           'Fechado',                 3, false, false, 'green')
) as v(key, name, position, is_canonical, is_default, color)
on conflict (client_id, key) do nothing;
