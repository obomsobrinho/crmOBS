-- inbox_pagina em plpgsql: o plano fica guardado na conexao (funcao SQL
-- replanejava a cada chamada: ~43ms com 2 linhas, quase tudo planejamento).
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
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := nullif(public.sem_acento(btrim(coalesce(p_busca, ''))), '');
  v_dig text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
  v_agrupa boolean := coalesce(p_filtro, 'all') = 'all' and v_q is null;
begin
  return query
  with casadas as (
    select distinct on (m.phone)
      m.phone as fone,
      case
        when public.sem_acento(m.user_message) like '%' || v_q || '%' then m.user_message
        else m.bot_message
      end as texto
    from public.chat_messages m
    where v_q is not null
      and length(v_q) >= 2
      and m.client_id = p_client
      and (public.sem_acento(m.user_message) like '%' || v_q || '%'
        or public.sem_acento(m.bot_message) like '%' || v_q || '%')
    order by m.phone, m.created_at desc
  ),
  base as (
    select
      c.id as b_id, c.phone as b_phone, c.last_message_at as b_em,
      c.last_message_preview as b_prev, c.last_message_from as b_from,
      c.unread_count as b_unread, c.assigned_user_id as b_assigned,
      c.handoff_at as b_handoff, c.stage as b_stage,
      d.display_name as b_dn, d.nomewpp as b_nw, d.atendimento_ia as b_ia, d.foto_path as b_foto,
      ca.texto as b_texto,
      (v_q is not null and not (
        public.sem_acento(coalesce(d.display_name, '') || ' ' || coalesce(d.nomewpp, '')) like '%' || v_q || '%'
        or (length(v_dig) >= 3 and split_part(c.phone, '@', 1) like '%' || v_dig || '%')
      )) as b_so_msg,
      case
        when v_agrupa then
          case when c.handoff_at is not null then 0
               when c.assigned_user_id is not null then 1
               else 2 end
        else 0
      end as b_grupo
    from public.conversations c
    left join public.dados_cliente d
      on d.client_id = c.client_id and d.telefone = c.phone
    left join casadas ca on ca.fone = c.phone
    where c.client_id = p_client
      and c.last_message_at is not null
      and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
      and (p_telefone is null or c.phone = p_telefone)
      and (v_q is not null or p_inicio is null or c.handoff_at is not null or c.last_message_at >= p_inicio)
      and (
        v_q is null
        or public.sem_acento(coalesce(d.display_name, '') || ' ' || coalesce(d.nomewpp, '')) like '%' || v_q || '%'
        or (length(v_dig) >= 3 and split_part(c.phone, '@', 1) like '%' || v_dig || '%')
        or ca.fone is not null
      )
      and (
        coalesce(p_filtro, 'all') = 'all'
        or (p_filtro = 'needs' and c.handoff_at is not null)
        or (p_filtro = 'unanswered' and c.last_message_from = 'in')
        or (p_filtro = 'mine' and p_eu is not null and c.assigned_user_id = p_eu)
      )
  )
  select
    b.b_id, b.b_phone, b.b_em, b.b_prev, b.b_from, b.b_unread, b.b_assigned,
    b.b_handoff, b.b_stage, b.b_dn, b.b_nw, b.b_ia, b.b_foto,
    case when b.b_handoff is not null then (
      select q.summary from public.conversation_qualifications q
      where q.client_id = p_client and q.phone = b.b_phone and q.summary is not null
      order by q.created_at desc limit 1
    ) end,
    case when b.b_so_msg then b.b_texto end,
    b.b_grupo
  from base b
  where p_cursor_id is null
     or b.b_grupo > p_cursor_grupo
     or (b.b_grupo = p_cursor_grupo and (
          b.b_em < p_cursor_em
          or (b.b_em = p_cursor_em and b.b_id < p_cursor_id)))
  order by b.b_grupo, b.b_em desc, b.b_id desc
  limit greatest(1, least(coalesce(p_limite, 10), 50));
end;
$$;

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
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select
    count(*) filter (where p_inicio is null or c.handoff_at is not null or c.last_message_at >= p_inicio),
    count(*) filter (where c.handoff_at is not null),
    count(*) filter (where (p_inicio is null or c.handoff_at is not null or c.last_message_at >= p_inicio) and c.last_message_from = 'in'),
    count(*) filter (where (p_inicio is null or c.handoff_at is not null or c.last_message_at >= p_inicio) and p_eu is not null and c.assigned_user_id = p_eu),
    count(*) filter (where (p_inicio is null or c.last_message_at >= p_inicio) and c.handoff_at is null and c.assigned_user_id is not null),
    count(*) filter (where (p_inicio is null or c.last_message_at >= p_inicio) and c.handoff_at is null and c.assigned_user_id is null),
    count(*) > 0
  from public.conversations c
  where c.client_id = p_client
    and c.last_message_at is not null
    and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')));
end;
$$;
