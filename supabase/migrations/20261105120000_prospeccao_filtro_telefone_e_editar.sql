-- Campanhas, pedidos do dono de 05/11/2026 (docs/adr/2026-11-05-campanhas-phone-filter-and-lead-phone-edit.md).
-- A tabela de leads ganha o filtro de telefone (`p_telefone`: celular, fixo ou sem) e o dono pode pôr um
-- celular achado em outro lugar num lead. So o celular entra em campanha (telefoneDoLead): a coluna
-- `telefone` e a chave do celular, e fixo fica nela null. O filtro repete situacaoDoTelefone
-- (lib/prospeccao.ts); quem muda um muda o outro. Aditivo: parametro novo com padrao, chamadas antigas valem.

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
  p_categorias text[] default null,
  p_telefone text default null
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
      and (p_telefone is null or case p_telefone
        when 'celular' then l.telefone is not null
        when 'fixo' then l.telefone is null and l.tipo_telefone = 'fixo'
        when 'sem' then l.telefone is null and l.tipo_telefone is distinct from 'fixo'
        else false end)
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
revoke execute on function public.prospeccao_leads_pagina(uuid, text, text, text, boolean, boolean, boolean, numeric, int, int, boolean, boolean, int, text[], text) from public, anon, authenticated;
grant execute on function public.prospeccao_leads_pagina(uuid, text, text, text, boolean, boolean, boolean, numeric, int, int, boolean, boolean, int, text[], text) to service_role;

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
  p_categorias text[] default null,
  p_telefone text default null
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
      and (p_telefone is null or case p_telefone
        when 'celular' then l.telefone is not null
        when 'fixo' then l.telefone is null and l.tipo_telefone = 'fixo'
        when 'sem' then l.telefone is null and l.tipo_telefone is distinct from 'fixo'
        else false end)
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
revoke execute on function public.prospeccao_pagina_do_lead(uuid, uuid, text, text, text, boolean, boolean, boolean, numeric, boolean, int, boolean, int, text[], text) from public, anon, authenticated;
grant execute on function public.prospeccao_pagina_do_lead(uuid, uuid, text, text, text, boolean, boolean, boolean, numeric, boolean, int, boolean, int, text[], text) to service_role;

-- Por um celular num lead (achado no Instagram, por exemplo). So lead sem historico: quem ja entrou em
-- campanha ou pediu para parar e observado pelo numero antigo (respostas e SAIR), e trocar o numero
-- perderia isso. O numero chega como chave do celular (telefoneDoLead); o mesmo celular em outro lead
-- recusa, porque a base nunca tem lead repetido (indice prospeccao_leads_telefone).
-- Respostas: ok | nao_encontrado | contatado | invalido | duplicado.
create or replace function public.prospeccao_editar_telefone(p_quem uuid, p_lead uuid, p_telefone text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  l public.prospeccao_leads%rowtype;
begin
  if p_telefone !~ '^55[0-9]{2}9[0-9]{8}$' then
    return 'invalido';
  end if;
  select * into l from public.prospeccao_leads where id = p_lead for update;
  if not found then
    return 'nao_encontrado';
  end if;
  if l.parou_em is not null or exists (select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = p_lead) then
    return 'contatado';
  end if;
  begin
    update public.prospeccao_leads
       set telefone = p_telefone, telefone_original = p_telefone, tipo_telefone = 'celular'
     where id = p_lead;
  exception when unique_violation then
    return 'duplicado';
  end;
  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (p_quem, 'prospeccao_editar_telefone', p_lead::text,
    jsonb_build_object('nome', l.nome, 'telefone', l.telefone_original), jsonb_build_object('telefone', p_telefone));
  return 'ok';
end;
$$;
revoke execute on function public.prospeccao_editar_telefone(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.prospeccao_editar_telefone(uuid, uuid, text) to service_role;
