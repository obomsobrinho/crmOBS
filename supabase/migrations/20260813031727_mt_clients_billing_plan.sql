-- Fase 4, cobrança: qual plano o tenant assinou. Os limites de cada plano moram
-- em lib/billing.ts (PLANS), não no banco: são regra de produto que muda junto
-- com a tabela de preços, e o servidor e o browser precisam da mesma leitura.
--
-- null = ainda não escolheu plano (trial ou conta interna). Escrita só por
-- service_role (webhook do gateway e rota de cobrança).

alter table public.clients
  add column if not exists billing_plan text;

alter table public.clients
  add constraint clients_billing_plan_check
  check (billing_plan is null or billing_plan in ('essencial', 'profissional', 'avancado'));

comment on column public.clients.billing_plan is
  'Plano assinado: essencial | profissional | avancado. null = sem plano escolhido (trial). Os limites de cada plano ficam em lib/billing.ts (PLANS).';
