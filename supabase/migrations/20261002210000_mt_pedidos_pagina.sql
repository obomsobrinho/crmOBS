-- PAGINA DE PEDIDOS PAGINADA (auditoria F3, R-07, RT-03 e STRUCT-03;
-- docs/plano-carregamento.md). Antes a pagina baixava todos os abertos e todos
-- os resolvidos de 30 dias, e a cada evento de realtime refazia tres consultas.
-- Agora ha UMA fonte (lib/pedidos-fonte.ts) que chama estas duas funcoes:
-- 10 por vez, busca no banco, a posicao "2 de 3 nesta conversa" calculada
-- sobre a fila inteira (nao so sobre as linhas que chegaram) e as contagens
-- das abas por agregado. security invoker: a RLS de quem chama vale.
--
-- A ORDEM existe em dois lugares (aqui e em lib/pedidos.ts, `ordemAbertos` e
-- `ordemResolvidos`, que reposiciona a linha que o realtime atualizou):
--   abertos: opened_at asc, id asc (quem espera ha mais tempo no topo);
--   resolvidos: closed_at desc, id desc, so dos ultimos 30 dias (p_desde).
-- A BUSCA e a de `casaBuscaPedido` (lib/pedidos.ts): nome (display_name, senao
-- nomewpp, sem o "Voce" de `cleanName`) mais o que foi pedido, sem acento e sem
-- caixa, ou os digitos do telefone (a partir de 2).
--
-- p_id traz UMA linha pelo id, de qualquer aba (a linha que o realtime acabou
-- de mexer, ou o pedido do link do aviso); p_telefone limita a uma conversa
-- (a fila dela, com posicao e total refeitos).
create or replace function public.pedidos_pagina(
  p_client uuid,
  p_aba text default 'abertos',
  p_busca text default null,
  p_fora text[] default '{}',
  p_desde timestamptz default null,
  p_cursor_em timestamptz default null,
  p_cursor_id bigint default null,
  p_id bigint default null,
  p_telefone text default null,
  p_limite int default 10
)
returns table (
  id bigint,
  phone text,
  opened_at timestamptz,
  summary text,
  instruction text,
  closed_at timestamptz,
  closed_how text,
  closed_by uuid,
  nomewpp text,
  display_name text,
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
    -- contam a conversa toda, nao so o que a pagina trouxe.
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
    h.id, h.phone, h.opened_at, h.summary, h.instruction, h.closed_at, h.closed_how, h.closed_by,
    d.nomewpp, d.display_name, fi.f_pos, fi.f_tot
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

-- As contagens das abas (aggregate, nunca linhas). Abertos nao tem janela;
-- resolvidos contam so a partir de p_desde.
create or replace function public.pedidos_contagens(
  p_client uuid,
  p_fora text[] default '{}',
  p_desde timestamptz default null
)
returns table (abertos bigint, resolvidos bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select
    count(*) filter (where h.closed_at is null),
    count(*) filter (where h.closed_at is not null and (p_desde is null or h.closed_at >= p_desde))
  from public.handoffs h
  where h.client_id = p_client
    and not (split_part(h.phone, '@', 1) = any (coalesce(p_fora, '{}')));
end;
$$;

-- Indices da paginacao (so em handoffs). A fila: os abertos do tenant por
-- opened_at; o historico: os resolvidos por closed_at. `handoffs_abertos` (por
-- conversa) continua para a fila da conversa.
create index if not exists handoffs_fila_do_tenant
  on public.handoffs (client_id, opened_at, id) where closed_at is null;
create index if not exists handoffs_resolvidos_do_tenant
  on public.handoffs (client_id, closed_at desc, id desc) where closed_at is not null;

grant execute on function public.pedidos_pagina(uuid, text, text, text[], timestamptz, timestamptz, bigint, bigint, text, int) to authenticated;
grant execute on function public.pedidos_contagens(uuid, text[], timestamptz) to authenticated;
revoke execute on function public.pedidos_pagina(uuid, text, text, text[], timestamptz, timestamptz, bigint, bigint, text, int) from anon, public;
revoke execute on function public.pedidos_contagens(uuid, text[], timestamptz) from anon, public;
