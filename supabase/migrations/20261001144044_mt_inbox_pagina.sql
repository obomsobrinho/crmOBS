-- LISTA DE CONVERSAS PAGINADA (docs/plano-carregamento.md, fase 1).
-- SECURITY INVOKER: a RLS de quem chama vale (so o tenant dele). O p_client
-- e redundante com a RLS de proposito: e ele que faz o indice
-- (client_id, last_message_at desc, id desc) trabalhar.
--
-- Ordem: grupo (so na lista inteira sem busca: 0 = pedido aberto, 1 = time,
-- 2 = IA), depois a mensagem mais recente, depois o id. O cursor e a ultima
-- linha entregue (grupo, last_message_at, id).
create or replace function public.inbox_pagina(
  p_client uuid,
  p_inicio timestamptz default null,
  p_filtro text default 'all',
  p_eu uuid default null,
  p_busca text default null,
  p_fora text[] default '{}',
  p_telefone text default null,
  p_cursor_grupo int default null,
  p_cursor_em timestamptz default null,
  p_cursor_id bigint default null,
  p_limite int default 10
)
returns table (
  id bigint,
  phone text,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_from text,
  unread_count int,
  assigned_user_id uuid,
  handoff_at timestamptz,
  stage text,
  display_name text,
  nomewpp text,
  atendimento_ia text,
  foto_path text,
  resumo text,
  trecho text,
  grupo int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      nullif(public.sem_acento(btrim(coalesce(p_busca, ''))), '') as q,
      regexp_replace(coalesce(p_busca, ''), '\D', '', 'g') as dig
  ),
  casadas as (
    -- Conversas cuja MENSAGEM casou com a busca (indice trigram), com o
    -- texto mais recente que casou, para o trecho na lista.
    select distinct on (m.phone)
      m.phone,
      case
        when public.sem_acento(m.user_message) like '%' || pa.q || '%' then m.user_message
        else m.bot_message
      end as texto
    from public.chat_messages m, params pa
    where pa.q is not null
      and length(pa.q) >= 2
      and m.client_id = p_client
      and (public.sem_acento(m.user_message) like '%' || pa.q || '%'
        or public.sem_acento(m.bot_message) like '%' || pa.q || '%')
    order by m.phone, m.created_at desc
  ),
  base as (
    select
      c.id, c.phone, c.last_message_at, c.last_message_preview, c.last_message_from,
      c.unread_count, c.assigned_user_id, c.handoff_at, c.stage,
      d.display_name, d.nomewpp, d.atendimento_ia, d.foto_path,
      ca.texto as texto_casado,
      case
        when pa.q is null or (
          public.sem_acento(coalesce(d.display_name, '') || ' ' || coalesce(d.nomewpp, '')) like '%' || pa.q || '%'
          or (length(pa.dig) >= 3 and split_part(c.phone, '@', 1) like '%' || pa.dig || '%')
        ) then false
        else true
      end as so_mensagem,
      case
        when coalesce(p_filtro, 'all') = 'all' and pa.q is null then
          case when c.handoff_at is not null then 0
               when c.assigned_user_id is not null then 1
               else 2 end
        else 0
      end as grupo
    from public.conversations c
    cross join params pa
    left join public.dados_cliente d
      on d.client_id = c.client_id and d.telefone = c.phone
    left join casadas ca on ca.phone = c.phone
    where c.client_id = p_client
      and c.last_message_at is not null
      and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
      and (p_telefone is null or c.phone = p_telefone)
      -- Janela de tempo: quem espera por voce nunca some, e a busca a ignora.
      and (pa.q is not null or p_inicio is null or c.handoff_at is not null or c.last_message_at >= p_inicio)
      and (
        pa.q is null
        or public.sem_acento(coalesce(d.display_name, '') || ' ' || coalesce(d.nomewpp, '')) like '%' || pa.q || '%'
        or (length(pa.dig) >= 3 and split_part(c.phone, '@', 1) like '%' || pa.dig || '%')
        or ca.phone is not null
      )
      and (
        coalesce(p_filtro, 'all') = 'all'
        or (p_filtro = 'needs' and c.handoff_at is not null)
        or (p_filtro = 'unanswered' and c.last_message_from = 'in')
        or (p_filtro = 'mine' and p_eu is not null and c.assigned_user_id = p_eu)
      )
  )
  select
    b.id, b.phone, b.last_message_at, b.last_message_preview, b.last_message_from,
    b.unread_count, b.assigned_user_id, b.handoff_at, b.stage,
    b.display_name, b.nomewpp, b.atendimento_ia, b.foto_path,
    case when b.handoff_at is not null then (
      select q.summary from public.conversation_qualifications q
      where q.client_id = p_client and q.phone = b.phone and q.summary is not null
      order by q.created_at desc limit 1
    ) end as resumo,
    case when b.so_mensagem then b.texto_casado end as trecho,
    b.grupo
  from base b
  where p_cursor_id is null
     or b.grupo > p_cursor_grupo
     or (b.grupo = p_cursor_grupo and (
          b.last_message_at < p_cursor_em
          or (b.last_message_at = p_cursor_em and b.id < p_cursor_id)))
  order by b.grupo, b.last_message_at desc, b.id desc
  limit greatest(1, least(coalesce(p_limite, 10), 50));
$$;

-- AS CONTAGENS dos chips e dos cabecalhos de grupo, na mesma janela da lista.
create or replace function public.inbox_contagens(
  p_client uuid,
  p_inicio timestamptz default null,
  p_eu uuid default null,
  p_fora text[] default '{}'
)
returns table (
  todas bigint,
  esperando bigint,
  sem_resposta bigint,
  suas bigint,
  grupo_time bigint,
  grupo_ia bigint,
  existe_alguma boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select c.handoff_at, c.assigned_user_id, c.last_message_from, c.last_message_at
    from public.conversations c
    where c.client_id = p_client
      and c.last_message_at is not null
      and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
  )
  select
    count(*) filter (where p_inicio is null or handoff_at is not null or last_message_at >= p_inicio),
    count(*) filter (where handoff_at is not null),
    count(*) filter (where (p_inicio is null or handoff_at is not null or last_message_at >= p_inicio) and last_message_from = 'in'),
    count(*) filter (where (p_inicio is null or handoff_at is not null or last_message_at >= p_inicio) and p_eu is not null and assigned_user_id = p_eu),
    count(*) filter (where (p_inicio is null or last_message_at >= p_inicio) and handoff_at is null and assigned_user_id is not null),
    count(*) filter (where (p_inicio is null or last_message_at >= p_inicio) and handoff_at is null and assigned_user_id is null),
    count(*) > 0
  from base;
$$;

grant execute on function public.inbox_pagina(uuid, timestamptz, text, uuid, text, text[], text, int, timestamptz, bigint, int) to authenticated;
grant execute on function public.inbox_contagens(uuid, timestamptz, uuid, text[]) to authenticated;
revoke execute on function public.inbox_pagina(uuid, timestamptz, text, uuid, text, text[], text, int, timestamptz, bigint, int) from anon, public;
revoke execute on function public.inbox_contagens(uuid, timestamptz, uuid, text[]) from anon, public;
