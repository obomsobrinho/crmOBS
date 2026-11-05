-- Campanhas, ajustes do dono de 04/11/2026 (docs/adr/2026-11-05-campanhas-delete-triage-and-queue-forecast.md):
-- apagar campanha, apagar lista, tirar um lead da lista e mostrar a ordem da fila.
--
-- Apagar campanha e lista e SUAVE (`apagada_em`): a linha sai das tabelas e dos seletores, mas o que ela guarda de
-- protecao fica. `prospeccao_campanha_leads` e a marca "ja recebeu" (sem ela o lead receberia uma segunda
-- mensagem) e a lista que o cron observa atras de um SAIR (`prospeccao_em_observacao`);
-- `prospeccao_leads.busca_id` e restrict. Aditivo: duas colunas, funcoes novas e so o filtro
-- `apagada_em is null` nas leituras das tabelas. `prospeccao_leads_da_campanha` ganha colunas no retorno
-- (o codigo antigo ignora); por isso `drop` e `create`.

alter table public.prospeccao_campanhas add column if not exists apagada_em timestamptz;
alter table public.prospeccao_buscas add column if not exists apagada_em timestamptz;

-- Apagar uma campanha. Rodando ou agendada recusa (`ativa`): a tela pede para pausar antes. Quem ainda
-- estava na fila nunca recebeu nada e sai da campanha (fica livre para outra); quem recebeu, respondeu ou
-- pediu para parar fica, com a marca. Uma pausada apagada vira concluida: nada a retoma por uma aba velha.
-- Respostas: ok | nao_encontrada | ativa.
create or replace function public.prospeccao_apagar_campanha(p_quem uuid, p_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.prospeccao_campanhas%rowtype;
  v_fila int;
begin
  select * into c from public.prospeccao_campanhas where id = p_id and apagada_em is null for update;
  if not found then
    return 'nao_encontrada';
  end if;
  if c.status in ('rodando', 'agendada') then
    return 'ativa';
  end if;
  delete from public.prospeccao_campanha_leads where campanha_id = p_id and status = 'na_fila';
  get diagnostics v_fila = row_count;
  update public.prospeccao_campanhas
     set apagada_em = now(),
         proximo_envio_em = null,
         status = case when status = 'pausada' then 'concluida' else status end,
         concluida_em = case when status = 'pausada' then now() else concluida_em end
   where id = p_id;
  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (p_quem, 'prospeccao_apagar_campanha', p_id::text,
    jsonb_build_object('status', c.status, 'nome', c.nome), jsonb_build_object('sairam_da_fila', v_fila));
  return 'ok';
end;
$$;
revoke execute on function public.prospeccao_apagar_campanha(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prospeccao_apagar_campanha(uuid, uuid) to service_role;

-- Apagar uma lista (busca ou planilha). Ainda buscando recusa (`buscando`: a fonte vai gravar nela). Um
-- lead dela na fila de alguma campanha recusa (`na_fila`): a mensagem sairia mesmo com a lista apagada.
-- Os leads saem da lista; quem nao esta em outra lista, nunca entrou em campanha e nao pediu para parar
-- sai da base. Quem ja foi contatado ou pediu para parar fica na base (Todos os leads).
-- Respostas: ok | nao_encontrada | buscando | na_fila.
create or replace function public.prospeccao_apagar_busca(p_quem uuid, p_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b public.prospeccao_buscas%rowtype;
  v_ids uuid[];
  v_apagados int;
begin
  select * into b from public.prospeccao_buscas where id = p_id and apagada_em is null for update;
  if not found then
    return 'nao_encontrada';
  end if;
  if b.status = 'buscando' then
    return 'buscando';
  end if;
  if exists (
    select 1 from public.prospeccao_busca_leads bl
    join public.prospeccao_campanha_leads cl on cl.lead_id = bl.lead_id and cl.status = 'na_fila'
    where bl.busca_id = p_id
  ) then
    return 'na_fila';
  end if;
  with sairam as (
    delete from public.prospeccao_busca_leads where busca_id = p_id returning lead_id
  )
  select coalesce(array_agg(lead_id), '{}') into v_ids from sairam;
  delete from public.prospeccao_leads l
   where l.id = any (v_ids)
     and l.parou_em is null
     and not exists (select 1 from public.prospeccao_busca_leads o where o.lead_id = l.id)
     and not exists (select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = l.id);
  get diagnostics v_apagados = row_count;
  update public.prospeccao_buscas set apagada_em = now() where id = p_id;
  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (p_quem, 'prospeccao_apagar_busca', p_id::text,
    jsonb_build_object('termo', b.termo, 'cidade', b.cidade, 'leads', cardinality(v_ids)),
    jsonb_build_object('sairam_da_base', v_apagados));
  return 'ok';
end;
$$;
revoke execute on function public.prospeccao_apagar_busca(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prospeccao_apagar_busca(uuid, uuid) to service_role;

-- Tirar um lead de uma lista (`p_busca`) ou da base inteira (`p_busca` null, a tabela Todos os leads).
-- Na fila de uma campanha recusa (`na_fila`). Da lista: sai dela; sem outra lista, sem campanha e sem
-- pedido para parar, sai da base tambem. Da base: quem ja foi contatado ou pediu para parar recusa
-- (`contatado`): a marca e o que impede uma segunda mensagem.
-- Respostas: ok | nao_encontrado | na_fila | contatado.
create or replace function public.prospeccao_remover_lead(p_quem uuid, p_lead uuid, p_busca uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  l public.prospeccao_leads%rowtype;
  v_guardado boolean;
  v_saiu_da_base boolean;
begin
  select * into l from public.prospeccao_leads where id = p_lead for update;
  if not found then
    return 'nao_encontrado';
  end if;
  if exists (select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = p_lead and cl.status = 'na_fila') then
    return 'na_fila';
  end if;
  v_guardado := l.parou_em is not null
    or exists (select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = p_lead);
  if p_busca is null and v_guardado then
    return 'contatado';
  end if;
  with sairam as (
    delete from public.prospeccao_busca_leads bl
     where bl.lead_id = p_lead and (p_busca is null or bl.busca_id = p_busca)
    returning bl.busca_id
  )
  update public.prospeccao_buscas b set total = greatest(b.total - 1, 0)
   where b.id in (select s.busca_id from sairam s);
  if not found and p_busca is not null then
    return 'nao_encontrado';
  end if;
  v_saiu_da_base := not v_guardado
    and not exists (select 1 from public.prospeccao_busca_leads o where o.lead_id = p_lead);
  if v_saiu_da_base then
    delete from public.prospeccao_leads where id = p_lead;
  end if;
  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (p_quem, 'prospeccao_remover_lead', p_lead::text,
    jsonb_build_object('nome', l.nome, 'busca', p_busca), jsonb_build_object('saiu_da_base', v_saiu_da_base));
  return 'ok';
end;
$$;
revoke execute on function public.prospeccao_remover_lead(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.prospeccao_remover_lead(uuid, uuid, uuid) to service_role;

-- As leituras das tabelas, iguais as de 20261030034211, so com `apagada_em is null`.
create or replace function public.prospeccao_buscas_pagina(
  p_texto text default null,
  p_status text default null,
  p_offset int default 0,
  p_limite int default 10
) returns table (
  id uuid,
  termo text,
  cidade text,
  uf text,
  status text,
  opcoes jsonb,
  erro text,
  criada_em timestamptz,
  achadas int,
  com_celular int,
  bons int,
  contatados int,
  responderam int,
  total_geral bigint
)
language sql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
  with filtradas as (
    select b.*
    from public.prospeccao_buscas b
    where b.apagada_em is null
      and (p_status is null or b.status = p_status)
      and (p_texto is null or public.sem_acento(b.termo || ' ' || b.cidade) like
        '%' || replace(replace(replace(public.sem_acento(p_texto), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ),
  pagina as (
    select f.*, count(*) over () as total_geral
    from filtradas f
    order by f.criada_em desc, f.id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limite, 10), 1), 50)
  )
  select p.id, p.termo, p.cidade, p.uf, p.status, p.opcoes, p.erro, p.criada_em,
    coalesce(k.achadas, 0), coalesce(k.com_celular, 0), coalesce(k.bons, 0), coalesce(k.contatados, 0),
    coalesce(k.responderam, 0), p.total_geral
  from pagina p
  left join lateral (
    select count(*)::int as achadas,
      count(l.telefone)::int as com_celular,
      count(*) filter (where l.marcacao = 'bom')::int as bons,
      count(*) filter (where exists (select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = l.id))::int as contatados,
      count(*) filter (where exists (
        select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = l.id and cl.respondeu_em is not null))::int as responderam
    from public.prospeccao_busca_leads bl
    join public.prospeccao_leads l on l.id = bl.lead_id
    where bl.busca_id = p.id
  ) k on true
  order by p.criada_em desc, p.id;
$$;

create or replace function public.prospeccao_buscas_contagens()
returns table (status text, n int)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.status, count(*)::int from public.prospeccao_buscas b where b.apagada_em is null group by b.status;
$$;

create or replace function public.prospeccao_campanhas_pagina(
  p_texto text default null,
  p_status text default null,
  p_offset int default 0,
  p_limite int default 10,
  p_hoje date default null,
  p_dias int default 14
) returns table (
  id uuid,
  nome text,
  status text,
  client_id uuid,
  agendada_para timestamptz,
  passo int,
  criada_em timestamptz,
  salva_em timestamptz,
  total int,
  enviados int,
  falharam int,
  responderam int,
  serie int[],
  total_geral bigint
)
language sql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
  with filtradas as (
    select c.*
    from public.prospeccao_campanhas c
    where c.apagada_em is null
      and (p_status is null or c.status = p_status)
      and (p_texto is null or public.sem_acento(c.nome) like
        '%' || replace(replace(replace(public.sem_acento(p_texto), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ),
  pagina as (
    select f.*, count(*) over () as total_geral
    from filtradas f
    order by f.criada_em desc, f.id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limite, 10), 1), 50)
  ),
  hoje as (
    select coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date) as d
  )
  select p.id, p.nome, p.status, p.client_id, p.agendada_para, p.passo, p.criada_em, p.salva_em,
    coalesce(k.total, 0), coalesce(k.enviados, 0), coalesce(k.falharam, 0), coalesce(k.responderam, 0),
    array(
      select count(cl.enviado_em)::int
      from generate_series(0, p_dias - 1) as g(i)
      left join public.prospeccao_campanha_leads cl
        on cl.campanha_id = p.id
       and cl.enviado_em >= ((select d from hoje) - (p_dias - 1 - g.i))::timestamp at time zone 'America/Sao_Paulo'
       and cl.enviado_em < ((select d from hoje) - (p_dias - 2 - g.i))::timestamp at time zone 'America/Sao_Paulo'
      group by g.i
      order by g.i
    ),
    p.total_geral
  from pagina p
  left join lateral (
    select count(*)::int as total,
      count(cl.enviado_em)::int as enviados,
      count(*) filter (where cl.status = 'falhou')::int as falharam,
      count(cl.respondeu_em)::int as responderam
    from public.prospeccao_campanha_leads cl
    where cl.campanha_id = p.id
  ) k on true
  order by p.criada_em desc, p.id;
$$;

create or replace function public.prospeccao_campanhas_contagens()
returns table (status text, n int)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.status, count(*)::int from public.prospeccao_campanhas c where c.apagada_em is null group by c.status;
$$;

-- Os leads da campanha, com a ordem de envio: `ordem` (a mesma do cron, prospeccao_reivindicar_envio) e,
-- para quem esta na fila, quantos ainda saem antes dele (`posicao_na_fila`, 0 = o proximo), contado so
-- para a pagina. A previsao de cada um sai de `previsaoDaFila` (lib/prospeccao.ts).
drop function if exists public.prospeccao_leads_da_campanha(uuid, text, text, int, int);
create function public.prospeccao_leads_da_campanha(
  p_campanha uuid,
  p_texto text default null,
  p_status text default null,
  p_offset int default 0,
  p_limite int default 10
) returns table (
  lead_id uuid,
  nome text,
  bairro text,
  cidade text,
  status text,
  variante int,
  enviado_em timestamptz,
  respondeu_em timestamptz,
  total_geral bigint,
  ordem int,
  posicao_na_fila int
)
language sql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
  with pagina as (
    select cl.lead_id, l.nome, l.bairro, l.cidade, cl.status, cl.variante, cl.enviado_em, cl.respondeu_em,
      count(*) over () as total_geral, cl.ordem
    from public.prospeccao_campanha_leads cl
    join public.prospeccao_leads l on l.id = cl.lead_id
    where cl.campanha_id = p_campanha
      and (p_status is null or cl.status = p_status)
      and (p_texto is null or public.sem_acento(l.nome) like
        '%' || replace(replace(replace(public.sem_acento(p_texto), '\', '\\'), '%', '\%'), '_', '\_') || '%')
    order by cl.ordem
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limite, 10), 1), 50)
  )
  select p.lead_id, p.nome, p.bairro, p.cidade, p.status, p.variante, p.enviado_em, p.respondeu_em,
    p.total_geral, p.ordem,
    case when p.status = 'na_fila' then (
      select count(*)::int from public.prospeccao_campanha_leads f
      where f.campanha_id = p_campanha and f.status = 'na_fila' and f.ordem < p.ordem)
    end
  from pagina p
  order by p.ordem;
$$;
revoke execute on function public.prospeccao_leads_da_campanha(uuid, text, text, int, int) from public, anon, authenticated;
grant execute on function public.prospeccao_leads_da_campanha(uuid, text, text, int, int) to service_role;
