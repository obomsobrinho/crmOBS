---
paths:
  - "lib/billing.ts"
  - "lib/asaas.ts"
  - "lib/beta.ts"
  - "app/api/billing/**"
  - "app/api/team/**"
  - "app/assinatura/**"
  - "components/BillingBanner.tsx"
  - "components/BillingCheckout.tsx"
  - "components/SubscriptionPanel.tsx"
  - "lib/auth.ts"
---
# Billing, access gate, plans

Billing is built and PARKED on purpose during the free beta.

- Access rule lives ONLY in `lib/billing.ts` (`accessState`, pure; its only import is `plural` from the pure `lib/format.ts`); server and browser use the same function. Never reimplement it.  (why: docs/adr/undated-subscription-access-gate-read-only-mode.md)
- Blocked account = READ-ONLY mode, never expelled. `/inbox`, `/perfil`, `/assinatura` stay open. Never block on unknown status, nor on `trialing` without `trial_ends_at`.  (why: docs/adr/undated-subscription-access-gate-read-only-mode.md)
- Enforce on the server at four points: `requireActiveTenant()` (`lib/auth.ts`) in EACH paid page (`/pipeline`, `/painel`, `/agente`, `/conhecimento`, `/equipe`), not in the layout; `processTurn` silent turn before model/RAG; `POST /api/send` returns 402; UI `readOnly` prop on `MessageComposer` plus the guard in `toggleIa`. Hiding a button is not the gate.  (why: docs/adr/undated-subscription-access-gate-read-only-mode.md)
- Subscription columns are written only by service_role (gateway webhook).
- `clients.account_type` IDENTIFIES, never authorizes: never read it inside `accessState`; `null` is valid (unclassified, no default).  (why: docs/adr/2026-08-28-account-type-identifies-not-authorizes.md)
- `BETA_ABERTO=1` (`lib/beta.ts`) frees every tenant except a manual block or a deactivation. Before turning it off, mark Vitalício (central, tab Financeiro) whoever must stay free: the central list shows how many would be blocked today (`admin_bloqueados_sem_beta`).  (why: docs/adr/2026-09-23-beta-open-master-switch.md, docs/adr/2026-10-15-vitalicio-replaces-the-beta-switch.md)
- `accessState` returns a `kind` (`desativado`, `bloqueado`, `vitalicio`, `beta_aberto`, `ativo`, `em_teste`, `teste_encerrado`, `carencia`, `atrasado_bloqueado`, `cancelado`, `desconhecido`); precedence deactivated, then manual block, then vitalício, then the beta switch, then the stored status. Screens, filters, `contaDesativada` (`lib/auth.ts`) and the `processTurn` gate map from `kind`; never read `desativada_em`, `bloqueado_em` or `vitalicio_desde` elsewhere to decide access. `BillingRow` REQUIRES the three columns: every gate selects them. Two SQL twins repeat the rule (the list filter of `admin_empresas_pagina` and `admin_bloqueados_sem_beta`, each commented as such): change them together.  (why: docs/adr/2026-10-15-vitalicio-replaces-the-beta-switch.md)
- Vitalício (`clients.vitalicio_desde`) = full access, never charged, never blocked by trial, payment or grace. Manual block (`clients.bloqueado_em`) = read-only mode, also with the beta switch on. Both (and `desativada_em`) change ONLY through `admin_mudar_conta`: the trigger `clients_guarda_da_conta` raises `42501` for any other writer of the marks AND for any other writer of the subscription columns of a vitalício company (fail loudly, never a silent revert). Every new signup still gets the 7-day trial.  (why: docs/adr/2026-10-15-vitalicio-replaces-the-beta-switch.md)
- Prices live in `lib/billing.ts` (`PLANS`); `clients.billing_plan` stores only WHICH plan. `planFor` returns `null` for no plan and `null` means NO limit; never default to a plausible plan.  (why: docs/adr/undated-plans-and-seat-limit.md)
- The owner is not an attendant: `billableSeats(total)` = `total - 1` (never "discount the dono role").  (why: docs/adr/undated-plans-and-seat-limit.md)
- Only the attendant seat limit is enforced (`seatState` + 409 in `POST /api/team/invite`, counted via service_role). `funnels`, `conversations`, `features` in `PLANS` are NOT enforced; do not enforce without a decision. Downgrading removes nobody.  (why: docs/adr/undated-plans-and-seat-limit.md)
- `lib/asaas.ts` is server-only; any `ASAAS_ENV` other than `producao` means sandbox. The Asaas key starts with `$`: escape as `\$aact_...` in `.env.local` (else it arrives EMPTY with no error), raw on Vercel.  (why: docs/adr/undated-asaas-billing-and-webhook.md)
- `POST /api/billing/subscribe` (owner-only) never marks an account `active` (subscribing is not paying); a plan change is a `PUT` on the existing subscription, never a second one; `DELETE` cancels and records the reason.  (why: docs/adr/undated-asaas-billing-and-webhook.md)
- `POST /api/billing/webhook` is public, authed by `asaas-access-token` (`ASAAS_WEBHOOK_TOKEN`), idempotent by `billing_events.asaas_event_id` UNIQUE (a duplicate returns 200). Tenant lookup: `billing_subscription_id`, then `billing_customer_id`, then `externalReference`.  (why: docs/adr/undated-asaas-billing-and-webhook.md)
- Event map lives ONLY in `atualizacaoDoEvento(evento, agora)` (`lib/billing.ts`, pure, only event to update): `PAYMENT_CONFIRMED`/`RECEIVED` -> `active`; `PAYMENT_OVERDUE` -> `past_due` + grace; `PAYMENT_REFUNDED` -> `past_due` no grace; `PAYMENT_DELETED` NEVER changes state. The webhook decides vitalício: its three tenant lookups select `id, vitalicio_desde`, and a vitalício company is never written (`billing_events.error = 'ignorado: cliente vitalicio'`). Subscribing a vitalício company is refused (409).  (why: docs/adr/undated-asaas-billing-and-webhook.md, docs/adr/2026-10-15-vitalicio-replaces-the-beta-switch.md)
- `/assinatura` is a cash register, not a storefront; CPF/CNPJ is required by the gateway and NEVER stored in our DB. `?plano=` preselects a row.  (why: docs/adr/undated-asaas-billing-and-webhook.md)
- Meta charges Official API service messages from 01/10/2026: any migration math needs variable cost, not zero.
