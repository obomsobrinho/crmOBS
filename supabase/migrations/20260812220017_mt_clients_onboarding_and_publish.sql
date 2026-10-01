-- Fase 4, onboarding guiado: os dois sinais que faltavam para o produto saber em
-- que passo o dono está, sem depender de checkbox que a pessoa marca à mão.
--
-- `agent_published_at` não é só cosmético: é o interruptor do agente no WhatsApp.
-- Antes disso um tenant novo conectava o WhatsApp e a IA já respondia cliente
-- real com persona de emergência, o que é aceitável quando somos nós criando as
-- contas na mão, e inaceitável em cadastro self-service.

alter table public.clients
  add column if not exists agent_published_at timestamptz,
  add column if not exists onboarding_tested_at timestamptz;

-- Os tenants existentes JÁ ESTÃO NO AR (OBM em produção): entram publicados,
-- senão o gate de publicação silenciaria o bot de verdade.
update public.clients
   set agent_published_at = coalesce(agent_published_at, now());

comment on column public.clients.agent_published_at is
  'Quando o dono publicou o agente. null = não publicado: /api/agent responde em silêncio (messages vazio) e a mensagem do cliente continua sendo gravada, para um humano responder. Write só por service_role.';
comment on column public.clients.onboarding_tested_at is
  'Primeira vez que o dono testou o agente no /playground. Só alimenta o progresso do onboarding.';
