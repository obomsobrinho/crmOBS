# Asaas billing: subscribe, idempotent public webhook, event map, cash-register screen
- Date: undated (Phase 4, billing)
- Status: Accepted
- Area: billing

## Context
Billing is built and deliberately PARKED during the free beta.

## Decision
- `lib/asaas.ts` (**server-only**) is the API client; any `ASAAS_ENV` different from `producao` falls
  to **sandbox** on purpose.
- ⚠️ **The key starts with `$` and Next expands `$` as a reference to another variable:** in `.env.local`
  it needs a backslash (`\$aact_...`), otherwise it arrives EMPTY with no error; on Vercel it goes raw.
- `POST /api/billing/subscribe` (owner-only) creates customer + subscription and returns the
  `invoiceUrl` (Asaas page where the person picks Pix, boleto or card); it does **not** mark the account
  `active`, because subscribing is not paying. Plan change does a `PUT` on the value of the existing
  subscription (creating another would charge twice). `DELETE` on the same route cancels and records
  the reason.
- `POST /api/billing/webhook` is **public**, authenticated by the `asaas-access-token` header
  (`ASAAS_WEBHOOK_TOKEN`) and **idempotent by event id** (`billing_events.asaas_event_id` UNIQUE; a
  resend hits the constraint and exits with 200). It finds the tenant by 3 paths:
  `billing_subscription_id` -> `billing_customer_id` -> `externalReference`.
- Event map: `PAYMENT_CONFIRMED`/`RECEIVED` -> `active`; `PAYMENT_OVERDUE` -> `past_due` + grace;
  `PAYMENT_REFUNDED` -> `past_due` without grace; **`PAYMENT_DELETED` does NOT change state** (it
  happens in administrative cleanup and when canceling; blocking because of our own housekeeping would
  be a self-inflicted wound).
- The `/assinatura` screen is a **cash register, not a storefront**: the sales page lives on the site;
  here only three plan lines, CPF/CNPJ (gateway requirement; the document is **not** stored in our DB),
  payment and cancellation. `?plano=` pre-selects the line for the link coming from the site.

## Consequences
Webhook handlers must stay idempotent by event id. Never block an account from a `PAYMENT_DELETED`.
