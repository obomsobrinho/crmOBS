-- Campanhas, a prospeccao do dono do produto (docs/plano-campanhas.md, secao 8), 29/10/2026.
-- RASCUNHO NAO APLICADO: espera as decisoes do dono (D1 a D17). Nao aplicar antes da aprovacao;
-- depois de aplicar, regenerar lib/database.types.ts e pôr prospeccao_campanhas em
-- TABELAS_DO_CLIENTE (lib/admin-purga.ts), porque ela tem client_id.
-- Decisoes do dono em 29/10/2026: manda pelo numero da propria OBS (client_id = a empresa OBS) e no
-- maximo 10 abordagens por dia (teto_diario ate 10).
-- Tudo so service_role: o navegador fala apenas com /api/admin/campanhas/*.

create table if not exists public.prospeccao_campanhas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  segmento text not null default '',
  cidade text not null default '',
  ofertas text[] not null default '{site,atenda}' check (ofertas <@ array['site', 'atenda'] and cardinality(ofertas) > 0),
  voz jsonb not null default '{}'::jsonb,
  textos jsonb not null default '{}'::jsonb,
  cadencia jsonb not null default '[0, 3, 7]'::jsonb,
  teto_diario int not null check (teto_diario between 1 and 10),
  intervalo_min_s int not null check (intervalo_min_s >= 60),
  intervalo_max_s int not null,
  janela jsonb not null,
  base_legal_ref text not null check (length(btrim(base_legal_ref)) >= 3),
  status text not null default 'rascunho' check (status in ('rascunho', 'ativa', 'pausada', 'encerrada')),
  pausada_motivo text,
  proximo_envio_em timestamptz,
  criada_por uuid references auth.users(id) on delete set null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  check (intervalo_max_s >= intervalo_min_s)
);

-- Uma campanha ativa por empresa (o mesmo freio do Deskcomm): duas ativas mandariam 10 cada.
create unique index if not exists prospeccao_uma_ativa
  on public.prospeccao_campanhas (client_id) where status = 'ativa';

create table if not exists public.prospeccao_leads (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.prospeccao_campanhas(id) on delete cascade,
  fonte text not null check (fonte in ('google_places', 'apify', 'cnpj', 'manual')),
  fonte_id text,
  nome text not null,
  telefone text not null check (telefone ~ '^[0-9]{10,13}$'),
  segmento text,
  cidade text,
  bairro text,
  site text,
  nota numeric(2, 1),
  avaliacoes int,
  horario jsonb,
  -- O raio-X do site: classe (sem_site, so_rede_social, fora_do_ar, com_falhas, bom) e o que falta.
  raio_x jsonb,
  angulo text check (angulo in ('site', 'atenda', 'site_e_atenda')),
  sinais jsonb not null default '{}'::jsonb,
  pontuacao int not null default 0 check (pontuacao between 0 and 100),
  status text not null default 'escolhido' check (status in (
    'escolhido', 'na_fila', 'abordado', 'respondeu', 'convertido', 'descartado', 'saiu', 'falhou'
  )),
  toque int not null default 0 check (toque between 0 and 3),
  proximo_toque_em timestamptz,
  contato_id bigint references public.dados_cliente(id) on delete set null,
  abordado_em timestamptz,
  respondeu_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Um numero e abordado uma vez na vida, em qualquer campanha.
create unique index if not exists prospeccao_telefone_uma_vez on public.prospeccao_leads (telefone);
-- A fila do dia: acompanhamentos vencidos e escolhidos por pontuacao, por campanha.
create index if not exists prospeccao_leads_fila
  on public.prospeccao_leads (campanha_id, status, proximo_toque_em);
create index if not exists prospeccao_leads_pontuacao
  on public.prospeccao_leads (campanha_id, pontuacao desc, id) where status = 'escolhido';

-- Cada envio aprovado, so acrescenta. As contas contam carimbo, nao status.
create table if not exists public.prospeccao_envios (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.prospeccao_leads(id) on delete cascade,
  toque int not null check (toque between 1 and 3),
  texto text not null,
  aprovado_em timestamptz not null default now(),
  aprovado_por uuid references auth.users(id) on delete set null,
  enviar_a_partir_de timestamptz,
  enviado_em timestamptz,
  resultado text check (resultado in ('enviado', 'recusado', 'pulado')),
  erro text,
  unique (lead_id, toque)
);
create index if not exists prospeccao_envios_pendentes
  on public.prospeccao_envios (enviar_a_partir_de) where enviado_em is null and resultado is null;

-- Quem pediu para sair (ou nao pode ser abordado) nunca mais recebe. Fica mesmo quando o lead e apagado.
create table if not exists public.prospeccao_exclusoes (
  telefone text primary key check (telefone ~ '^[0-9]{10,13}$'),
  motivo text not null check (motivo in ('saiu', 'cliente', 'manual', 'falhou')),
  em timestamptz not null default now()
);

alter table public.prospeccao_campanhas enable row level security;
alter table public.prospeccao_leads enable row level security;
alter table public.prospeccao_envios enable row level security;
alter table public.prospeccao_exclusoes enable row level security;

revoke all on public.prospeccao_campanhas, public.prospeccao_leads, public.prospeccao_envios,
  public.prospeccao_exclusoes from public, anon, authenticated;
grant select, insert, update, delete on public.prospeccao_campanhas, public.prospeccao_leads,
  public.prospeccao_envios, public.prospeccao_exclusoes to service_role;
