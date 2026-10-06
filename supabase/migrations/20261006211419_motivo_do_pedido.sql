-- MOTIVO DO PEDIDO DE AJUDA (P1 item 4, aprovado pelo dono em 06/10/2026,
-- docs/plano-motivo-pedido.md).
--
-- POR QUE: o resumo em texto livre diz o que a pessoa pediu, nao POR QUE a IA
-- chamou o time. Com o motivo gravado, a pagina de Pedidos filtra por ele e o
-- Painel do cliente conta os pedidos por motivo (o que ensinar a IA).
--
-- A lista de chaves e a de lib/motivos.ts (fonte unica): mudou la, muda aqui.
-- Pedido antigo fica NULL ("Sem motivo"), decisao do dono: nada e reclassificado.
--
-- Ordem: pode ir ANTES do deploy. Os parametros novos tem default, entao o app
-- que ja esta no ar continua chamando as funcoes como hoje; a coluna nova so e
-- lida pelo codigo novo.

alter table public.handoffs
  add column if not exists motivo text;

alter table public.handoffs
  drop constraint if exists handoffs_motivo_valido;
alter table public.handoffs
  add constraint handoffs_motivo_valido check (
    motivo is null or motivo in (
      'pessoa', 'preco', 'falta_info', 'fechar', 'reclamacao',
      'urgencia', 'fora_escopo', 'manipulacao', 'seguranca'
    )
  );

-- O filtro por motivo na pagina de Pedidos le um indice por aba, na mesma ordem
-- da lista (keyset), em vez de varrer a fila do tenant procurando o motivo.
create index if not exists handoffs_fila_por_motivo
  on public.handoffs (client_id, motivo, opened_at, id)
  where closed_at is null;
create index if not exists handoffs_resolvidos_por_motivo
  on public.handoffs (client_id, motivo, closed_at desc, id desc)
  where closed_at is not null;

-- ---------------------------------------------------------------------------
-- pedidos_pagina: + p_motivo (filtro) e + motivo (coluna). Corpo IDENTICO ao de
-- 20261002162907_pedidos_pagina_foto.sql fora isso. O tipo de retorno muda, entao
-- drop antes do create.
drop function if exists public.pedidos_pagina(uuid, text, text, text[], timestamptz, timestamptz, bigint, bigint, text, int);

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
  closed_how text,
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
    h.id, h.phone, h.opened_at, h.summary, h.instruction, h.closed_at, h.closed_how, h.closed_by,
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

-- ---------------------------------------------------------------------------
-- pedidos_contagens: + p_motivo, para os numeros das abas seguirem o filtro
-- (a aba dizer 5 e a lista filtrada mostrar 2 seria a tela mentindo).
drop function if exists public.pedidos_contagens(uuid, text[], timestamptz);

create function public.pedidos_contagens(
  p_client uuid,
  p_fora text[] default '{}',
  p_desde timestamptz default null,
  p_motivo text default null
)
returns table (abertos bigint, resolvidos bigint)
language plpgsql
stable
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
    and not (split_part(h.phone, '@', 1) = any (coalesce(p_fora, '{}')))
    and (p_motivo is null or h.motivo = p_motivo);
end;
$$;

grant execute on function public.pedidos_contagens(uuid, text[], timestamptz, text) to authenticated;
revoke execute on function public.pedidos_contagens(uuid, text[], timestamptz, text) from anon, public;

-- ---------------------------------------------------------------------------
-- painel_motivos: quantos pedidos de ajuda ABRIRAM em cada janela, por motivo.
-- Devolve no maximo (janelas x 10) linhas pequenas, nunca as linhas de handoffs
-- (o Max rows de 1000 do PostgREST nao corta nada). As janelas sao as de
-- lib/periodo.ts, [de, ate), como em painel_janelas. Motivo NULL volta como NULL
-- ("Sem motivo" na tela). O numero de avisos nunca e cliente (p_fora).
create index if not exists handoffs_abertura_do_tenant
  on public.handoffs (client_id, opened_at);

create or replace function public.painel_motivos(
  p_client uuid,
  p_fora text[] default '{}',
  p_de timestamptz[] default '{}',
  p_ate timestamptz[] default '{}'
)
returns table (janela int, motivo text, n int)
language sql
stable
security invoker
set search_path = ''
as $$
  select j.i::int, h.motivo, count(*)::int
  from generate_subscripts(p_de, 1) as j(i)
  join public.handoffs h
    on h.client_id = p_client
   and h.opened_at >= p_de[j.i]
   and h.opened_at < p_ate[j.i]
   and not (split_part(h.phone, '@', 1) = any (coalesce(p_fora, '{}')))
  group by j.i, h.motivo;
$$;

grant execute on function public.painel_motivos(uuid, text[], timestamptz[], timestamptz[]) to authenticated;
revoke execute on function public.painel_motivos(uuid, text[], timestamptz[], timestamptz[]) from anon, public;
