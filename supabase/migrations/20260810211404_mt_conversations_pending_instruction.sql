alter table public.conversations
  add column if not exists pending_instruction text,
  add column if not exists pending_instruction_at timestamptz,
  add column if not exists pending_instruction_by uuid;

grant select (pending_instruction, pending_instruction_at, pending_instruction_by)
  on public.conversations to authenticated;
grant update (pending_instruction, pending_instruction_at, pending_instruction_by)
  on public.conversations to authenticated;

comment on column public.conversations.pending_instruction is
  'Handoff coach: orientacao do operador sobre o que a IA deve responder no proximo turno. Consumida e limpa por /api/agent (via lib/agent-turn). Escrita direta do browser (grant), lida por RLS por tenant.';
