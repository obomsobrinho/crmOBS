-- Aperta o UPDATE de conversations: sai o grant de TABELA e entra grant por
-- COLUNA, só nas que o browser realmente escreve.
--
-- Antes: authenticated tinha UPDATE na tabela inteira e a policy só checava o
-- tenant, sem restricao de coluna e sem checagem de papel. Efeito: qualquer
-- membro, inclusive atendente, podia escrever QUALQUER coluna de conversations
-- do proprio tenant direto do browser. Nao era vazamento entre tenants (a RLS
-- segura), era falta de separacao dentro do tenant.
--
-- O que isso protege de verdade:
--   handoff_at  -> limpar fazia a conversa sair do filtro "Precisa de voce".
--                  Passa a ser so service_role: abre no /api/agent, limpa no
--                  /api/send, que e onde ela sempre deveria ter morado.
--   status, last_message_*, phone, client_id -> ninguem escreve pelo browser,
--                  e agora nao pode por acidente.
--
-- O que NAO da para resolver com grant: separar dono de atendente por coluna.
-- Os dois sao o mesmo papel de banco (authenticated), entao isso exigiria
-- trigger ou mover o write para uma rota service_role. Decisao pendente do dono
-- do produto; stage_source e pending_instruction seguem abertos a qualquer
-- membro do tenant.

revoke update on public.conversations from authenticated;
revoke update on public.conversations from anon;

grant update (
  unread_count,          -- marcar como lida (ConversationView)
  assigned_user_id,      -- atribuir a conversa (ConversationView)
  stage,                 -- arrastar o card (PipelineBoard)
  stage_source,          -- quem moveu: human
  stage_changed_at,
  pending_instruction,   -- handoff coach (ConversationView)
  pending_instruction_at,
  pending_instruction_by
) on public.conversations to authenticated;

comment on column public.conversations.handoff_at is
  'Primeiro handoff em aberto (o que da a espera real, "esperando ha 6h"). Aberto pelo /api/agent e limpo pelo POST /api/send, os dois service_role. SEM grant de UPDATE para authenticated de proposito: o browser limpando isso escondia a conversa do filtro "Precisa de voce".';
