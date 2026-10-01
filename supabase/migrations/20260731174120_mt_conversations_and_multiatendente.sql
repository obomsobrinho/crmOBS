-- ============================================================
-- Fase 1, fundação: tabela conversations + colunas de mídia/autor
-- em chat_messages + papel em user_clients.
-- A conversations se mantém sozinha por TRIGGER, sem tocar no n8n.
-- ============================================================

-- 1) Colunas novas em chat_messages (nullable = não quebra o n8n)
alter table public.chat_messages
  add column if not exists sender_user_id uuid references auth.users(id) on delete set null,
  add column if not exists media_url text,
  add column if not exists media_type text;

comment on column public.chat_messages.sender_user_id is
  'Atendente humano que enviou a mensagem manual. null = IA ou mensagem recebida.';
comment on column public.chat_messages.media_url is
  'URL do arquivo (Supabase Storage) quando a mensagem tem mídia. null = só texto.';
comment on column public.chat_messages.media_type is
  'image | audio | video | document, quando media_url não é null.';

-- 2) Papel no vínculo usuário<->tenant
alter table public.user_clients
  add column if not exists role text not null default 'atendente'
    check (role in ('dono','atendente'));
-- os vínculos que já existem são os donos das contas
update public.user_clients set role = 'dono';

-- 3) Tabela conversations (uma linha por (tenant, telefone))
create table if not exists public.conversations (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  phone text not null,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_from text,                    -- 'in' (contato) | 'out' (IA/humano)
  unread_count int not null default 0,
  assigned_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open','closed')),
  stage text,                                -- estágio do pipeline (Fase 3); null = fora do pipeline
  created_at timestamptz not null default now(),
  unique (client_id, phone)
);
comment on table public.conversations is
  'Uma conversa por (client_id, phone). Mantida por trigger a partir de chat_messages. Base de não-lidas, atribuição, ordenação do inbox e do pipeline.';

create index if not exists conversations_client_last_msg_idx
  on public.conversations (client_id, last_message_at desc);
create index if not exists conversations_assigned_idx
  on public.conversations (assigned_user_id);

-- 4) Trigger que mantém a conversations em dia a cada mensagem nova.
--    security definer: roda como owner, então funciona tanto para o
--    service_role do n8n quanto para writes do CRM, sem depender de RLS.
--    Mensagens importadas (message_type = 'imported') NÃO contam como não-lidas.
create or replace function public.sync_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text;
  v_from text;
  v_is_unread boolean;
begin
  if new.client_id is null then
    return new;
  end if;

  v_text := coalesce(new.user_message, new.bot_message, '');
  v_from := case when new.user_message is not null then 'in' else 'out' end;
  v_is_unread := new.user_message is not null
                 and new.message_type is distinct from 'imported';

  insert into public.conversations
    (client_id, phone, last_message_at, last_message_preview, last_message_from, unread_count)
  values
    (new.client_id, new.phone, coalesce(new.created_at, now()),
     left(v_text, 140), v_from, case when v_is_unread then 1 else 0 end)
  on conflict (client_id, phone) do update set
    last_message_at      = coalesce(new.created_at, now()),
    last_message_preview = left(v_text, 140),
    last_message_from    = v_from,
    unread_count         = public.conversations.unread_count
                           + (case when v_is_unread then 1 else 0 end);
  return new;
end;
$$;

drop trigger if exists trg_sync_conversation on public.chat_messages;
create trigger trg_sync_conversation
  after insert on public.chat_messages
  for each row execute function public.sync_conversation();

-- 5) Backfill das conversas já existentes (histórico = lido, unread 0)
insert into public.conversations
  (client_id, phone, last_message_at, last_message_preview, last_message_from, unread_count)
select
  t.client_id,
  t.phone,
  t.last_at,
  left(coalesce(t.last_user, t.last_bot, ''), 140),
  case when t.last_user is not null then 'in' else 'out' end,
  0
from (
  select distinct on (client_id, phone)
    client_id, phone,
    created_at as last_at,
    user_message as last_user,
    bot_message as last_bot
  from public.chat_messages
  where client_id is not null
  order by client_id, phone, created_at desc
) t
on conflict (client_id, phone) do nothing;

-- 6) RLS: leitura por tenant; escrita restrita a colunas de estado do inbox
alter table public.conversations enable row level security;

grant select on public.conversations to authenticated;
grant update (unread_count, assigned_user_id, status, stage) on public.conversations to authenticated;

create policy "tenant read conversations" on public.conversations
  for select to authenticated
  using (client_id in (select client_id from public.user_clients where user_id = auth.uid()));

create policy "tenant update conversations" on public.conversations
  for update to authenticated
  using (client_id in (select client_id from public.user_clients where user_id = auth.uid()))
  with check (client_id in (select client_id from public.user_clients where user_id = auth.uid()));

-- 7) Realtime
alter table public.conversations replica identity full;
alter publication supabase_realtime add table public.conversations;
