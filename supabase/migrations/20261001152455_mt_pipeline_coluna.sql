-- PIPELINE PAGINADO POR COLUNA (docs/plano-carregamento.md, fase 5).
-- A coluna EFETIVA do card e a de lib/pipeline.ts (stageColumns): estagio
-- ativo dele, senao a coluna padrao. Ordem: mensagem mais recente, id desempata.
create or replace function public.pipeline_coluna(
  p_client uuid,
  p_coluna text,
  p_padrao text,
  p_ativos text[],
  p_busca text default null,
  p_atendente text default 'all',
  p_so_esperando boolean default false,
  p_fora text[] default '{}',
  p_telefone text default null,
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
  coluna text,
  stage_source text,
  handoff_at timestamptz,
  display_name text,
  nomewpp text,
  atendimento_ia text,
  foto_path text,
  resumo text
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
begin
  return query
  with base as (
    select
      c.id as b_id, c.phone as b_phone, c.last_message_at as b_em,
      c.last_message_preview as b_prev, c.last_message_from as b_from,
      c.unread_count as b_unread, c.assigned_user_id as b_assigned,
      case when c.stage = any (p_ativos) then c.stage else p_padrao end as b_coluna,
      c.stage_source as b_fonte, c.handoff_at as b_handoff,
      d.display_name as b_dn, d.nomewpp as b_nw, d.atendimento_ia as b_ia, d.foto_path as b_foto
    from public.conversations c
    left join public.dados_cliente d on d.client_id = c.client_id and d.telefone = c.phone
    where c.client_id = p_client
      and c.last_message_at is not null
      and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
      and (p_telefone is null or c.phone = p_telefone)
      and (not coalesce(p_so_esperando, false) or c.handoff_at is not null)
      and (
        coalesce(p_atendente, 'all') = 'all'
        or (p_atendente = 'none' and c.assigned_user_id is null)
        or (p_atendente not in ('all', 'none') and c.assigned_user_id::text = p_atendente)
      )
      and (
        v_q is null
        or public.sem_acento(coalesce(d.display_name, '') || ' ' || coalesce(d.nomewpp, '')) like '%' || v_q || '%'
        or (length(v_dig) >= 3 and split_part(c.phone, '@', 1) like '%' || v_dig || '%')
      )
  )
  select
    b.b_id, b.b_phone, b.b_em, b.b_prev, b.b_from, b.b_unread, b.b_assigned, b.b_coluna,
    b.b_fonte, b.b_handoff, b.b_dn, b.b_nw, b.b_ia, b.b_foto,
    (select q.summary from public.conversation_qualifications q
      where q.client_id = p_client and q.phone = b.b_phone and q.summary is not null
      order by q.created_at desc limit 1)
  from base b
  where (p_coluna is null or b.b_coluna = p_coluna)
    and (p_cursor_id is null or b.b_em < p_cursor_em or (b.b_em = p_cursor_em and b.b_id < p_cursor_id))
  order by b.b_em desc, b.b_id desc
  limit greatest(1, least(coalesce(p_limite, 10), 50));
end;
$$;

-- Os numeros de cada coluna com os filtros, e (linha '*') quantos esperam voce
-- no funil inteiro, sem filtro nenhum.
create or replace function public.pipeline_contagens(
  p_client uuid,
  p_padrao text,
  p_ativos text[],
  p_busca text default null,
  p_atendente text default 'all',
  p_so_esperando boolean default false,
  p_fora text[] default '{}'
)
returns table (coluna text, total bigint, esperando bigint, mais_antigo timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := nullif(public.sem_acento(btrim(coalesce(p_busca, ''))), '');
  v_dig text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
begin
  return query
  with base as (
    select
      case when c.stage = any (p_ativos) then c.stage else p_padrao end as b_coluna,
      c.handoff_at as b_handoff, c.last_message_at as b_em, c.assigned_user_id as b_assigned,
      d.display_name as b_dn, d.nomewpp as b_nw, c.phone as b_phone
    from public.conversations c
    left join public.dados_cliente d on d.client_id = c.client_id and d.telefone = c.phone
    where c.client_id = p_client
      and c.last_message_at is not null
      and not (split_part(c.phone, '@', 1) = any (coalesce(p_fora, '{}')))
  ),
  filtrada as (
    select * from base b
    where (not coalesce(p_so_esperando, false) or b.b_handoff is not null)
      and (
        coalesce(p_atendente, 'all') = 'all'
        or (p_atendente = 'none' and b.b_assigned is null)
        or (p_atendente not in ('all', 'none') and b.b_assigned::text = p_atendente)
      )
      and (
        v_q is null
        or public.sem_acento(coalesce(b.b_dn, '') || ' ' || coalesce(b.b_nw, '')) like '%' || v_q || '%'
        or (length(v_dig) >= 3 and split_part(b.b_phone, '@', 1) like '%' || v_dig || '%')
      )
  )
  select f.b_coluna, count(*), count(*) filter (where f.b_handoff is not null), min(f.b_em)
  from filtrada f group by f.b_coluna
  union all
  select '*', count(*), count(*) filter (where b.b_handoff is not null), null
  from base b;
end;
$$;

grant execute on function public.pipeline_coluna(uuid, text, text, text[], text, text, boolean, text[], text, timestamptz, bigint, int) to authenticated;
grant execute on function public.pipeline_contagens(uuid, text, text[], text, text, boolean, text[]) to authenticated;
revoke execute on function public.pipeline_coluna(uuid, text, text, text[], text, text, boolean, text[], text, timestamptz, bigint, int) from anon, public;
revoke execute on function public.pipeline_contagens(uuid, text, text[], text, text, boolean, text[]) from anon, public;
