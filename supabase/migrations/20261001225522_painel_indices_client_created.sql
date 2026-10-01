-- R-05 (auditoria 2026-10-01, DATA-01): nao existe indice que sirva
-- `client_id = X order by created_at desc` nem o filtro por janela de data de um
-- tenant. Em chat_messages so ha (client_id, phone, created_at) e (created_at desc)
-- (global, atravessa todos os tenants); em conversation_qualifications so
-- (client_id, phone, created_at desc). Com tabela grande o plano varre o indice
-- global filtrando outros tenants, ou ordena o tenant inteiro, e `authenticated`
-- tem statement_timeout de 8 s.
--
-- Quem usa: painel_janelas / painel_series / painel_verbatim (proxima migration) e
-- qualquer leitura "do tenant, da mais nova para a mais velha".
--
-- ATENCAO AO APLICAR: `create index` simples bloqueia ESCRITA na tabela enquanto
-- constroi. chat_messages e escrita pelo n8n de producao. Hoje a tabela e
-- pequena e a construcao dura milissegundos; se ela crescer muito antes de
-- aplicar, rode cada comando fora de transacao com `create index concurrently`.
--
-- O indice global chat_messages_created_at_idx passa a ser descartavel (nenhuma
-- consulta do app o precisa sem client_id), mas NAO e removido aqui: fora do escopo.

create index if not exists chat_messages_client_created_idx
  on public.chat_messages (client_id, created_at desc);

create index if not exists conversation_qualifications_client_created_idx
  on public.conversation_qualifications (client_id, created_at desc);

-- Parcial para o candidato do verbatim (R-17): so linhas com resposta. O
-- predicado e escrito igual ao da consulta (`coalesce(bot_message, '') <> ''`)
-- para o planejador provar a implicacao.
create index if not exists chat_messages_client_created_bot_idx
  on public.chat_messages (client_id, created_at desc)
  where coalesce(bot_message, '') <> '';
