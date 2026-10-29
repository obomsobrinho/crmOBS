-- Campanhas v2, a prospeccao do dono do produto (docs/plano-campanhas.md, secao 7), 29/10/2026.
-- RASCUNHO NAO APLICADO: so depois que o dono aprovar layout e regras e liberar o DDL. Depois de
-- aplicar: regenerar lib/database.types.ts e por prospeccao_campanhas em TABELAS_DO_CLIENTE
-- (lib/admin-purga.ts), porque ela tem client_id (a empresa da conexao que envia).
-- Entidades: buscas, leads (deduplicados pelo telefone), campanhas, variantes da mensagem e o lead
-- dentro da campanha (situacao, variante, enviado_em, respondeu_em). Uma mensagem por lead, sem
-- segundo toque; no maximo 10 por dia por campanha, das 8h as 18h (lib/prospeccao.ts).
-- Tudo so service_role: o navegador fala apenas com /api/admin/campanhas/*.

create table if not exists public.prospeccao_buscas (
  id uuid primary key default gen_random_uuid(),
  termo text not null check (btrim(termo) <> ''),
  cidade text not null check (btrim(cidade) <> ''),
  status text not null default 'buscando' check (status in ('buscando', 'pronta', 'falhou')),
  -- A fonte e trocavel (lib/fonte-de-leads.ts): o id da execucao dela, para o webhook e a consulta.
  fonte text not null,
  -- O que foi pedido à fonte (OpcoesDaBusca, lib/prospeccao.ts): termos, cidade, UF, quantidade por termo,
  -- nota mínima, site, fechadas, contatos. `termo` e `cidade` acima ficam para a lista e a busca da tela.
  opcoes jsonb not null default '{}'::jsonb,
  fonte_execucao_id text,
  total int not null default 0 check (total >= 0),
  erro text,
  criada_por uuid references auth.users(id) on delete set null,
  criada_em timestamptz not null default now(),
  concluida_em timestamptz
);
create index if not exists prospeccao_buscas_lista on public.prospeccao_buscas (criada_em desc, id);
create unique index if not exists prospeccao_buscas_execucao
  on public.prospeccao_buscas (fonte, fonte_execucao_id) where fonte_execucao_id is not null;

create table if not exists public.prospeccao_leads (
  id uuid primary key default gen_random_uuid(),
  -- A busca que trouxe o lead primeiro; as outras que o acharam ficam em prospeccao_busca_leads.
  busca_id uuid not null references public.prospeccao_buscas(id) on delete restrict,
  fonte_id text,
  nome text not null,
  segmento text,
  endereco text,
  bairro text,
  cidade text,
  -- So digitos com 55. null = a busca nao trouxe celular valido (o lead aparece, nunca entra em campanha).
  telefone text check (telefone ~ '^55[0-9]{10,11}$'),
  site text,
  nota numeric(2, 1),
  avaliacoes int,
  pontuacao int not null default 0 check (pontuacao between 0 and 100),
  marcacao text check (marcacao in ('bom', 'descartado')),
  -- Pediu para parar: fora de toda lista futura, para sempre.
  parou_em timestamptz,
  criado_em timestamptz not null default now()
);
create unique index if not exists prospeccao_leads_telefone on public.prospeccao_leads (telefone) where telefone is not null;
create index if not exists prospeccao_leads_da_busca on public.prospeccao_leads (busca_id, pontuacao desc, id);

create table if not exists public.prospeccao_busca_leads (
  busca_id uuid not null references public.prospeccao_buscas(id) on delete cascade,
  lead_id uuid not null references public.prospeccao_leads(id) on delete cascade,
  primary key (busca_id, lead_id)
);
create index if not exists prospeccao_busca_leads_lead on public.prospeccao_busca_leads (lead_id);

create table if not exists public.prospeccao_campanhas (
  id uuid primary key default gen_random_uuid(),
  -- A empresa da conexao que envia ("Numero que envia"); as respostas caem nela.
  client_id uuid references public.clients(id) on delete cascade,
  nome text not null default '',
  status text not null default 'rascunho'
    check (status in ('rascunho', 'agendada', 'rodando', 'pausada', 'concluida')),
  agendada_para timestamptz,
  -- O recorte do passo Contatos (busca, so bons, sem site, quem nao respondeu de outra campanha).
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
create index if not exists prospeccao_campanhas_lista on public.prospeccao_campanhas (criada_em desc, id);

create table if not exists public.prospeccao_variantes (
  campanha_id uuid not null references public.prospeccao_campanhas(id) on delete cascade,
  ordem int not null check (ordem between 0 and 2),
  texto text not null,
  primary key (campanha_id, ordem)
);

create table if not exists public.prospeccao_campanha_leads (
  campanha_id uuid not null references public.prospeccao_campanhas(id) on delete cascade,
  lead_id uuid not null references public.prospeccao_leads(id) on delete restrict,
  -- A posicao na fila (pontuacao ao iniciar); a variante sai de ordem % quantas variantes.
  ordem int not null,
  status text not null default 'na_fila' check (status in ('na_fila', 'enviado', 'respondeu', 'falhou', 'parou')),
  variante int check (variante between 0 and 2),
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
create index if not exists prospeccao_campanha_leads_aguardando
  on public.prospeccao_campanha_leads (campanha_id, enviado_em) where status = 'enviado';

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
