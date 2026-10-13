-- SOLUCAO DO PEDIDO DE AJUDA (redesenho de Pedidos, aprovado pelo dono em 08/10/2026,
-- docs/adr/2026-10-08-help-request-resolution-is-stored.md).
--
-- POR QUE: a tela montava a frase do desfecho ("Como: ...") a partir de
-- closed_how ('ia' ou 'resolvido'), e "resolvido" juntava duas coisas
-- diferentes: o time fechou e devolveu a IA (rota resolve), ou o time
-- respondeu com as proprias palavras e ficou com a conversa (envio manual com
-- pedidoId). Agora a solucao e uma coluna com lista fechada, gravada no
-- fechamento pelo servidor (fecharPedido, lib/handoffs.ts), com os tres
-- rotulos do dono: orientou_ia = "Orientou IA", time_resolveu = "Time
-- resolveu", time_assumiu = "Time assumiu". A lista e a de lib/solucoes.ts
-- (fonte unica): mudou la, muda aqui.
--
-- Historico: 'ia' vira orientou_ia e 'resolvido' vira time_resolveu. O
-- "resolvido" antigo que veio do envio manual NAO e reclassificado (nada no
-- banco separa os dois; decisao: nunca inventar).
--
-- Ordem: pode ir ANTES do deploy. O app que esta no ar ainda grava closed_how:
-- o gatilho de transicao abaixo preenche a solucao a partir dele enquanto o
-- codigo novo nao sobe (o codigo novo grava solucao e nao toca closed_how).
-- closed_how fica como legado; apagar a coluna e o gatilho e decisao para
-- depois do deploy. pedidos_pagina passa a devolver solucao no lugar de
-- closed_how (o app antigo so perde a frase do desfecho ate o deploy).

alter table public.handoffs
  add column if not exists solucao text;

alter table public.handoffs
  drop constraint if exists handoffs_solucao_valida;
alter table public.handoffs
  add constraint handoffs_solucao_valida check (
    solucao is null or solucao in ('orientou_ia', 'time_resolveu', 'time_assumiu')
  );

update public.handoffs
set solucao = case closed_how
  when 'ia' then 'orientou_ia'
  when 'resolvido' then 'time_resolveu'
end
where solucao is null
  and closed_at is not null
  and closed_how in ('ia', 'resolvido');

-- Gatilho de TRANSICAO: so age quando quem fecha ainda escreve closed_how e
-- nao escreve solucao (o app antigo, ate o deploy). Mesmo mapa do update acima.
create or replace function public.handoffs_solucao_do_legado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.solucao is null and new.closed_how is not null then
    new.solucao := case new.closed_how
      when 'ia' then 'orientou_ia'
      when 'resolvido' then 'time_resolveu'
    end;
  end if;
  return new;
end;
$$;

revoke execute on function public.handoffs_solucao_do_legado() from anon, public;

drop trigger if exists handoffs_solucao_do_legado on public.handoffs;
create trigger handoffs_solucao_do_legado
  before insert or update of closed_how on public.handoffs
  for each row execute function public.handoffs_solucao_do_legado();

-- ---------------------------------------------------------------------------
-- pedidos_pagina: closed_how sai do retorno e entra solucao. Corpo IDENTICO ao
-- de 20261006211419_motivo_do_pedido.sql fora isso. O tipo de retorno muda,
-- entao drop antes do create.
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
    h.id, h.phone, h.opened_at, h.summary, h.instruction, h.closed_at, h.solucao, h.closed_by,
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
