-- Fase 3: rastrear QUEM definiu o stage atual da conversa.
-- 'human' = um atendente arrastou o card no board; 'ia' = /api/agent moveu.
-- A IA (Bloco B) só avança estágios canônicos e NUNCA sobrescreve um stage
-- marcado como 'human'. null = nunca teve stage explícito (conversa nova).
alter table public.conversations
  add column if not exists stage_source text,
  add column if not exists stage_changed_at timestamptz;

alter table public.conversations
  drop constraint if exists conversations_stage_source_check;
alter table public.conversations
  add constraint conversations_stage_source_check
  check (stage_source is null or stage_source in ('ia','human'));

-- O board (browser, role authenticated) precisa escrever essas colunas ao mover
-- o card. O grant de UPDATE em conversations já é a nível de tabela, mas deixo
-- explícito para as colunas novas (idempotente).
grant update (stage, stage_source, stage_changed_at) on public.conversations to authenticated;

comment on column public.conversations.stage_source is
  'Quem definiu o stage atual: human (atendente arrastou o card) ou ia (/api/agent). A IA nunca sobrescreve um stage human.';
comment on column public.conversations.stage_changed_at is
  'Quando o stage mudou pela última vez (board ou IA).';
