-- Paginacao por cursor e busca no servidor (docs/plano-carregamento.md, fase 0).
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Busca sem acento e sem caixa, igual a `normalizar` de lib/clientes.ts.
-- IMMUTABLE com o dicionario explicito, senao nao pode ir em indice.
create or replace function public.sem_acento(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))) $$;

-- Lista de conversas: pagina por (last_message_at, id) dentro do tenant.
drop index if exists public.conversations_client_last_msg_idx;
create index if not exists conversations_client_ultima_id_idx
  on public.conversations (client_id, last_message_at desc nulls last, id desc);

-- Busca no conteudo das mensagens (ilike '%x%').
create index if not exists chat_messages_user_message_trgm
  on public.chat_messages using gin (public.sem_acento(user_message) extensions.gin_trgm_ops);
create index if not exists chat_messages_bot_message_trgm
  on public.chat_messages using gin (public.sem_acento(bot_message) extensions.gin_trgm_ops);

-- Busca de contatos por nome, e-mail e telefone.
create index if not exists dados_cliente_busca_trgm
  on public.dados_cliente using gin (
    public.sem_acento(coalesce(display_name, '') || ' ' || coalesce(nomewpp, '') || ' ' || coalesce(email, '') || ' ' || telefone)
    extensions.gin_trgm_ops
  );

-- Chaves estrangeiras sem indice (lint unindexed_foreign_keys) que as listas usam.
create index if not exists conversation_tags_tag_idx on public.conversation_tags (tag_id);
create index if not exists conversation_tags_client_idx on public.conversation_tags (client_id);
create index if not exists user_clients_client_idx on public.user_clients (client_id);
