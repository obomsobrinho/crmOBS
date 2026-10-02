# n8n webhooks use secret UUID paths, and the CRM flows require header auth
- Date: 2026-10-02
- Status: Accepted
- Area: n8n

## Context
Audit item R-01: the three n8n webhooks had guessable paths (`agente_obm`, `crm-envio-manual`, `crm-envio-ia`) and accepted a POST from anyone. Whoever found the address could send WhatsApp through any tenant's instance. The repo export also carried those paths, so the repository itself leaked the endpoints.

## Decision
- All three webhooks (`Webhook EVO`, `Webhook CRM`, `Webhook IA`) have a random UUID path, treated as a secret like a password.
- `Webhook CRM` and `Webhook IA` (called by the app) require header auth `x-webhook-secret` (n8n credential "CRM webhook secret", type httpHeaderAuth). `Webhook EVO` has no header auth because Evolution calls it and cannot send our header; its secret path is the protection.
- The app sends the header through `headersN8n` (`lib/n8n.ts`) from `N8N_WEBHOOK_SECRET`.
- Real values (paths, secret) live only in env/Vercel, `.env.local` and the n8n credential. The e2e reads `E2E_N8N_WEBHOOK` from `.env.e2e.local`.
- The export in `n8n/` replaces `parameters.path` and `webhookId` with `{{N8N_WEBHOOK_PATH_*}}` / `{{N8N_WEBHOOK_ID_*}}` placeholders (`webhookId` can rebuild the URL). `scripts/checagens.mjs` fails on a real path, on a real `webhookId`, or on a missing `headerAuth` in the two app-called flows.

## Consequences
- Rotating a path or the secret means editing n8n and the env together (app before n8n, see the deploy order rule).
- The export gate also searches for `N8N_WEBHOOK_SECRET` and the three UUID segments (skill `exportar-n8n`).
- Evidence: the re-export on 02/10/2026 showed the three UUID paths live and `headerAuth` on the two CRM flows.
