-- Fila de pedidos de ajuda (27/09/2026, decisão do dono): a conversa pode ter
-- mais de um pedido aberto, resolvidos do mais antigo para o mais novo.
drop index if exists public.handoffs_um_aberto;
create index if not exists handoffs_abertos on public.handoffs (client_id, phone, opened_at) where closed_at is null;
