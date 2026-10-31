-- Campanhas: o que a fonte traz de graça em todo lugar passa a ser gravado no lead (revisão do dono de
-- 30/10/2026, liberado em 31/10/2026): coordenadas (os pinos do mapa da busca), o perfil reivindicado
-- (claimThisBusiness: o filtro "Perfil não reivindicado" e a pontuação), o horário de funcionamento
-- (os ganchos fecha cedo, não abre sábado, fecha no almoço), as avaliações por estrela, as fotos, as
-- categorias e o @ do Instagram (a ficha do lead). ADR docs/adr/2026-10-29-owner-prospecting-campaigns.md.
--
-- Aditivo: oito colunas novas, todas anuláveis e sem default (um lead de antes fica com null, que quer
-- dizer "não se sabe", nunca "não"). Nada que existe é apagado ou reescrito. As funções abaixo passam a
-- gravar e a devolver as colunas novas:
--   prospeccao_concluir_busca: grava os campos novos no lead novo; num lead que JÁ estava na base, uma
--     busca nova traz JUNTOS a pontuação e o que entra nela (nota, avaliações, site, perfil, horário),
--     e o resto da fonte só completa (o que veio vazio não apaga o que havia). A marcação do dono e o
--     "parou" nunca mudam aqui. Leads antigos ficam com a pontuação antiga até uma busca nova achá-los.
--   prospeccao_leads_pagina: devolve as colunas novas, o endereço (a ficha) e a pontuação gravada (o selo
--     mostra a que ordena a tabela, também a antiga de um lead de antes) e ganha o filtro
--     p_nao_reivindicado (default false: chamadas antigas continuam valendo). Muda o retorno, por isso
--     drop e create.
--   prospeccao_pagina_do_lead (nova): em que página do recorte um lead está (o pino clicado leva a
--     tabela até ele). O filtro é o MESMO de prospeccao_leads_pagina: mudar um muda o outro.
--   prospeccao_pontos_da_busca (nova): os pinos de uma busca (os leads dela com coordenadas), no
--     máximo 2000, com o que decide a cor do pino (estadoNoMapa, lib/prospeccao.ts).
-- Tudo só service_role, como o resto da prospecção.

alter table public.prospeccao_leads
  add column if not exists lat numeric,
  add column if not exists lng numeric,
  add column if not exists reivindicado boolean,
  add column if not exists horarios jsonb,
  add column if not exists distribuicao_notas jsonb,
  add column if not exists fotos int,
  add column if not exists categorias text[],
  add column if not exists instagram text;

comment on column public.prospeccao_leads.reivindicado is
  'O dono reivindicou o perfil no Google (o contrário de claimThisBusiness). null = não se sabe.';
comment on column public.prospeccao_leads.horarios is
  'O horário lido da fonte (lerHorarios): [{dow, faixas: [[ini, fim] em minutos]}]. null = não se sabe.';
comment on column public.prospeccao_leads.distribuicao_notas is
  'Avaliações por estrela: {"1": n, ..., "5": n}. null = não se sabe.';

create or replace function public.prospeccao_concluir_busca(
  p_busca uuid,
  p_itens jsonb,
  p_erro text
) returns table (status text, total int)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_status text;
  v_item jsonb;
  v_lead uuid;
  v_tel text;
  v_fonte text;
  v_total int;
  v_categorias text[];
begin
  select b.status into v_status from public.prospeccao_buscas b where b.id = p_busca for update;
  if not found then
    return;
  end if;
  if v_status <> 'buscando' then
    return query select b.status, b.total from public.prospeccao_buscas b where b.id = p_busca;
    return;
  end if;
  if p_erro is not null then
    update public.prospeccao_buscas set status = 'falhou', erro = p_erro, concluida_em = now() where id = p_busca;
    return query select 'falhou'::text, 0;
    return;
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_tel := nullif(v_item->>'telefone', '');
    v_fonte := nullif(v_item->>'fonte_id', '');
    -- Lista vazia = a fonte não trouxe categoria (null): não apaga as que o lead já tinha.
    v_categorias := nullif(case when jsonb_typeof(v_item->'categorias') = 'array'
      then array(select jsonb_array_elements_text(v_item->'categorias')) end, '{}'::text[]);
    v_lead := null;
    select l.id into v_lead from public.prospeccao_leads l
     where (v_tel is not null and l.telefone = v_tel) or (v_fonte is not null and l.fonte_id = v_fonte)
     order by (l.telefone is not distinct from v_tel) desc
     limit 1;
    if v_lead is null then
      insert into public.prospeccao_leads (
        busca_id, fonte_id, nome, segmento, endereco, bairro, cidade, telefone, telefone_original,
        tipo_telefone, site, site_classe, nota, avaliacoes, pontuacao,
        lat, lng, reivindicado, horarios, distribuicao_notas, fotos, categorias, instagram)
      values (
        p_busca, v_fonte, coalesce(nullif(v_item->>'nome', ''), 'Sem nome'), nullif(v_item->>'segmento', ''),
        nullif(v_item->>'endereco', ''), nullif(v_item->>'bairro', ''), nullif(v_item->>'cidade', ''), v_tel,
        nullif(v_item->>'telefone_original', ''), nullif(v_item->>'tipo_telefone', ''), nullif(v_item->>'site', ''),
        coalesce(nullif(v_item->>'site_classe', ''), 'nao'), (v_item->>'nota')::numeric(2, 1),
        (v_item->>'avaliacoes')::int, coalesce((v_item->>'pontuacao')::int, 0),
        (v_item->>'lat')::numeric, (v_item->>'lng')::numeric, (v_item->>'reivindicado')::boolean,
        nullif(v_item->'horarios', 'null'::jsonb), nullif(v_item->'distribuicao_notas', 'null'::jsonb),
        (v_item->>'fotos')::int, v_categorias, nullif(v_item->>'instagram', ''))
      returning id into v_lead;
    else
      -- Já estava na base. O que entra na pontuação (nota, avaliações, site, perfil, horário) vem
      -- JUNTO do item novo, com a pontuação dele: o número nunca fica de um dia e os dados de outro.
      -- O resto da fonte só completa (o que veio vazio não apaga o que havia).
      update public.prospeccao_leads l set
        pontuacao = coalesce((v_item->>'pontuacao')::int, l.pontuacao),
        nota = (v_item->>'nota')::numeric(2, 1),
        avaliacoes = (v_item->>'avaliacoes')::int,
        site = nullif(v_item->>'site', ''),
        site_classe = coalesce(nullif(v_item->>'site_classe', ''), 'nao'),
        reivindicado = (v_item->>'reivindicado')::boolean,
        horarios = nullif(v_item->'horarios', 'null'::jsonb),
        lat = coalesce((v_item->>'lat')::numeric, l.lat),
        lng = coalesce((v_item->>'lng')::numeric, l.lng),
        distribuicao_notas = coalesce(nullif(v_item->'distribuicao_notas', 'null'::jsonb), l.distribuicao_notas),
        fotos = coalesce((v_item->>'fotos')::int, l.fotos),
        categorias = coalesce(v_categorias, l.categorias),
        instagram = coalesce(nullif(v_item->>'instagram', ''), l.instagram)
      where l.id = v_lead
        -- Nada mudou: não reescreve a linha (repetir a busca da mesma cidade não gera escrita à toa).
        and (l.pontuacao, l.nota, l.avaliacoes, l.site, l.site_classe, l.reivindicado, l.horarios, l.lat, l.lng,
             l.distribuicao_notas, l.fotos, l.categorias, l.instagram)
          is distinct from (
            coalesce((v_item->>'pontuacao')::int, l.pontuacao), (v_item->>'nota')::numeric(2, 1),
            (v_item->>'avaliacoes')::int, nullif(v_item->>'site', ''), coalesce(nullif(v_item->>'site_classe', ''), 'nao'),
            (v_item->>'reivindicado')::boolean, nullif(v_item->'horarios', 'null'::jsonb),
            coalesce((v_item->>'lat')::numeric, l.lat), coalesce((v_item->>'lng')::numeric, l.lng),
            coalesce(nullif(v_item->'distribuicao_notas', 'null'::jsonb), l.distribuicao_notas),
            coalesce((v_item->>'fotos')::int, l.fotos), coalesce(v_categorias, l.categorias),
            coalesce(nullif(v_item->>'instagram', ''), l.instagram));
    end if;
    insert into public.prospeccao_busca_leads (busca_id, lead_id) values (p_busca, v_lead) on conflict do nothing;
  end loop;
  select count(*) into v_total from public.prospeccao_busca_leads bl where bl.busca_id = p_busca;
  update public.prospeccao_buscas set status = 'pronta', total = v_total, erro = null, concluida_em = now() where id = p_busca;
  return query select 'pronta'::text, v_total;
end;
$$;
revoke execute on function public.prospeccao_concluir_busca(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.prospeccao_concluir_busca(uuid, jsonb, text) to service_role;

drop function if exists public.prospeccao_leads_pagina(uuid, text, text, text, boolean, boolean, boolean, numeric, int, int);
-- E a assinatura nova, para a migration poder rodar de novo (idempotente).
drop function if exists public.prospeccao_leads_pagina(uuid, text, text, text, boolean, boolean, boolean, numeric, int, int, boolean);
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
  p_nao_reivindicado boolean default false
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
  pontuacao int
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
      and (p_nota_minima is null or l.nota >= p_nota_minima)
      and (not coalesce(p_nao_reivindicado, false) or l.reivindicado is false)
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
    p.pontuacao
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
revoke execute on function public.prospeccao_leads_pagina(uuid, text, text, text, boolean, boolean, boolean, numeric, int, int, boolean) from public, anon, authenticated;
grant execute on function public.prospeccao_leads_pagina(uuid, text, text, text, boolean, boolean, boolean, numeric, int, int, boolean) to service_role;

-- A página (1 em diante, de p_por_pagina) em que o lead está no recorte; null = fora do recorte.
-- O filtro e a ordem são os de prospeccao_leads_pagina (mudar um muda o outro).
create or replace function public.prospeccao_pagina_do_lead(
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
  p_por_pagina int default 10
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
      and (p_nota_minima is null or l.nota >= p_nota_minima)
      and (not coalesce(p_nao_reivindicado, false) or l.reivindicado is false)
      and (p_texto is null
        or public.sem_acento(l.nome) like
          '%' || replace(replace(replace(public.sem_acento(p_texto), '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or (p_digitos is not null and strpos(regexp_replace(coalesce(l.telefone_original, ''), '\D', '', 'g'), p_digitos) > 0))
  )
  select ((f.posicao - 1) / greatest(coalesce(p_por_pagina, 10), 1))::int + 1
  from filtrados f
  where f.id = p_lead;
$$;
revoke execute on function public.prospeccao_pagina_do_lead(uuid, uuid, text, text, text, boolean, boolean, boolean, numeric, boolean, int) from public, anon, authenticated;
grant execute on function public.prospeccao_pagina_do_lead(uuid, uuid, text, text, text, boolean, boolean, boolean, numeric, boolean, int) to service_role;

-- Os pinos de uma busca: os leads dela com coordenadas e o que decide a cor (estadoNoMapa). No máximo 2000
-- (uma busca traz no máximo termos x 200 lugares).
create or replace function public.prospeccao_pontos_da_busca(p_busca uuid)
returns table (
  id uuid,
  nome text,
  lat numeric,
  lng numeric,
  marcacao text,
  campanhas int,
  respondeu boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, l.nome, l.lat, l.lng, l.marcacao,
    coalesce(k.n, 0)::int, coalesce(k.respondeu, false)
  from public.prospeccao_busca_leads bl
  join public.prospeccao_leads l on l.id = bl.lead_id
  left join lateral (
    select count(*) as n, bool_or(cl.respondeu_em is not null) as respondeu
    from public.prospeccao_campanha_leads cl
    where cl.lead_id = l.id
  ) k on true
  where bl.busca_id = p_busca and l.lat is not null and l.lng is not null
  -- Acima do teto ficam os de maior pontuação, sempre os mesmos.
  order by l.pontuacao desc, l.nome, l.id
  limit 2000;
$$;
revoke execute on function public.prospeccao_pontos_da_busca(uuid) from public, anon, authenticated;
grant execute on function public.prospeccao_pontos_da_busca(uuid) to service_role;
