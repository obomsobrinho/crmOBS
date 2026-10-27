-- Central "Clientes" do dono, 27/10/2026: um icone em cada cliente da lista quando ha pedido de
-- ajuda (handoffs) em aberto, com quantos sao e ha quanto tempo o mais antigo espera. Regra do
-- dono: um pedido aberto ja mostra (nenhum outro limite).
-- Aditivo e so service_role: nenhuma funcao existente muda, e admin_empresas_pagina fica como esta.
--
-- admin_pedidos_abertos: para os clientes de UMA pagina da lista (no maximo 50 ids, o resto e
-- ignorado), quantos pedidos estao abertos (closed_at is null) e o opened_at do mais antigo.
-- Cliente sem pedido aberto nao volta linha. Agregado no banco pelo indice parcial
-- handoffs_fila_do_tenant (client_id, opened_at, id) where closed_at is null; uma chamada por
-- pagina, nunca uma por cliente.

create or replace function public.admin_pedidos_abertos(
  p_clients uuid[]
) returns table (client_id uuid, abertos integer, mais_antigo timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select h.client_id, count(*)::integer, min(h.opened_at)
  from public.handoffs h
  where h.client_id = any (p_clients[1:50])
    and h.closed_at is null
  group by h.client_id;
$$;
revoke execute on function public.admin_pedidos_abertos(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_pedidos_abertos(uuid[]) to service_role;
