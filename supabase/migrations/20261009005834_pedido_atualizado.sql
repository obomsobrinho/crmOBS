-- PEDIDO ATUALIZADO PELO CLIENTE (pedido do dono em 08/10/2026,
-- docs/adr/2026-10-08-open-request-updated-by-new-client-info.md).
--
-- POR QUE: quando o cliente acrescenta informacao a um pedido que ainda esta
-- aberto (pedido "quer saber o prazo de entrega", depois "preciso ate sexta"), o
-- processTurn passa a REESCREVER o resumo desse pedido em vez de deixar o
-- pedido velho. atualizado_em guarda quando isso aconteceu, para a tela dizer
-- "atualizado as HH:MM". NULL = nunca foi atualizado. Atualizar nunca manda
-- aviso no WhatsApp (so pedido novo avisa) e nunca toca pedido fechado.
--
-- Ordem: pode ir ANTES do deploy. A coluna nova e nula e so o codigo novo a
-- escreve; pedidos_pagina ganha a coluna no retorno (o app antigo ignora).
-- Corpo de pedidos_pagina IDENTICO ao de 20261008233757_solucao_do_pedido.sql
-- fora a coluna nova.

alter table public.handoffs
  add column if not exists atualizado_em timestamptz;

drop function if exists public.pedidos_pagina(uuid, text, text, text[], timestamptz, timestamptz, bigint, bigint, text, int, text);

create function public.pedidos_pagina(
  p_client uuid,
  p_aba text default 'abertos',
  p_busca text default null,
  p_fora text[] default '{}',
  p_desde timestamptz default null,
  p_cursor_em timestamptz default null,
  p_cursor_id bigint default null,
  p_id bigint default null,
  p_telefone text default null,
  p_limite int default 10,
  p_motivo text default null
)
returns table (
  id bigint,
  phone text,
  opened_at timestamptz,
  summary text,
  instruction text,
  closed_at timestamptz,
  solucao text,
  atualizado_em timestamptz,
  closed_by uuid,
  nomewpp text,
  display_name text,
  foto_path text,
  motivo text,
  posicao bigint,
  total bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ab boolean := coalesce(p_aba, 'abertos') <> 'resolvidos';
  v_q text := nullif(public.sem_acento(btrim(coalesce(p_busca, ''))), '');
  v_dig text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
begin
  return query
  with fila as (
    -- A fila inteira de abertos do tenant: a posicao e o total de cada pedido
    -- contam a conversa toda, nao so o que a pagina trouxe (nem o filtro).
    select
      f.id as f_id,
      row_number() over (partition by f.phone order by f.opened_at, f.id) as f_pos,
      count(*) over (partition by f.phone) as f_tot
    from public.handoffs f
    where f.client_id = p_client
      and f.closed_at is null
      and not (split_part(f.phone, '@', 1) = any (coalesce(p_fora, '{}')))
  )
  select
    h.id, h.phone, h.opened_at, h.summary, h.instruction, h.closed_at, h.solucao, h.atualizado_em, h.closed_by,
    d.nomewpp, d.display_name, d.foto_path, h.motivo, fi.f_pos, fi.f_tot
  from public.handoffs h
  left join public.dados_cliente d
    on d.client_id = h.client_id and d.telefone = h.phone
  left join fila fi on fi.f_id = h.id
  where h.client_id = p_client
    and not (split_part(h.phone, '@', 1) = any (coalesce(p_fora, '{}')))
    and (
      (p_id is not null and h.id = p_id)
      or (p_id is null and (
            (v_ab and h.closed_at is null)
            or (not v_ab and h.closed_at is not null
                and (p_desde is null or h.closed_at >= p_desde))))
    )
    and (p_telefone is null or h.phone = p_telefone)
    and (p_id is not null or p_motivo is null or h.motivo = p_motivo)
    and (
      p_id is not null
      or v_q is null
      or position(v_q in public.sem_acento(concat_ws(' ',
           coalesce(
             case when lower(btrim(d.display_name)) in ('você', 'voce')
                  then null else nullif(btrim(d.display_name), '') end,
             case when lower(btrim(d.nomewpp)) in ('você', 'voce')
                  then null else nullif(btrim(d.nomewpp), '') end),
           h.summary))) > 0
      or (length(v_dig) >= 2
          and regexp_replace(h.phone, '\D', '', 'g') like '%' || v_dig || '%')
    )
    and (
      p_id is not null
      or p_cursor_id is null
      or (v_ab and (h.opened_at, h.id) > (p_cursor_em, p_cursor_id))
      or (not v_ab and (h.closed_at, h.id) < (p_cursor_em, p_cursor_id))
    )
  order by
    (case when v_ab then h.opened_at end) asc nulls last,
    (case when v_ab then null else h.closed_at end) desc nulls last,
    (case when v_ab then h.id else -h.id end) asc
  limit greatest(1, least(coalesce(p_limite, 10), 50));
end;
$$;

grant execute on function public.pedidos_pagina(uuid, text, text, text[], timestamptz, timestamptz, bigint, bigint, text, int, text) to authenticated;
revoke execute on function public.pedidos_pagina(uuid, text, text, text[], timestamptz, timestamptz, bigint, bigint, text, int, text) from anon, public;
