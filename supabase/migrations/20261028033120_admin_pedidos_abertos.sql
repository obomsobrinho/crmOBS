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

-- admin_pedidos_do_cliente: o bloco "Pedidos em aberto" do detalhe de UM cliente na central. TODOS
-- os pedidos abertos, sem periodo (pedido aberto sempre tem de ser resolvido), do mais antigo ao mais
-- novo, uma pagina por vez (keyset por opened_at e id, o mesmo indice parcial handoffs_fila_do_tenant).
-- O nome do contato (dados_cliente, chave unica client_id + telefone) entra so DEPOIS do limite.
-- p_limite vai de 1 a 50 (padrao 10). p_fora: as grafias do numero de avisos (grafiasDoNumeroDeAvisos,
-- lib/avisos.ts), que nunca e conversa.
create or replace function public.admin_pedidos_do_cliente(
  p_client uuid,
  p_cursor_em timestamptz default null,
  p_cursor_id bigint default null,
  p_limite integer default 10,
  p_fora text[] default '{}'
) returns table (
  id bigint,
  phone text,
  opened_at timestamptz,
  motivo text,
  summary text,
  nomewpp text,
  display_name text
)
language sql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
  with pagina as (
    select h.id, h.phone, h.opened_at, h.motivo, h.summary
    from public.handoffs h
    where h.client_id = p_client
      and h.closed_at is null
      and (p_cursor_em is null or (h.opened_at, h.id) > (p_cursor_em, p_cursor_id))
      and not (split_part(h.phone, '@', 1) = any (coalesce(p_fora, '{}')))
    order by h.opened_at, h.id
    limit least(greatest(coalesce(p_limite, 10), 1), 50)
  )
  select p.id, p.phone, p.opened_at, p.motivo, p.summary, d.nomewpp, d.display_name
  from pagina p
  left join public.dados_cliente d on d.client_id = p_client and d.telefone = p.phone
  order by p.opened_at, p.id;
$$;
revoke execute on function public.admin_pedidos_do_cliente(uuid, timestamptz, bigint, integer, text[]) from public, anon, authenticated;
grant execute on function public.admin_pedidos_do_cliente(uuid, timestamptz, bigint, integer, text[]) to service_role;

-- admin_pedidos_por_motivo: o topo do bloco "Pedidos em aberto" (o que o dono leva para a conversa com o
-- cliente): quantos abertos por motivo (lib/motivos.ts; nulo = pedido de antes do motivo) e o mais antigo
-- de cada um. TODOS os abertos, sem periodo. Agregado pelo indice parcial handoffs_fila_por_motivo
-- (client_id, motivo, opened_at, id) where closed_at is null. Os motivos sao poucos (um check no banco),
-- entao a resposta e pequena. p_fora: as grafias do numero de avisos, como na lista.
create or replace function public.admin_pedidos_por_motivo(
  p_client uuid,
  p_fora text[] default '{}'
) returns table (motivo text, abertos integer, mais_antigo timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select h.motivo, count(*)::integer, min(h.opened_at)
  from public.handoffs h
  where h.client_id = p_client
    and h.closed_at is null
    and not (split_part(h.phone, '@', 1) = any (coalesce(p_fora, '{}')))
  group by h.motivo;
$$;
revoke execute on function public.admin_pedidos_por_motivo(uuid, text[]) from public, anon, authenticated;
grant execute on function public.admin_pedidos_por_motivo(uuid, text[]) to service_role;
