-- Campanhas v2, a prospeccao do dono do produto (docs/plano-campanhas.md, secoes 5 a 8; ADR
-- docs/adr/2026-10-29-owner-prospecting-campaigns.md). Aditivo: so tabelas, indices e funcoes NOVOS;
-- nada que ja existe muda. DDL liberado pelo dono em 29/10/2026 so para o que e novo.
--
-- Entidades: buscas na fonte de leads, leads (deduplicados pelo celular e pelo id do lugar na fonte),
-- o vinculo busca x lead, campanhas, as variantes da mensagem e o lead dentro da campanha. Uma mensagem
-- por lead, sem segundo toque; no maximo 10 por dia por campanha, das 8h as 18h (lib/prospeccao.ts).
-- Tudo so service_role: o navegador fala apenas com /api/admin/campanhas/*, e o cron e o webhook da
-- fonte tem rotas proprias com segredo.
--
-- O SQL repete regras de lib/prospeccao.ts, de proposito e com os mesmos valores (quem muda uma muda a
-- outra): quem pode entrar numa campanha (podeEntrarNaCampanha), a faixa da pontuacao
-- (faixaDaPontuacao), a faixa da nota (faixaDaNota), o tipo de telefone no painel (resumoDaBase) e as
-- contas do resultado (resultadoDaCampanha, respostasPorEspera, enviosPorDia, contagemPorSemana).
-- Paginas numeradas (a tela pede "Mostrando 11 a 20 de 137"): offset sobre uma consulta na ordem de um
-- indice, em tabelas do dono que ficam na casa dos milhares de linhas.

create table if not exists public.prospeccao_buscas (
  -- O id nasce no app: vai no webhook da fonte antes da linha existir (uma escrita so).
  id uuid primary key,
  termo text not null check (btrim(termo) <> ''),
  cidade text not null check (btrim(cidade) <> ''),
  uf text,
  status text not null default 'buscando' check (status in ('buscando', 'pronta', 'falhou')),
  -- A fonte e trocavel (lib/fonte-de-leads.ts); o id da execucao dela, para o webhook e a consulta.
  fonte text not null,
  fonte_execucao_id text,
  -- O que foi pedido (OpcoesDaBusca, lib/prospeccao.ts).
  opcoes jsonb not null default '{}'::jsonb,
  total int not null default 0 check (total >= 0),
  erro text,
  criada_por uuid references auth.users(id) on delete set null,
  criada_em timestamptz not null default now(),
  concluida_em timestamptz
);
create index if not exists prospeccao_buscas_lista on public.prospeccao_buscas (criada_em desc, id);
create index if not exists prospeccao_buscas_buscando on public.prospeccao_buscas (criada_em) where status = 'buscando';
create unique index if not exists prospeccao_buscas_execucao
  on public.prospeccao_buscas (fonte, fonte_execucao_id) where fonte_execucao_id is not null;
create index if not exists prospeccao_buscas_texto
  on public.prospeccao_buscas using gin (public.sem_acento(termo || ' ' || cidade) extensions.gin_trgm_ops);

create table if not exists public.prospeccao_leads (
  id uuid primary key default gen_random_uuid(),
  -- A busca que trouxe o lead primeiro; todas as que o acharam ficam em prospeccao_busca_leads.
  busca_id uuid not null references public.prospeccao_buscas(id) on delete restrict,
  -- O id do lugar na fonte (placeId do Google): deduplica quem nao tem celular.
  fonte_id text,
  nome text not null,
  segmento text,
  endereco text,
  bairro text,
  cidade text,
  -- A chave do celular (telefoneDoLead): 55 + DDD + numero. null = sem celular valido (o lead aparece,
  -- nunca entra em campanha).
  telefone text check (telefone ~ '^55[0-9]{10,11}$'),
  -- O telefone como a fonte trouxe (a tela mostra, com o selo Fixo ou Invalido) e o tipo dele.
  telefone_original text,
  tipo_telefone text check (tipo_telefone in ('celular', 'fixo', 'invalido')),
  site text,
  site_classe text not null default 'nao' check (site_classe in ('sim', 'so_rede_social', 'nao')),
  nota numeric(2, 1) check (nota between 0 and 5),
  avaliacoes int check (avaliacoes >= 0),
  pontuacao int not null default 0 check (pontuacao between 0 and 100),
  marcacao text check (marcacao in ('bom', 'descartado')),
  -- Pediu para parar: fora de toda lista futura, para sempre (fica mesmo depois da guarda LGPD).
  parou_em timestamptz,
  criado_em timestamptz not null default now()
);
create unique index if not exists prospeccao_leads_telefone on public.prospeccao_leads (telefone) where telefone is not null;
create unique index if not exists prospeccao_leads_fonte on public.prospeccao_leads (fonte_id) where fonte_id is not null;
create index if not exists prospeccao_leads_lista on public.prospeccao_leads (pontuacao desc, nome, id);
create index if not exists prospeccao_leads_entrada on public.prospeccao_leads (criado_em);
create index if not exists prospeccao_leads_busca on public.prospeccao_leads (busca_id);
create index if not exists prospeccao_leads_nome
  on public.prospeccao_leads using gin (public.sem_acento(nome) extensions.gin_trgm_ops);

create table if not exists public.prospeccao_busca_leads (
  busca_id uuid not null references public.prospeccao_buscas(id) on delete cascade,
  lead_id uuid not null references public.prospeccao_leads(id) on delete cascade,
  primary key (busca_id, lead_id)
);
create index if not exists prospeccao_busca_leads_lead on public.prospeccao_busca_leads (lead_id);

create table if not exists public.prospeccao_campanhas (
  -- O id nasce no app (o rascunho existe na tela antes de ir ao banco).
  id uuid primary key,
  -- A empresa da conexao que envia ("Numero que envia"); as respostas caem nela. null so no rascunho.
  client_id uuid references public.clients(id) on delete cascade,
  nome text not null default '',
  status text not null default 'rascunho'
    check (status in ('rascunho', 'agendada', 'rodando', 'pausada', 'concluida')),
  agendada_para timestamptz,
  -- O recorte do passo Contatos (FiltroDeContatos: busca, so bons, sem site, quem nao respondeu de outra).
  filtro jsonb not null default '{}'::jsonb,
  passo int not null default 1 check (passo between 1 and 4),
  teto_diario int not null default 10 check (teto_diario between 1 and 10),
  proximo_envio_em timestamptz,
  pausada_motivo text,
  criada_por uuid references auth.users(id) on delete set null,
  criada_em timestamptz not null default now(),
  salva_em timestamptz not null default now(),
  iniciada_em timestamptz,
  concluida_em timestamptz,
  check (status = 'rascunho' or client_id is not null)
);
-- O cron pega as campanhas rodando cujo proximo envio ja venceu.
create index if not exists prospeccao_campanhas_cron
  on public.prospeccao_campanhas (proximo_envio_em) where status = 'rodando';
create index if not exists prospeccao_campanhas_agendadas
  on public.prospeccao_campanhas (agendada_para) where status = 'agendada';
create index if not exists prospeccao_campanhas_lista on public.prospeccao_campanhas (criada_em desc, id);
create index if not exists prospeccao_campanhas_client on public.prospeccao_campanhas (client_id);
create index if not exists prospeccao_campanhas_nome
  on public.prospeccao_campanhas using gin (public.sem_acento(nome) extensions.gin_trgm_ops);

create table if not exists public.prospeccao_variantes (
  campanha_id uuid not null references public.prospeccao_campanhas(id) on delete cascade,
  ordem int not null check (ordem between 0 and 2),
  texto text not null,
  primary key (campanha_id, ordem)
);

create table if not exists public.prospeccao_campanha_leads (
  campanha_id uuid not null references public.prospeccao_campanhas(id) on delete cascade,
  lead_id uuid not null references public.prospeccao_leads(id) on delete restrict,
  -- A posicao na fila (pontuacao ao iniciar); a variante sai de varianteDaOrdem(ordem, quantas).
  ordem int not null check (ordem >= 0),
  status text not null default 'na_fila' check (status in ('na_fila', 'enviado', 'respondeu', 'falhou', 'parou')),
  variante int check (variante between 0 and 2),
  -- Quando o envio foi tentado (fica na falha: e o que poe a falha na janela dos resultados).
  tentado_em timestamptz,
  -- Quando saiu de verdade; null na fila e na falha (resultadoDaCampanha conta enviado por ele).
  enviado_em timestamptz,
  respondeu_em timestamptz,
  erro text,
  primary key (campanha_id, lead_id),
  unique (campanha_id, ordem)
);
-- A marca "passou pela campanha X" e a deteccao da resposta pelo lead.
create index if not exists prospeccao_campanha_leads_lead on public.prospeccao_campanha_leads (lead_id);
create index if not exists prospeccao_campanha_leads_fila
  on public.prospeccao_campanha_leads (campanha_id, ordem) where status = 'na_fila';
create index if not exists prospeccao_campanha_leads_envio
  on public.prospeccao_campanha_leads (campanha_id, enviado_em);
create index if not exists prospeccao_campanha_leads_quando
  on public.prospeccao_campanha_leads (enviado_em) where enviado_em is not null;
create index if not exists prospeccao_campanha_leads_tentativa
  on public.prospeccao_campanha_leads (tentado_em) where tentado_em is not null and enviado_em is null;

alter table public.prospeccao_buscas enable row level security;
alter table public.prospeccao_leads enable row level security;
alter table public.prospeccao_busca_leads enable row level security;
alter table public.prospeccao_campanhas enable row level security;
alter table public.prospeccao_variantes enable row level security;
alter table public.prospeccao_campanha_leads enable row level security;

revoke all on public.prospeccao_buscas, public.prospeccao_leads, public.prospeccao_busca_leads,
  public.prospeccao_campanhas, public.prospeccao_variantes, public.prospeccao_campanha_leads
  from public, anon, authenticated;
grant select, insert, update, delete on public.prospeccao_buscas, public.prospeccao_leads,
  public.prospeccao_busca_leads, public.prospeccao_campanhas, public.prospeccao_variantes,
  public.prospeccao_campanha_leads to service_role;

-- ---------------------------------------------------------------------------------------------------
-- Escritas do admin: UMA funcao por acao, com a linha em admin_acoes na mesma transacao.
-- ---------------------------------------------------------------------------------------------------

-- Nova busca: a linha nasce depois que a fonte aceitou a execucao (o id veio do app e ja foi no webhook).
create or replace function public.prospeccao_criar_busca(
  p_quem uuid,
  p_id uuid,
  p_termo text,
  p_cidade text,
  p_uf text,
  p_fonte text,
  p_execucao text,
  p_opcoes jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.prospeccao_buscas (id, termo, cidade, uf, fonte, fonte_execucao_id, opcoes, criada_por)
  values (p_id, p_termo, p_cidade, p_uf, p_fonte, p_execucao, coalesce(p_opcoes, '{}'::jsonb), p_quem);
  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (p_quem, 'prospeccao_criar_busca', p_id::text, null,
    jsonb_build_object('termo', p_termo, 'cidade', p_cidade, 'uf', p_uf, 'fonte', p_fonte, 'opcoes', p_opcoes));
end;
$$;
revoke execute on function public.prospeccao_criar_busca(uuid, uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.prospeccao_criar_busca(uuid, uuid, text, text, text, text, text, jsonb) to service_role;

-- Bom / descartado / nenhuma (null). Sem o lead, nao devolve linha (a rota responde 404).
create or replace function public.prospeccao_marcar_lead(
  p_quem uuid,
  p_lead uuid,
  p_marcacao text
) returns table (marcacao text)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_antes text;
begin
  select l.marcacao into v_antes from public.prospeccao_leads l where l.id = p_lead for update;
  if not found then
    return;
  end if;
  update public.prospeccao_leads set marcacao = p_marcacao where id = p_lead;
  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (p_quem, 'prospeccao_marcar_lead', p_lead::text,
    jsonb_build_object('marcacao', v_antes), jsonb_build_object('marcacao', p_marcacao));
  return query select p_marcacao;
end;
$$;
revoke execute on function public.prospeccao_marcar_lead(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.prospeccao_marcar_lead(uuid, uuid, text) to service_role;

-- O rascunho, salvo a cada mudanca do assistente (cria na primeira vez). So enquanto e rascunho: uma
-- campanha que ja iniciou nao volta linha (a rota responde 409). As variantes sao regravadas inteiras.
create or replace function public.prospeccao_salvar_campanha(
  p_quem uuid,
  p_id uuid,
  p_nome text,
  p_client uuid,
  p_agendada_para timestamptz,
  p_filtro jsonb,
  p_passo int,
  p_variantes text[]
) returns table (salva_em timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_status text;
  v_agora timestamptz := now();
begin
  if coalesce(cardinality(p_variantes), 0) > 3 then
    raise exception 'no maximo 3 variantes' using errcode = '22023';
  end if;
  select c.status into v_status from public.prospeccao_campanhas c where c.id = p_id for update;
  if found and v_status <> 'rascunho' then
    return;
  end if;
  insert into public.prospeccao_campanhas (id, client_id, nome, agendada_para, filtro, passo, criada_por, salva_em)
  values (p_id, p_client, coalesce(p_nome, ''), p_agendada_para, coalesce(p_filtro, '{}'::jsonb), p_passo, p_quem, v_agora)
  on conflict (id) do update
    set client_id = excluded.client_id,
        nome = excluded.nome,
        agendada_para = excluded.agendada_para,
        filtro = excluded.filtro,
        passo = excluded.passo,
        salva_em = excluded.salva_em;
  delete from public.prospeccao_variantes where campanha_id = p_id;
  insert into public.prospeccao_variantes (campanha_id, ordem, texto)
  select p_id, v.ordem - 1, v.texto
  from unnest(coalesce(p_variantes, '{}'::text[])) with ordinality as v(texto, ordem);
  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (p_quem, 'prospeccao_salvar_rascunho', p_id::text, null,
    jsonb_build_object('nome', p_nome, 'client_id', p_client, 'agendada_para', p_agendada_para,
      'filtro', p_filtro, 'passo', p_passo, 'variantes', coalesce(cardinality(p_variantes), 0)));
  return query select v_agora;
end;
$$;
revoke execute on function public.prospeccao_salvar_campanha(uuid, uuid, text, uuid, timestamptz, jsonb, int, text[]) from public, anon, authenticated;
grant execute on function public.prospeccao_salvar_campanha(uuid, uuid, text, uuid, timestamptz, jsonb, int, text[]) to service_role;

-- QUEM ENTRA numa campanha pelo recorte do passo Contatos, na ordem da fila (pontuacao). Gemea de
-- podeEntrarNaCampanha + leadsDoFiltro (lib/prospeccao.ts, components/admin/campanhas/tipos.ts):
-- nunca quem pediu para parar, sem celular ou descartado; quem ja passou por campanha so entra
-- escolhido de proposito ("Nova campanha com quem nao respondeu": os que receberam a mensagem da
-- campanha de origem e nao responderam, sem os recortes). `total` e a contagem inteira (antes do limite).
create or replace function public.prospeccao_leads_do_filtro(
  p_busca uuid default null,
  p_so_bons boolean default false,
  p_so_sem_site boolean default false,
  p_origem uuid default null,
  p_limite int default null
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
        not exists (select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = l.id)
        and (p_busca is null or exists (
          select 1 from public.prospeccao_busca_leads bl where bl.busca_id = p_busca and bl.lead_id = l.id))
        and (not coalesce(p_so_bons, false) or l.marcacao = 'bom')
        and (not coalesce(p_so_sem_site, false) or l.site_classe <> 'sim')
    end
  order by l.pontuacao desc, l.nome, l.id
  limit p_limite;
$$;
revoke execute on function public.prospeccao_leads_do_filtro(uuid, boolean, boolean, uuid, int) from public, anon, authenticated;
grant execute on function public.prospeccao_leads_do_filtro(uuid, boolean, boolean, uuid, int) to service_role;

-- Iniciar (ou agendar): monta a fila pelo recorte salvo e muda a situacao, numa transacao. Respostas:
-- ok | nao_encontrada | nao_e_rascunho | sem_numero | sem_variante | sem_leads. `p_proximo` e o primeiro
-- envio, calculado no app (proximoEnvioEm); numa campanha agendada fica null ate o cron a ativar.
create or replace function public.prospeccao_iniciar_campanha(
  p_quem uuid,
  p_id uuid,
  p_agora timestamptz,
  p_proximo timestamptz
) returns text
language plpgsql
security invoker
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
    null
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

-- Pausar: de rodando ou agendada. `p_quem` null = a pausa sozinha do cron (D6: numero desconectado ou
-- pedidos para parar demais no dia), sem linha em admin_acoes (nao e acao do admin) e com o motivo.
-- Respostas: ok | nao_encontrada | sem_mudanca.
create or replace function public.prospeccao_pausar_campanha(
  p_quem uuid,
  p_id uuid,
  p_motivo text
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  select c.status into v_status from public.prospeccao_campanhas c where c.id = p_id for update;
  if not found then
    return 'nao_encontrada';
  end if;
  if v_status not in ('rodando', 'agendada') then
    return 'sem_mudanca';
  end if;
  update public.prospeccao_campanhas
     set status = 'pausada', proximo_envio_em = null, pausada_motivo = p_motivo
   where id = p_id;
  if p_quem is not null then
    insert into public.admin_acoes (quem, acao, alvo, antes, depois)
    values (p_quem, 'prospeccao_pausar_campanha', p_id::text, jsonb_build_object('status', v_status),
      jsonb_build_object('status', 'pausada'));
  end if;
  return 'ok';
end;
$$;
revoke execute on function public.prospeccao_pausar_campanha(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.prospeccao_pausar_campanha(uuid, uuid, text) to service_role;

-- Retomar: volta a agendada (se o inicio ainda nao chegou), a concluida (fila vazia) ou a rodando com o
-- proximo envio do app. Respostas: ok | nao_encontrada | sem_mudanca.
create or replace function public.prospeccao_retomar_campanha(
  p_quem uuid,
  p_id uuid,
  p_agora timestamptz,
  p_proximo timestamptz
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.prospeccao_campanhas%rowtype;
  v_status text;
begin
  select * into c from public.prospeccao_campanhas where id = p_id for update;
  if not found then
    return 'nao_encontrada';
  end if;
  if c.status <> 'pausada' then
    return 'sem_mudanca';
  end if;
  if c.agendada_para is not null and c.agendada_para > p_agora then
    v_status := 'agendada';
  elsif not exists (select 1 from public.prospeccao_campanha_leads cl where cl.campanha_id = p_id and cl.status = 'na_fila') then
    v_status := 'concluida';
  else
    v_status := 'rodando';
  end if;
  update public.prospeccao_campanhas
     set status = v_status,
         proximo_envio_em = case when v_status = 'rodando' then p_proximo else null end,
         pausada_motivo = null,
         concluida_em = case when v_status = 'concluida' then p_agora else concluida_em end
   where id = p_id;
  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (p_quem, 'prospeccao_retomar_campanha', p_id::text, jsonb_build_object('status', 'pausada'),
    jsonb_build_object('status', v_status));
  return 'ok';
end;
$$;
revoke execute on function public.prospeccao_retomar_campanha(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.prospeccao_retomar_campanha(uuid, uuid, timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------------------
-- O sistema: o webhook da fonte e o cron (sem admin_acoes: nao sao acoes do admin).
-- ---------------------------------------------------------------------------------------------------

-- Conclui uma busca: grava os leads ja mapeados e pontuados pelo app (lib/fonte-de-leads.ts), deduplica
-- pelo celular e pelo id do lugar, vincula todos a busca e marca pronta (ou falhou com o motivo, sem
-- gravar nada). Idempotente: uma busca que nao esta mais "buscando" volta como esta (webhook repetido,
-- ou o cron e o webhook ao mesmo tempo; a linha da busca fica travada durante a gravacao).
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
    v_lead := null;
    select l.id into v_lead from public.prospeccao_leads l
     where (v_tel is not null and l.telefone = v_tel) or (v_fonte is not null and l.fonte_id = v_fonte)
     order by (l.telefone is not distinct from v_tel) desc
     limit 1;
    if v_lead is null then
      insert into public.prospeccao_leads (
        busca_id, fonte_id, nome, segmento, endereco, bairro, cidade, telefone, telefone_original,
        tipo_telefone, site, site_classe, nota, avaliacoes, pontuacao)
      values (
        p_busca, v_fonte, coalesce(nullif(v_item->>'nome', ''), 'Sem nome'), nullif(v_item->>'segmento', ''),
        nullif(v_item->>'endereco', ''), nullif(v_item->>'bairro', ''), nullif(v_item->>'cidade', ''), v_tel,
        nullif(v_item->>'telefone_original', ''), nullif(v_item->>'tipo_telefone', ''), nullif(v_item->>'site', ''),
        coalesce(nullif(v_item->>'site_classe', ''), 'nao'), (v_item->>'nota')::numeric(2, 1),
        (v_item->>'avaliacoes')::int, coalesce((v_item->>'pontuacao')::int, 0))
      returning id into v_lead;
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

-- As agendadas cujo inicio chegou viram rodando, com o primeiro envio agora.
create or replace function public.prospeccao_ativar_agendadas(p_agora timestamptz)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.prospeccao_campanhas
     set status = 'rodando', proximo_envio_em = p_agora
   where status = 'agendada' and agendada_para <= p_agora;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.prospeccao_ativar_agendadas(timestamptz) from public, anon, authenticated;
grant execute on function public.prospeccao_ativar_agendadas(timestamptz) to service_role;

-- A VEZ de uma campanha no cron, numa transacao: reserva a campanha (o proximo envio vira `p_reserva_ate`,
-- entao duas execucoes nunca mandam pela mesma campanha ao mesmo tempo, e uma execucao que morrer no
-- meio devolve a vez sozinha quando a reserva vence) e reivindica UM lead da fila com
-- `update ... where status = 'na_fila'`. Situacao: enviar (com o lead) | cota_cheia (ja saiu o teto de
-- hoje) | concluida (fila vazia; a campanha fecha). Sem linha = a vez nao era desta execucao.
-- Quem pediu para parar (em outra campanha) depois de entrar na fila sai como falhou, antes da vez.
create or replace function public.prospeccao_reivindicar_envio(
  p_campanha uuid,
  p_agora timestamptz,
  p_inicio_do_dia timestamptz,
  p_reserva_ate timestamptz
) returns table (
  situacao text,
  lead_id uuid,
  ordem int,
  nome text,
  telefone text,
  client_id uuid,
  instancia text,
  avisos text,
  variantes text[],
  enviados_hoje int
)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client uuid;
  v_teto int;
  v_hoje int;
  v_lead uuid;
  v_ordem int;
begin
  update public.prospeccao_campanhas c
     set proximo_envio_em = p_reserva_ate
   where c.id = p_campanha and c.status = 'rodando' and c.proximo_envio_em <= p_agora
  returning c.client_id, c.teto_diario into v_client, v_teto;
  if not found then
    return;
  end if;

  update public.prospeccao_campanha_leads cl
     set status = 'falhou', erro = 'Pediu para parar antes do envio'
    from public.prospeccao_leads l
   where cl.campanha_id = p_campanha and cl.status = 'na_fila' and l.id = cl.lead_id and l.parou_em is not null;

  select count(*) into v_hoje from public.prospeccao_campanha_leads cl
   where cl.campanha_id = p_campanha and cl.enviado_em >= p_inicio_do_dia;
  if v_hoje >= v_teto then
    return query select 'cota_cheia'::text, null::uuid, null::int, null::text, null::text, v_client, null::text,
      null::text, null::text[], v_hoje;
    return;
  end if;

  update public.prospeccao_campanha_leads cl
     set status = 'enviado', tentado_em = p_agora, enviado_em = p_agora
   where (cl.campanha_id, cl.lead_id) = (
     select f.campanha_id, f.lead_id from public.prospeccao_campanha_leads f
      where f.campanha_id = p_campanha and f.status = 'na_fila'
      order by f.ordem
      limit 1
      for update skip locked)
     and cl.status = 'na_fila'
  returning cl.lead_id, cl.ordem into v_lead, v_ordem;
  if v_lead is null then
    if not exists (select 1 from public.prospeccao_campanha_leads cl where cl.campanha_id = p_campanha and cl.status = 'na_fila') then
      update public.prospeccao_campanhas
         set status = 'concluida', concluida_em = p_agora, proximo_envio_em = null
       where id = p_campanha;
      return query select 'concluida'::text, null::uuid, null::int, null::text, null::text, v_client, null::text,
        null::text, null::text[], v_hoje;
    end if;
    return;
  end if;

  return query
  select 'enviar'::text, l.id, v_ordem, l.nome, l.telefone, k.id, k.evolution_instance, k.notify_group_jid,
    array(select v.texto from public.prospeccao_variantes v where v.campanha_id = p_campanha order by v.ordem),
    v_hoje
  from public.prospeccao_leads l
  join public.clients k on k.id = v_client
  where l.id = v_lead;
end;
$$;
revoke execute on function public.prospeccao_reivindicar_envio(uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.prospeccao_reivindicar_envio(uuid, timestamptz, timestamptz, timestamptz) to service_role;

-- O resultado do envio reivindicado e o proximo envio da campanha (proximoEnvioEm, no app).
-- enviado: grava a variante | falhou: o lead sai da fila com o erro (nunca tenta de novo) |
-- devolver: o lead volta para a fila (o numero estava desconectado; a pausa e de quem chama) |
-- adiar: sem lead (cota do dia cheia), so o proximo envio muda.
create or replace function public.prospeccao_registrar_envio(
  p_campanha uuid,
  p_lead uuid,
  p_resultado text,
  p_variante int,
  p_erro text,
  p_proximo timestamptz
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_resultado = 'enviado' then
    update public.prospeccao_campanha_leads set variante = p_variante
     where campanha_id = p_campanha and lead_id = p_lead;
  elsif p_resultado = 'falhou' then
    update public.prospeccao_campanha_leads
       set status = 'falhou', enviado_em = null, variante = null, erro = p_erro
     where campanha_id = p_campanha and lead_id = p_lead;
  elsif p_resultado = 'devolver' then
    update public.prospeccao_campanha_leads
       set status = 'na_fila', enviado_em = null, tentado_em = null, variante = null
     where campanha_id = p_campanha and lead_id = p_lead;
  elsif p_resultado <> 'adiar' then
    raise exception 'resultado desconhecido: %', p_resultado using errcode = '22023';
  end if;
  update public.prospeccao_campanhas set proximo_envio_em = p_proximo
   where id = p_campanha and status = 'rodando';
end;
$$;
revoke execute on function public.prospeccao_registrar_envio(uuid, uuid, text, int, text, timestamptz) from public, anon, authenticated;
grant execute on function public.prospeccao_registrar_envio(uuid, uuid, text, int, text, timestamptz) to service_role;

-- Quem o cron ainda observa: enviados que nao responderam (a primeira resposta) e os que responderam
-- (um pedido para parar depois), enviados desde `p_desde` (a janela de leitura do app).
create or replace function public.prospeccao_em_observacao(p_desde timestamptz)
returns table (
  campanha_id uuid,
  lead_id uuid,
  client_id uuid,
  telefone text,
  status text,
  enviado_em timestamptz,
  respondeu_em timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select cl.campanha_id, cl.lead_id, c.client_id, l.telefone, cl.status, cl.enviado_em, cl.respondeu_em
  from public.prospeccao_campanha_leads cl
  join public.prospeccao_campanhas c on c.id = cl.campanha_id
  join public.prospeccao_leads l on l.id = cl.lead_id
  where cl.enviado_em >= p_desde
    and cl.status in ('enviado', 'respondeu')
    and c.client_id is not null
    and l.telefone is not null
  order by cl.enviado_em;
$$;
revoke execute on function public.prospeccao_em_observacao(timestamptz) from public, anon, authenticated;
grant execute on function public.prospeccao_em_observacao(timestamptz) to service_role;

-- Grava as respostas que o cron achou em chat_messages (`p_itens`: campanha_id, lead_id, respondeu_em,
-- parou_em). Respondeu: so quem ainda estava "enviado". Pediu para parar: a linha vira "parou" e o lead
-- ganha parou_em para sempre. D6: a campanha com MAIS de `p_paradas` pedidos para parar desde
-- `p_inicio_do_dia` pausa sozinha com `p_motivo`. Devolve quantas campanhas pausaram.
create or replace function public.prospeccao_registrar_respostas(
  p_itens jsonb,
  p_inicio_do_dia timestamptz,
  p_paradas int,
  p_motivo text
) returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_campanhas uuid[] := '{}';
  v_campanha uuid;
  v_pausadas int := 0;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_campanha := (v_item->>'campanha_id')::uuid;
    if v_item->>'respondeu_em' is not null then
      update public.prospeccao_campanha_leads
         set status = 'respondeu', respondeu_em = (v_item->>'respondeu_em')::timestamptz
       where campanha_id = v_campanha and lead_id = (v_item->>'lead_id')::uuid and status = 'enviado';
    end if;
    if v_item->>'parou_em' is not null then
      update public.prospeccao_campanha_leads
         set status = 'parou',
             respondeu_em = coalesce(respondeu_em, (v_item->>'parou_em')::timestamptz)
       where campanha_id = v_campanha and lead_id = (v_item->>'lead_id')::uuid and status in ('enviado', 'respondeu');
      update public.prospeccao_leads
         set parou_em = coalesce(parou_em, (v_item->>'parou_em')::timestamptz)
       where id = (v_item->>'lead_id')::uuid;
      v_campanhas := array_append(v_campanhas, v_campanha);
    end if;
  end loop;
  for v_campanha in select distinct x from unnest(v_campanhas) as x loop
    if (select count(*) from public.prospeccao_campanha_leads cl
          join public.prospeccao_leads l on l.id = cl.lead_id
         where cl.campanha_id = v_campanha and cl.status = 'parou' and l.parou_em >= p_inicio_do_dia) > p_paradas
       and public.prospeccao_pausar_campanha(null, v_campanha, p_motivo) = 'ok' then
      v_pausadas := v_pausadas + 1;
    end if;
  end loop;
  return v_pausadas;
end;
$$;
revoke execute on function public.prospeccao_registrar_respostas(jsonb, timestamptz, int, text) from public, anon, authenticated;
grant execute on function public.prospeccao_registrar_respostas(jsonb, timestamptz, int, text) to service_role;

-- D8 (LGPD): apaga quem entrou na base antes de `p_antes` e nunca respondeu a campanha nenhuma; quem
-- pediu para parar fica (a marca de saida e para sempre). Sai junto a passagem dele pelas campanhas.
-- Devolve quantos leads sairam.
create or replace function public.prospeccao_apagar_antigos(p_antes timestamptz)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(l.id), '{}') into v_ids
  from public.prospeccao_leads l
  where l.criado_em < p_antes
    and l.parou_em is null
    and not exists (
      select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = l.id and cl.respondeu_em is not null);
  if cardinality(v_ids) = 0 then
    return 0;
  end if;
  delete from public.prospeccao_campanha_leads where lead_id = any (v_ids);
  delete from public.prospeccao_leads where id = any (v_ids);
  return cardinality(v_ids);
end;
$$;
revoke execute on function public.prospeccao_apagar_antigos(timestamptz) from public, anon, authenticated;
grant execute on function public.prospeccao_apagar_antigos(timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------------------
-- Leituras das telas (paginas numeradas de ate 50, padrao 10; contagens no banco, nunca linhas no app).
-- ---------------------------------------------------------------------------------------------------

-- A tabela de buscas: uma pagina na ordem do indice (criada_em desc, id) e as contagens de cada busca
-- da pagina (achadas, com celular, bons, contatados, responderam) so depois do limite.
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
    where (p_status is null or b.status = p_status)
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
revoke execute on function public.prospeccao_buscas_pagina(text, text, int, int) from public, anon, authenticated;
grant execute on function public.prospeccao_buscas_pagina(text, text, int, int) to service_role;

-- Quantas buscas em cada situacao (o filtro da tabela mostra a contagem de cada opcao).
create or replace function public.prospeccao_buscas_contagens()
returns table (status text, n int)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.status, count(*)::int from public.prospeccao_buscas b group by b.status;
$$;
revoke execute on function public.prospeccao_buscas_contagens() from public, anon, authenticated;
grant execute on function public.prospeccao_buscas_contagens() to service_role;

-- A tabela de leads (todos, ou os de uma busca): busca pelo nome (sem acento) ou pelos digitos do
-- telefone, a cidade e os recortes do botao de filtro. As campanhas de cada lead da pagina (a marca "passou
-- pela campanha X") e se respondeu entram so depois do limite.
create or replace function public.prospeccao_leads_pagina(
  p_busca uuid default null,
  p_texto text default null,
  p_digitos text default null,
  p_cidade text default null,
  p_nao_contatados boolean default false,
  p_so_bons boolean default false,
  p_so_sem_site boolean default false,
  p_nota_minima numeric default null,
  p_offset int default 0,
  p_limite int default 10
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
  total_geral bigint
)
language sql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
  with filtrados as (
    select l.*
    from public.prospeccao_leads l
    where (p_busca is null or exists (
        select 1 from public.prospeccao_busca_leads bl where bl.busca_id = p_busca and bl.lead_id = l.id))
      and (p_cidade is null or l.cidade = p_cidade)
      and (not coalesce(p_nao_contatados, false) or not exists (
        select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = l.id))
      and (not coalesce(p_so_bons, false) or l.marcacao = 'bom')
      and (not coalesce(p_so_sem_site, false) or l.site_classe <> 'sim')
      and (p_nota_minima is null or l.nota >= p_nota_minima)
      and (p_texto is null
        or public.sem_acento(l.nome) like
          '%' || replace(replace(replace(public.sem_acento(p_texto), '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or (p_digitos is not null and strpos(regexp_replace(coalesce(l.telefone_original, ''), '\D', '', 'g'), p_digitos) > 0))
  ),
  pagina as (
    select f.*, count(*) over () as total_geral
    from filtrados f
    order by f.pontuacao desc, f.nome, f.id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limite, 10), 1), 50)
  )
  select p.id, p.busca_id, p.nome, p.segmento, p.bairro, p.cidade, p.telefone_original, p.site, p.nota,
    p.avaliacoes, p.marcacao, p.parou_em,
    coalesce(k.ids, '{}'), coalesce(k.nomes, '{}'), coalesce(k.respondeu, false), p.total_geral
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
revoke execute on function public.prospeccao_leads_pagina(uuid, text, text, text, boolean, boolean, boolean, numeric, int, int) from public, anon, authenticated;
grant execute on function public.prospeccao_leads_pagina(uuid, text, text, text, boolean, boolean, boolean, numeric, int, int) to service_role;

-- As cidades da base (ou de uma busca), para o filtro "Cidade" da tabela de leads. No maximo 300.
create or replace function public.prospeccao_cidades(p_busca uuid default null)
returns table (cidade text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct l.cidade
  from public.prospeccao_leads l
  where l.cidade is not null and l.cidade <> ''
    and (p_busca is null or exists (
      select 1 from public.prospeccao_busca_leads bl where bl.busca_id = p_busca and bl.lead_id = l.id))
  order by l.cidade
  limit 300;
$$;
revoke execute on function public.prospeccao_cidades(uuid) from public, anon, authenticated;
grant execute on function public.prospeccao_cidades(uuid) to service_role;

-- O PAINEL DA BASE (a aba Leads, ou o detalhe de uma busca) em formato longo, uma linha por grupo:
-- gemeo de resumoDaBase, contagemPorSemana e enviosPorDia (lib/prospeccao.ts), que o app dobra
-- (`resumoDasLinhas`). Dimensoes: total, com_celular, bons, cidade, segmento, bairro, telefone, site,
-- faixa, nota, nota_media (n com nota, soma), novos_semana e envios_semana (chave = indice da semana,
-- 0 = a mais antiga das `p_semanas` que terminam em `p_hoje`), respostas_dia (chave = AAAA-MM-DD dos
-- `p_dias` ate `p_hoje`; a resposta conta no dia do envio). Datas em America/Sao_Paulo.
create or replace function public.prospeccao_resumo_da_base(
  p_busca uuid default null,
  p_hoje date default null,
  p_semanas int default 8,
  p_dias int default 14
) returns table (
  dimensao text,
  chave text,
  n bigint,
  a_contatar bigint,
  contatados bigint,
  responderam bigint,
  soma numeric
)
language sql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
  with base as (
    select l.*,
      exists (select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = l.id) as contatado,
      exists (select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = l.id and cl.respondeu_em is not null) as respondeu
    from public.prospeccao_leads l
    where p_busca is null or exists (
      select 1 from public.prospeccao_busca_leads bl where bl.busca_id = p_busca and bl.lead_id = l.id)
  ),
  marcada as (
    select b.*,
      (b.parou_em is null and b.telefone is not null and b.marcacao is distinct from 'descartado' and not b.contatado) as pode
    from base b
  ),
  hoje as (
    select coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date) as d
  )
  select 'total', '', count(*), count(*) filter (where pode), count(*) filter (where contatado),
    count(*) filter (where respondeu), null::numeric
  from marcada
  union all
  select 'com_celular', '', count(telefone), null, null, null, null from marcada
  union all
  select 'bons', '', count(*) filter (where marcacao = 'bom'), null, null, null, null from marcada
  union all
  select 'cidade', coalesce(nullif(cidade, ''), 'Sem cidade'), count(*), count(*) filter (where pode),
    count(*) filter (where contatado), count(*) filter (where respondeu), null
  from marcada group by 2
  union all
  select 'segmento', coalesce(nullif(segmento, ''), 'Sem segmento'), count(*), count(*) filter (where pode),
    count(*) filter (where contatado), count(*) filter (where respondeu), null
  from marcada group by 2
  union all
  select 'bairro', coalesce(nullif(bairro, ''), 'Sem bairro'), count(*), count(*) filter (where pode),
    count(*) filter (where contatado), count(*) filter (where respondeu), null
  from marcada group by 2
  union all
  select 'telefone',
    case when telefone_original is not null and tipo_telefone in ('celular', 'fixo') then tipo_telefone else 'sem' end,
    count(*), null, null, null, null
  from marcada group by 2
  union all
  select 'site', site_classe, count(*), null, null, null, null from marcada group by 2
  union all
  select 'faixa', case when pontuacao >= 70 then 'alta' when pontuacao >= 40 then 'media' else 'baixa' end,
    count(*), null, null, null, null
  from marcada group by 2
  union all
  select 'nota',
    case when nota is null then 'sem' when nota < 4 then 'ate4' when nota < 4.5 then '4' when nota < 4.8 then '45' else '48' end,
    count(*), null, null, null, null
  from marcada group by 2
  union all
  select 'nota_media', '', count(nota), null, null, null, sum(nota) from marcada
  union all
  select 'novos_semana', s.i::text, count(*), null, null, null, null
  from (
    select (p_semanas - 1 - floor(((select d from hoje) - (m.criado_em at time zone 'America/Sao_Paulo')::date) / 7.0))::int as i
    from marcada m
  ) s
  where s.i between 0 and p_semanas - 1
  group by s.i
  union all
  select 'envios_semana', s.i::text, count(*), null, null, null, null
  from (
    select (p_semanas - 1 - floor(((select d from hoje) - (cl.enviado_em at time zone 'America/Sao_Paulo')::date) / 7.0))::int as i
    from public.prospeccao_campanha_leads cl
    where cl.enviado_em is not null
      and (p_busca is null or exists (
        select 1 from public.prospeccao_busca_leads bl where bl.busca_id = p_busca and bl.lead_id = cl.lead_id))
      and cl.enviado_em >= ((select d from hoje) - (7 * p_semanas))::timestamp at time zone 'America/Sao_Paulo'
  ) s
  where s.i between 0 and p_semanas - 1
  group by s.i
  union all
  select 'respostas_dia', to_char((cl.enviado_em at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'),
    count(*), null, null, count(*) filter (where cl.respondeu_em is not null), null
  from public.prospeccao_campanha_leads cl
  where cl.enviado_em is not null
    and (p_busca is null or exists (
      select 1 from public.prospeccao_busca_leads bl where bl.busca_id = p_busca and bl.lead_id = cl.lead_id))
    and cl.enviado_em >= ((select d from hoje) - (p_dias - 1))::timestamp at time zone 'America/Sao_Paulo'
  group by 2;
$$;
revoke execute on function public.prospeccao_resumo_da_base(uuid, date, int, int) from public, anon, authenticated;
grant execute on function public.prospeccao_resumo_da_base(uuid, date, int, int) to service_role;

-- A tabela de campanhas: uma pagina na ordem do indice (criada_em desc, id), com o total, os enviados,
-- as falhas, as respostas e os envios por dia dos `p_dias` dias que terminam em `p_hoje` (o mini grafico
-- da linha), tudo so depois do limite.
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
    where (p_status is null or c.status = p_status)
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
revoke execute on function public.prospeccao_campanhas_pagina(text, text, int, int, date, int) from public, anon, authenticated;
grant execute on function public.prospeccao_campanhas_pagina(text, text, int, int, date, int) to service_role;

-- Quantas campanhas em cada situacao (o filtro da tabela).
create or replace function public.prospeccao_campanhas_contagens()
returns table (status text, n int)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.status, count(*)::int from public.prospeccao_campanhas c group by c.status;
$$;
revoke execute on function public.prospeccao_campanhas_contagens() from public, anon, authenticated;
grant execute on function public.prospeccao_campanhas_contagens() to service_role;

-- O PAINEL DE RESULTADOS em formato longo: gemeo de resultadoDaCampanha, respostasPorEspera e
-- enviosPorDia (lib/prospeccao.ts), que o app dobra (`resultadoDasLinhas`). Escopo: uma campanha
-- (`p_campanha`) ou todas; sem janela (`p_de` null) entram todas as linhas, a fila tambem (o detalhe,
-- "desde o inicio"); com janela, so as tentadas em [p_de, p_ate) (a aba, no periodo). Dimensoes:
-- total, na_fila, falharam, pararam (n), enviados (enviados, responderam), variante, hora_envio (8 a 17,
-- a hora do envio em Sao Paulo), dia_semana (0 = domingo), hora_resposta (n), espera (0 ate 15 min,
-- 1 ate 60, 2 ate 180, 3 o resto, em minutos sem arredondar), mediana (n = minutos, cada espera
-- arredondada antes, como o app) e dia (chave = dias desde `p_serie_de`, ate `p_serie_ate`, de todas as
-- linhas do escopo, sem a janela).
create or replace function public.prospeccao_resultados(
  p_campanha uuid default null,
  p_de timestamptz default null,
  p_ate timestamptz default null,
  p_serie_de date default null,
  p_serie_ate date default null
) returns table (
  dimensao text,
  chave int,
  n bigint,
  enviados bigint,
  responderam bigint
)
language sql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
  with escopo as (
    select cl.*
    from public.prospeccao_campanha_leads cl
    join public.prospeccao_campanhas c on c.id = cl.campanha_id
    where (p_campanha is null or cl.campanha_id = p_campanha)
      and c.status <> 'rascunho'
  ),
  janela as (
    select e.* from escopo e
    where p_de is null or (coalesce(e.enviado_em, e.tentado_em) >= p_de and coalesce(e.enviado_em, e.tentado_em) < p_ate)
  ),
  saidos as (
    select j.*,
      (j.enviado_em at time zone 'America/Sao_Paulo') as envio_sp,
      (j.respondeu_em at time zone 'America/Sao_Paulo') as resposta_sp,
      extract(epoch from (j.respondeu_em - j.enviado_em)) / 60.0 as espera_min
    from janela j
    where j.enviado_em is not null
  )
  select 'total', 0, count(*), null::bigint, null::bigint from janela
  union all
  select 'na_fila', 0, count(*) filter (where j.status = 'na_fila'), null, null from janela j
  union all
  select 'falharam', 0, count(*) filter (where j.status = 'falhou'), null, null from janela j
  union all
  select 'pararam', 0, count(*) filter (where j.status = 'parou'), null, null from janela j
  union all
  select 'enviados', 0, null, count(*), count(s.respondeu_em) from saidos s
  union all
  select 'variante', s.variante, null, count(*), count(s.respondeu_em) from saidos s where s.variante is not null group by s.variante
  union all
  select 'hora_envio', extract(hour from s.envio_sp)::int, null, count(*), count(s.respondeu_em) from saidos s group by 2
  union all
  select 'dia_semana', extract(dow from s.envio_sp)::int, null, count(*), count(s.respondeu_em) from saidos s group by 2
  union all
  select 'hora_resposta', extract(hour from s.resposta_sp)::int, count(*), null, null
  from saidos s where s.respondeu_em is not null group by 2
  union all
  select 'espera', case when s.espera_min < 15 then 0 when s.espera_min < 60 then 1 when s.espera_min < 180 then 2 else 3 end,
    count(*), null, null
  from saidos s where s.respondeu_em is not null group by 2
  union all
  select 'mediana', 0,
    round(percentile_cont(0.5) within group (order by greatest(0, round(s.espera_min::numeric))))::bigint, null, null
  from saidos s where s.respondeu_em is not null having count(*) > 0
  union all
  select 'dia', ((e.enviado_em at time zone 'America/Sao_Paulo')::date - p_serie_de)::int, null, count(*), count(e.respondeu_em)
  from escopo e
  where p_serie_de is not null and e.enviado_em is not null
    and e.enviado_em >= p_serie_de::timestamp at time zone 'America/Sao_Paulo'
    and e.enviado_em < (coalesce(p_serie_ate, p_serie_de) + 1)::timestamp at time zone 'America/Sao_Paulo'
  group by 2;
$$;
revoke execute on function public.prospeccao_resultados(uuid, timestamptz, timestamptz, date, date) from public, anon, authenticated;
grant execute on function public.prospeccao_resultados(uuid, timestamptz, timestamptz, date, date) to service_role;

-- Os leads de UMA campanha (o detalhe): na ordem da fila, busca pelo nome sem acento e filtro por situacao.
create or replace function public.prospeccao_leads_da_campanha(
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
  total_geral bigint
)
language sql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
  select cl.lead_id, l.nome, l.bairro, l.cidade, cl.status, cl.variante, cl.enviado_em, cl.respondeu_em,
    count(*) over () as total_geral
  from public.prospeccao_campanha_leads cl
  join public.prospeccao_leads l on l.id = cl.lead_id
  where cl.campanha_id = p_campanha
    and (p_status is null or cl.status = p_status)
    and (p_texto is null or public.sem_acento(l.nome) like
      '%' || replace(replace(replace(public.sem_acento(p_texto), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by cl.ordem
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limite, 10), 1), 50);
$$;
revoke execute on function public.prospeccao_leads_da_campanha(uuid, text, text, int, int) from public, anon, authenticated;
grant execute on function public.prospeccao_leads_da_campanha(uuid, text, text, int, int) to service_role;

-- Quantos leads da campanha em cada situacao (o filtro do detalhe e o texto de apoio do topo).
create or replace function public.prospeccao_contagens_da_campanha(p_campanha uuid)
returns table (status text, n int)
language sql
stable
security invoker
set search_path = ''
as $$
  select cl.status, count(*)::int from public.prospeccao_campanha_leads cl
  where cl.campanha_id = p_campanha group by cl.status;
$$;
revoke execute on function public.prospeccao_contagens_da_campanha(uuid) from public, anon, authenticated;
grant execute on function public.prospeccao_contagens_da_campanha(uuid) to service_role;
