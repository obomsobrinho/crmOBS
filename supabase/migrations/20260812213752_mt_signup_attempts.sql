-- Fase 4: o signup é a ÚNICA rota pública que cria dados (login + tenant), então
-- precisa de freio de abuso. Em serverless (Vercel) não existe memória
-- compartilhada entre invocações, logo o contador tem que ficar no banco.
-- Tabela de uso interno: RLS ligada e SEM policy, mais revoke explícito, então
-- só service_role (a rota de signup) escreve e lê. anon/authenticated não veem.

create table if not exists public.signup_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  email text,
  ok boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists signup_attempts_ip_created_idx
  on public.signup_attempts (ip, created_at desc);

create index if not exists signup_attempts_created_idx
  on public.signup_attempts (created_at desc);

alter table public.signup_attempts enable row level security;

revoke all on public.signup_attempts from anon, authenticated;

comment on table public.signup_attempts is
  'Tentativas de cadastro público (freio de abuso do /api/signup). Só service_role. Linhas com mais de 24h podem ser apagadas: a rota faz a limpeza por oportunidade.';
comment on column public.signup_attempts.ip is
  'IP de origem da tentativa, só para contar tentativas na janela. Não é dado de cliente.';
comment on column public.signup_attempts.ok is
  'true = o cadastro foi concluído. Tentativa falha também conta para o limite (senão dá para varrer e-mails de graça).';
