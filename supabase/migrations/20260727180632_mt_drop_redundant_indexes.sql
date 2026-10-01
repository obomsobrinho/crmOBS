-- Redundante: o UNIQUE (client_id, telefone) já cobre esse índice avulso
drop index if exists public.dados_cliente_client_telefone_idx;

-- Legado single-tenant: o composto (client_id, phone, created_at) já cobre buscas por phone
drop index if exists public.chat_messages_phone_idx;
