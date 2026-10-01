-- Fase 4: estado de assinatura por tenant. Quem escreve estas colunas é SEMPRE
-- service_role (webhook do gateway / rotas de cobrança): `clients` não tem grant
-- de UPDATE para `authenticated`, então o browser não consegue se auto-liberar.
-- A leitura vem no mesmo select do getMyClient (grant de SELECT já é da tabela).

alter table public.clients
  add column if not exists subscription_status text not null default 'trialing',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists grace_until timestamptz,
  add column if not exists billing_provider text,
  add column if not exists billing_customer_id text,
  add column if not exists billing_subscription_id text,
  add column if not exists billing_seats integer,
  add column if not exists billing_updated_at timestamptz;

-- Os tenants que já existem são contas em uso (OBM em produção e Loja Teste),
-- não estão em trial: entram como `active` para que o gate não bloqueie nada.
update public.clients
   set subscription_status = 'active',
       billing_updated_at = now();

alter table public.clients
  add constraint clients_subscription_status_check
  check (subscription_status in ('trialing', 'active', 'past_due', 'canceled'));

alter table public.clients
  add constraint clients_billing_provider_check
  check (billing_provider is null or billing_provider in ('asaas', 'stripe'));

alter table public.clients
  add constraint clients_billing_seats_check
  check (billing_seats is null or billing_seats >= 0);

-- O webhook do gateway chega com o id da assinatura/cliente e precisa achar o
-- tenant. Único parcial: duas contas nunca apontam para a mesma assinatura.
create unique index if not exists clients_billing_subscription_id_key
  on public.clients (billing_subscription_id)
  where billing_subscription_id is not null;

create unique index if not exists clients_billing_customer_id_key
  on public.clients (billing_customer_id)
  where billing_customer_id is not null;

comment on column public.clients.subscription_status is
  'Estado da assinatura: trialing | active | past_due | canceled. O CHECK garante o conjunto (lib/billing.ts confia nisso). Escrita só por service_role.';
comment on column public.clients.trial_ends_at is
  'Fim do teste gratuito. Em trialing, depois desta data o acesso é bloqueado (accessState em lib/billing.ts).';
comment on column public.clients.grace_until is
  'Carência: em past_due o acesso continua liberado até esta data (boleto/Pix atrasa alguns dias). null = sem carência.';
comment on column public.clients.billing_provider is
  'Gateway da assinatura: asaas | stripe. null = nunca assinou (trial ou conta interna).';
comment on column public.clients.billing_customer_id is
  'Id do cliente no gateway (usado pelo webhook para achar o tenant).';
comment on column public.clients.billing_subscription_id is
  'Id da assinatura no gateway (usado pelo webhook para achar o tenant).';
comment on column public.clients.billing_seats is
  'Assentos cobrados na última sincronização com o gateway. A contagem real de membros sai de user_clients; esta coluna serve para conferência.';
comment on column public.clients.billing_updated_at is
  'Última vez que o estado de assinatura mudou (webhook ou rota de cobrança).';
