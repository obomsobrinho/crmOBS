-- Campanhas: a busca traz todas as empresas da área e os filtros moram na tabela de leads (decisão do
-- dono de 02/11/2026, ADR docs/adr/2026-11-02-campanhas-wide-search-filters-in-the-list.md). Sem coluna
-- nova e sem apagar dado: só funções.
--   prospeccao_leads_pagina e prospeccao_pagina_do_lead: ganham com site, mínimo de avaliações e as
--     categorias que vieram no resultado (p_categorias), e a página devolve o tipo do telefone. Mudam a
--     assinatura, por isso drop e create. O filtro das duas continua o MESMO (mudar um muda o outro).
--   prospeccao_categorias_do_recorte (nova): as categorias dos leads de uma busca (ou de todas), com
--     quantos leads cada uma tem; um lead de antes de 31/10 sem categorias conta pelo segmento.
--   prospeccao_leads_do_filtro: ganha p_incluir_contatados; ligado, quem já passou por outra campanha
--     também entra (o dono decide, a tela avisa quantos são). prospeccao_iniciar_campanha passa o valor
--     gravado no filtro da campanha (incluirJaContatados).
-- Tudo só service_role, como o resto da prospecção.

drop function if exists public.prospeccao_leads_pagina(uuid, text, text, text, boolean, boolean, boolean, numeric, int, int, boolean);
drop function if exists public.prospeccao_leads_pagina(uuid, text, text, text, boolean, boolean, boolean, numeric, int, int, boolean, boolean, int, text[]);
create function public.prospeccao_leads_pagina(
  p_busca uuid default null,
  p_texto text default null,
  p_digitos text default null,
  p_cidade text default null,
  p_nao_contatados boolean default false,
  p_so_bons boolean default false,
  p_so_sem_site boolean default false,
  p_nota_minima numeric default null,
  p_offset int default 0,
  p_limite int default 10,
  p_nao_reivindicado boolean default false,
  p_so_com_site boolean default false,
  p_min_avaliacoes int default null,
  p_categorias text[] default null
) returns table (
  id uuid,
  busca_id uuid,
  nome text,
  segmento text,
  bairro text,
  cidade text,
  telefone text,
  site text,
  nota numeric,
  avaliacoes int,
  marcacao text,
  parou_em timestamptz,
  campanha_ids uuid[],
  campanha_nomes text[],
  respondeu boolean,
  total_geral bigint,
  endereco text,
  lat numeric,
  lng numeric,
  reivindicado boolean,
  horarios jsonb,
  distribuicao_notas jsonb,
  fotos int,
  categorias text[],
  instagram text,
  pontuacao int,
  tipo_telefone text
)
language sql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
  with filtrados as (
    -- Só a chave da ordem: o total, a ordem e o limite andam sobre colunas estreitas, e o lead inteiro
    -- (com os jsonb) só é lido para as linhas da página.
    select l.id, l.pontuacao, l.nome
    from public.prospeccao_leads l
    where (p_busca is null or exists (
        select 1 from public.prospeccao_busca_leads bl where bl.busca_id = p_busca and bl.lead_id = l.id))
      and (p_cidade is null or l.cidade = p_cidade)
      and (not coalesce(p_nao_contatados, false) or not exists (
        select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = l.id))
      and (not coalesce(p_so_bons, false) or l.marcacao = 'bom')
      and (not coalesce(p_so_sem_site, false) or l.site_classe <> 'sim')
      and (not coalesce(p_so_com_site, false) or l.site_classe = 'sim')
      and (p_nota_minima is null or l.nota >= p_nota_minima)
      and (p_min_avaliacoes is null or coalesce(l.avaliacoes, 0) >= p_min_avaliacoes)
      and (not coalesce(p_nao_reivindicado, false) or l.reivindicado is false)
      and (coalesce(cardinality(p_categorias), 0) = 0
        or coalesce(l.categorias, array[l.segmento]) && p_categorias)
      and (p_texto is null
        or public.sem_acento(l.nome) like
          '%' || replace(replace(replace(public.sem_acento(p_texto), '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or (p_digitos is not null and strpos(regexp_replace(coalesce(l.telefone_original, ''), '\D', '', 'g'), p_digitos) > 0))
  ),
  ordem as (
    select f.id, count(*) over () as total_geral
    from filtrados f
    order by f.pontuacao desc, f.nome, f.id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limite, 10), 1), 50)
  ),
  pagina as (
    select l.*, o.total_geral from ordem o join public.prospeccao_leads l on l.id = o.id
  )
  select p.id, p.busca_id, p.nome, p.segmento, p.bairro, p.cidade, p.telefone_original, p.site, p.nota,
    p.avaliacoes, p.marcacao, p.parou_em,
    coalesce(k.ids, '{}'), coalesce(k.nomes, '{}'), coalesce(k.respondeu, false), p.total_geral,
    p.endereco, p.lat, p.lng, p.reivindicado, p.horarios, p.distribuicao_notas, p.fotos, p.categorias, p.instagram,
    p.pontuacao, p.tipo_telefone
  from pagina p
  left join lateral (
    select array_agg(c.id order by c.criada_em) as ids,
      array_agg(c.nome order by c.criada_em) as nomes,
      bool_or(cl.respondeu_em is not null) as respondeu
    from public.prospeccao_campanha_leads cl
    join public.prospeccao_campanhas c on c.id = cl.campanha_id
    where cl.lead_id = p.id
  ) k on true
  order by p.pontuacao desc, p.nome, p.id;
$$;
revoke execute on function public.prospeccao_leads_pagina(uuid, text, text, text, boolean, boolean, boolean, numeric, int, int, boolean, boolean, int, text[]) from public, anon, authenticated;
grant execute on function public.prospeccao_leads_pagina(uuid, text, text, text, boolean, boolean, boolean, numeric, int, int, boolean, boolean, int, text[]) to service_role;

-- A página (1 em diante, de p_por_pagina) em que o lead está no recorte; null = fora do recorte.
-- O filtro e a ordem são os de prospeccao_leads_pagina (mudar um muda o outro).
drop function if exists public.prospeccao_pagina_do_lead(uuid, uuid, text, text, text, boolean, boolean, boolean, numeric, boolean, int);
drop function if exists public.prospeccao_pagina_do_lead(uuid, uuid, text, text, text, boolean, boolean, boolean, numeric, boolean, int, boolean, int, text[]);
create function public.prospeccao_pagina_do_lead(
  p_lead uuid,
  p_busca uuid default null,
  p_texto text default null,
  p_digitos text default null,
  p_cidade text default null,
  p_nao_contatados boolean default false,
  p_so_bons boolean default false,
  p_so_sem_site boolean default false,
  p_nota_minima numeric default null,
  p_nao_reivindicado boolean default false,
  p_por_pagina int default 10,
  p_so_com_site boolean default false,
  p_min_avaliacoes int default null,
  p_categorias text[] default null
) returns int
language sql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
  with filtrados as (
    select l.id, row_number() over (order by l.pontuacao desc, l.nome, l.id) as posicao
    from public.prospeccao_leads l
    where (p_busca is null or exists (
        select 1 from public.prospeccao_busca_leads bl where bl.busca_id = p_busca and bl.lead_id = l.id))
      and (p_cidade is null or l.cidade = p_cidade)
      and (not coalesce(p_nao_contatados, false) or not exists (
        select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = l.id))
      and (not coalesce(p_so_bons, false) or l.marcacao = 'bom')
      and (not coalesce(p_so_sem_site, false) or l.site_classe <> 'sim')
      and (not coalesce(p_so_com_site, false) or l.site_classe = 'sim')
      and (p_nota_minima is null or l.nota >= p_nota_minima)
      and (p_min_avaliacoes is null or coalesce(l.avaliacoes, 0) >= p_min_avaliacoes)
      and (not coalesce(p_nao_reivindicado, false) or l.reivindicado is false)
      and (coalesce(cardinality(p_categorias), 0) = 0
        or coalesce(l.categorias, array[l.segmento]) && p_categorias)
      and (p_texto is null
        or public.sem_acento(l.nome) like
          '%' || replace(replace(replace(public.sem_acento(p_texto), '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or (p_digitos is not null and strpos(regexp_replace(coalesce(l.telefone_original, ''), '\D', '', 'g'), p_digitos) > 0))
  )
  select ((f.posicao - 1) / greatest(coalesce(p_por_pagina, 10), 1))::int + 1
  from filtrados f
  where f.id = p_lead;
$$;
revoke execute on function public.prospeccao_pagina_do_lead(uuid, uuid, text, text, text, boolean, boolean, boolean, numeric, boolean, int, boolean, int, text[]) from public, anon, authenticated;
grant execute on function public.prospeccao_pagina_do_lead(uuid, uuid, text, text, text, boolean, boolean, boolean, numeric, boolean, int, boolean, int, text[]) to service_role;

-- As categorias que vieram nos leads de uma busca (ou de todas), com quantos leads cada uma tem: o
-- filtro "Categoria" da tabela só oferece o que existe no resultado. No máximo 200.
create or replace function public.prospeccao_categorias_do_recorte(p_busca uuid default null)
returns table (categoria text, n int)
language sql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
  select c.categoria, count(*)::int
  from public.prospeccao_leads l
  cross join lateral unnest(coalesce(l.categorias, array[l.segmento])) as c(categoria)
  where c.categoria is not null and btrim(c.categoria) <> ''
    and (p_busca is null or exists (
      select 1 from public.prospeccao_busca_leads bl where bl.busca_id = p_busca and bl.lead_id = l.id))
  group by c.categoria
  order by count(*) desc, c.categoria
  limit 200;
$$;
revoke execute on function public.prospeccao_categorias_do_recorte(uuid) from public, anon, authenticated;
grant execute on function public.prospeccao_categorias_do_recorte(uuid) to service_role;

-- Quem entra numa campanha pelo recorte (podeEntrarNaCampanha, lib/prospeccao.ts). Com
-- p_incluir_contatados, quem já passou por outra campanha também entra (escolha do dono).
drop function if exists public.prospeccao_leads_do_filtro(uuid, boolean, boolean, uuid, int);
drop function if exists public.prospeccao_leads_do_filtro(uuid, boolean, boolean, uuid, int, boolean);
create function public.prospeccao_leads_do_filtro(
  p_busca uuid default null,
  p_so_bons boolean default false,
  p_so_sem_site boolean default false,
  p_origem uuid default null,
  p_limite int default null,
  p_incluir_contatados boolean default false
) returns table (id uuid, nome text, pontuacao int, total bigint)
language sql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
  select l.id, l.nome, l.pontuacao, count(*) over () as total
  from public.prospeccao_leads l
  where l.parou_em is null
    and l.telefone is not null
    and l.marcacao is distinct from 'descartado'
    and case
      when p_origem is not null then exists (
        select 1 from public.prospeccao_campanha_leads o
        where o.campanha_id = p_origem and o.lead_id = l.id and o.status = 'enviado')
      else
        (coalesce(p_incluir_contatados, false)
          or not exists (select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = l.id))
        and (p_busca is null or exists (
          select 1 from public.prospeccao_busca_leads bl where bl.busca_id = p_busca and bl.lead_id = l.id))
        and (not coalesce(p_so_bons, false) or l.marcacao = 'bom')
        and (not coalesce(p_so_sem_site, false) or l.site_classe <> 'sim')
    end
  order by l.pontuacao desc, l.nome, l.id
  limit p_limite;
$$;
revoke execute on function public.prospeccao_leads_do_filtro(uuid, boolean, boolean, uuid, int, boolean) from public, anon, authenticated;
grant execute on function public.prospeccao_leads_do_filtro(uuid, boolean, boolean, uuid, int, boolean) to service_role;

create or replace function public.prospeccao_iniciar_campanha(p_quem uuid, p_id uuid, p_agora timestamptz, p_proximo timestamptz)
returns text
language plpgsql
set search_path = ''
as $$
declare
  c public.prospeccao_campanhas%rowtype;
  v_variantes int;
  v_total int;
  v_status text;
begin
  select * into c from public.prospeccao_campanhas where id = p_id for update;
  if not found then
    return 'nao_encontrada';
  end if;
  if c.status <> 'rascunho' then
    return 'nao_e_rascunho';
  end if;
  if c.client_id is null then
    return 'sem_numero';
  end if;
  select count(*) into v_variantes from public.prospeccao_variantes v where v.campanha_id = p_id and btrim(v.texto) <> '';
  if v_variantes < 1 then
    return 'sem_variante';
  end if;
  insert into public.prospeccao_campanha_leads (campanha_id, lead_id, ordem)
  select p_id, f.id, (row_number() over (order by f.pontuacao desc, f.nome, f.id) - 1)::int
  from public.prospeccao_leads_do_filtro(
    nullif(c.filtro->>'buscaId', 'todas')::uuid,
    coalesce((c.filtro->>'soMarcadosComoBons')::boolean, false),
    coalesce((c.filtro->>'soSemSiteProprio')::boolean, false),
    nullif(c.filtro->>'quemNaoRespondeuDe', '')::uuid,
    null,
    coalesce((c.filtro->>'incluirJaContatados')::boolean, false)
  ) f;
  get diagnostics v_total = row_count;
  if v_total = 0 then
    return 'sem_leads';
  end if;
  v_status := case when c.agendada_para is not null and c.agendada_para > p_agora then 'agendada' else 'rodando' end;
  update public.prospeccao_campanhas
     set status = v_status,
         proximo_envio_em = case when v_status = 'rodando' then p_proximo else null end,
         iniciada_em = p_agora,
         salva_em = p_agora,
         passo = 4
   where id = p_id;
  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (p_quem, 'prospeccao_iniciar_campanha', p_id::text, jsonb_build_object('status', c.status),
    jsonb_build_object('status', v_status, 'leads', v_total, 'agendada_para', c.agendada_para));
  return 'ok';
end;
$$;
revoke execute on function public.prospeccao_iniciar_campanha(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.prospeccao_iniciar_campanha(uuid, uuid, timestamptz, timestamptz) to service_role;
