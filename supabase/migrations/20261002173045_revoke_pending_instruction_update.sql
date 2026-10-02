-- ATENCAO: APLICAR SOMENTE DEPOIS que a rota do front F5 (escrita de
-- conversations.pending_instruction* por service_role) estiver em PRODUCAO.
-- Antes disso o browser ainda escreve essas colunas direto
-- (components/ConversationView.tsx) e esta migration quebraria o "orientar a IA".
--
-- Decisao do dono (2026-10-01): o browser deixa de escrever
-- pending_instruction, pending_instruction_at e pending_instruction_by. Motivo:
-- o texto entra no system prompt como orientacao confiavel do time, e dono e
-- atendente sao o mesmo role de banco, entao nenhum grant por coluna separa os
-- dois (docs/adr/2026-08-22-conversations-column-grants.md). Quem escreve passa
-- a ser uma rota service_role que checa o papel.
--
-- Fica o SELECT (a tela mostra a orientacao pendente) e os demais UPDATEs de
-- coluna (unread_count, assigned_user_id, stage, stage_source, stage_changed_at).
revoke update (pending_instruction, pending_instruction_at, pending_instruction_by)
  on public.conversations from authenticated;

-- Rollback:
--   grant update (pending_instruction, pending_instruction_at, pending_instruction_by)
--     on public.conversations to authenticated;
