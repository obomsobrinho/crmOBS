-- TELA DE CLIENTES PAGINADA (docs/plano-carregamento.md, fase 3). Mesma regra
-- de lib/clientes.ts (montarClientes, casaBusca, passaFiltro), agora no banco:
-- 10 por vez, busca e filtro aqui. security invoker: RLS de quem chama.
--
-- Ordem: ultima mensagem mais recente primeiro, quem nunca falou no fim, id
-- desempata. O cursor e (k, id), k = coalesce(last_message_at, -infinity).
create or replace function public.clientes_pagina(
  p_client uuid,
  p_filtro text default 'todos',
  p_busca text default null,
  p_fora text[] default '{}',
  p_hoje timestamptz default null,
  p_frio_antes timestamptz default null,
  p_cursor_em timestamptz default null,
  p_cursor_id bigint default null,
  p_limite int default 10
)
returns table (
  id bigint,
  telefone text,
  nomewpp text,
  display_name text,
  atendimento_ia text,
  custom_fields jsonb,
  email text,
  birth_date date,
  created_at timestamptz,
  foto_path text,
  conversa_id bigint,
  last_message_at timestamptz,
  assigned_user_id uuid,
  tags jsonb,
  k timestamptz
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
  v_var text[];
begin
  -- As variantes do telefone buscado, com e sem o nono digito (variantesSemNove).
  v_var := array[v_dig];
  if length(v_dig) = 11 and substr(v_dig, 3, 1) = '9' then
    v_var := v_var || (left(v_dig, 2) || substr(v_dig, 4));
  end if;
  if length(v_dig) = 13 and left(v_dig, 2) = '55' and substr(v_dig, 5, 1) = '9' then
    v_var := v_var || (left(v_dig, 4) || substr(v_dig, 6));
  end if;

  return query
  with base as (
    select
      d.id as b_id, d.telefone as b_tel, d.nomewpp as b_nw, d.display_name as b_dn,
      d.atendimento_ia as b_ia, d.custom_fields as b_cf, d.email as b_email,
      d.birth_date as b_nasc, d.created_at as b_criado, d.foto_path as b_foto,
      c.id as b_conv, c.last_message_at as b_em, c.assigned_user_id as b_assigned,
      coalesce(c.last_message_at, '-infinity'::timestamptz) as b_k,
      split_part(d.telefone, '@', 1) as b_fone
    from public.dados_cliente d
    left join public.conversations c
      on c.client_id = d.client_id and c.phone = d.telefone
    where d.client_id = p_client
      and not (split_part(d.telefone, '@', 1) = any (coalesce(p_fora, '{}')))
  ),
  com_tags as (
    select b.*,
      coalesce((
        select jsonb_agg(jsonb_build_object('name', t.name, 'color', t.color) order by t.name)
        from public.conversation_tags ct
        join public.tags t on t.id = ct.tag_id
        where b.b_conv is not null and ct.conversation_id = b.b_conv
      ), '[]'::jsonb) as b_tags
    from base b
  )
  select
    x.b_id, x.b_tel, x.b_nw, x.b_dn, x.b_ia, x.b_cf, x.b_email, x.b_nasc, x.b_criado,
    x.b_foto, x.b_conv, x.b_em, x.b_assigned, x.b_tags, x.b_k
  from com_tags x
  where
    (
      coalesce(p_filtro, 'todos') = 'todos'
      or (p_filtro = 'conversa' and p_hoje is not null and x.b_em >= p_hoje)
      or (p_filtro = 'frio' and p_frio_antes is not null and x.b_em < p_frio_antes)
      or (p_filtro = 'nunca' and x.b_em is null)
      or (p_filtro = 'incompleto' and not (
            nullif(btrim(coalesce(x.b_dn, '')), '') is not null
            and x.b_nasc is not null
            and nullif(btrim(coalesce(x.b_email, '')), '') is not null))
    )
    and (
      v_q is null
      or public.sem_acento(
           concat_ws(' ', coalesce(x.b_dn, x.b_nw), x.b_email,
             (select string_agg(e->>'name', ' ') from jsonb_array_elements(x.b_tags) e),
             (select string_agg(v, ' ') from jsonb_each_text(coalesce(x.b_cf, '{}'::jsonb)) as f(c, v)))
         ) like '%' || v_q || '%'
      or (length(v_dig) >= 2 and exists (
            select 1 from unnest(v_var) vv
            where x.b_fone like '%' || vv || '%'
               or (case when length(x.b_fone) = 13 and left(x.b_fone, 2) = '55' and substr(x.b_fone, 5, 1) = '9'
                        then left(x.b_fone, 4) || substr(x.b_fone, 6) else x.b_fone end) like '%' || vv || '%'))
    )
    and (
      p_cursor_id is null
      or x.b_k < p_cursor_em
      or (x.b_k = p_cursor_em and x.b_id < p_cursor_id)
    )
  order by x.b_k desc, x.b_id desc
  limit greatest(1, least(coalesce(p_limite, 10), 50));
end;
$$;

create or replace function public.clientes_contagens(
  p_client uuid,
  p_fora text[] default '{}',
  p_hoje timestamptz default null,
  p_frio_antes timestamptz default null
)
returns table (todos bigint, conversa bigint, frio bigint, nunca bigint, incompleto bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select
    count(*),
    count(*) filter (where p_hoje is not null and c.last_message_at >= p_hoje),
    count(*) filter (where p_frio_antes is not null and c.last_message_at < p_frio_antes),
    count(*) filter (where c.last_message_at is null),
    count(*) filter (where not (
      nullif(btrim(coalesce(d.display_name, '')), '') is not null
      and d.birth_date is not null
      and nullif(btrim(coalesce(d.email, '')), '') is not null))
  from public.dados_cliente d
  left join public.conversations c on c.client_id = d.client_id and c.phone = d.telefone
  where d.client_id = p_client
    and not (split_part(d.telefone, '@', 1) = any (coalesce(p_fora, '{}')));
end;
$$;

grant execute on function public.clientes_pagina(uuid, text, text, text[], timestamptz, timestamptz, timestamptz, bigint, int) to authenticated;
grant execute on function public.clientes_contagens(uuid, text[], timestamptz, timestamptz) to authenticated;
revoke execute on function public.clientes_pagina(uuid, text, text, text[], timestamptz, timestamptz, timestamptz, bigint, int) from anon, public;
revoke execute on function public.clientes_contagens(uuid, text[], timestamptz, timestamptz) from anon, public;
