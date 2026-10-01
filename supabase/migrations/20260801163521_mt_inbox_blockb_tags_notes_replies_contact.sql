-- ===== Tabelas do CRM (donas do CRM: browser faz CRUD via RLS por tenant) =====

-- Rótulos por tenant (paleta reutilizável).
create table if not exists public.tags (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  color text not null default 'gray',
  created_at timestamptz not null default now()
);
create unique index if not exists tags_client_name_uidx on public.tags (client_id, lower(name));

-- Tags aplicadas a uma conversa (N:N conversa <-> tag).
create table if not exists public.conversation_tags (
  client_id uuid not null references public.clients(id) on delete cascade,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  tag_id bigint not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, tag_id)
);

-- Notas internas por conversa (nunca vão para o WhatsApp).
create table if not exists public.conversation_notes (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  author_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists conversation_notes_conv_idx on public.conversation_notes (conversation_id, created_at);

-- Respostas rápidas (mensagens prontas por tenant).
create table if not exists public.quick_replies (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists quick_replies_client_idx on public.quick_replies (client_id);

alter table public.tags enable row level security;
alter table public.conversation_tags enable row level security;
alter table public.conversation_notes enable row level security;
alter table public.quick_replies enable row level security;

grant select, insert, update, delete on
  public.tags, public.conversation_tags, public.conversation_notes, public.quick_replies
  to authenticated;
revoke all on
  public.tags, public.conversation_tags, public.conversation_notes, public.quick_replies
  from anon;

-- ===== Policies (tudo escopado ao tenant do usuário) =====

-- tenant-level: tags e quick_replies
create policy tags_all on public.tags for all to authenticated
  using (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid()))
  with check (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid()));

create policy quick_replies_all on public.quick_replies for all to authenticated
  using (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid()))
  with check (client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid()));

-- conversation-level: valida que a conversa (e a tag) pertencem ao tenant.
create policy conv_tags_all on public.conversation_tags for all to authenticated
  using (
    conversation_id in (
      select c.id from public.conversations c
      where c.client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid())
    )
  )
  with check (
    conversation_id in (
      select c.id from public.conversations c
      where c.client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid())
    )
    and tag_id in (
      select t.id from public.tags t
      where t.client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid())
    )
  );

create policy conv_notes_all on public.conversation_notes for all to authenticated
  using (
    conversation_id in (
      select c.id from public.conversations c
      where c.client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid())
    )
  )
  with check (
    author_user_id = auth.uid()
    and conversation_id in (
      select c.id from public.conversations c
      where c.client_id in (select uc.client_id from public.user_clients uc where uc.user_id = auth.uid())
    )
  );

-- ===== Edição de contato pelo CRM (colunas novas, escrita direta por grant) =====
alter table public.dados_cliente
  add column if not exists display_name text,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

comment on column public.dados_cliente.display_name is
  'Nome do contato editado no CRM. Precede nomewpp (que o n8n sobrescreve com o pushName).';
comment on column public.dados_cliente.custom_fields is
  'Campos personalizados do contato (jsonb chave->valor) editados no CRM.';

-- amplia o grant de coluna (antes só atendimento_ia) para o editor de contato.
grant update (atendimento_ia, display_name, custom_fields) on public.dados_cliente to authenticated;
