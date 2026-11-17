# Environment variables: one reader, a check that logs and never blocks the boot

Date: 2026-11-16. Status: Accepted. Area: data, deploy.

## Context

Plan 2.9 (D4, adjusted on 11/11/2026) asks for one `lib/env.ts` with the server and the public variables in two Zod schemas, validated once against the Vercel variable list and enforced the day the owner confirms the list, plus a lint against `process.env` outside it. The owner sent the Production list on 16/11/2026 (a screenshot, names only):

`APIFY_TOKEN`, `CRON_SECRET`, `APIFY_WEBHOOK_SECRET`, `ADMIN_USER_IDS`, `N8N_WEBHOOK_SECRET`, `N8N_BOT_WEBHOOK_URL`, `N8N_IA_SEND_WEBHOOK_URL` (Production and Preview), `N8N_SEND_WEBHOOK_URL`, `BETA_ABERTO`, `N8N_LOOKUP_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `OPENAI_API_KEY`. "System Environment Variables" is enabled.

Findings against the code:
- `ASAAS_API_KEY`, `ASAAS_ENV` and `ASAAS_WEBHOOK_TOKEN` are read by the code (`lib/asaas.ts`, the billing webhook) and are NOT in the Project tab of Production. They may live in the Shared (team) tab, which the screenshot does not show.
- `BETA_ABERTO` is read by nothing since 15/10/2026 (the free-access switch left the code).
- `OPENAI_AGENT_MODEL` is optional (default in `lib/agent.ts`); `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_ENV` are filled by Vercel.
- Preview deployments carry only `N8N_IA_SEND_WEBHOOK_URL`.

## Decision

1. `lib/env.ts` is the only file that reads `process.env`: `envDoServidor(nome)` (typed union of the 19 server names, read at call time, the same value and semantics as the old `process.env.X`) and `envPublico` (the public pair written literally so Next inlines it). No Zod and no lists in it: `lib/supabase/client.ts` imports it on every page.
2. `lib/env-conferir.ts` (server only) holds the lists (13 required server variables, 6 optional, 2 required public ones), the two Zod schemas built from them, `faltasNoAmbiente` (pure, Vitest) and `conferirAmbiente`. A compile-time check fails the build when a name of the type is in neither list.
3. Required = in the Vercel list AND the product does not work without it. The three Asaas variables are OPTIONAL until the owner confirms where they live (a required variable that is really absent would only log, but the list must not claim what was not seen).
4. Enforcement LOGS, it never throws: `conferirAmbiente` runs at module scope of `lib/supabase/service.ts` (once per server instance), only when `VERCEL_ENV === "production"`, and writes the missing NAMES (never a value) with `console.error`. Every route keeps its own answer for a missing variable, exactly as before (the sweep rule: no route changes status or sentence).
5. Lint: `no-restricted-properties` (`process.env`) as ERROR on `app/`, `components/`, `lib/`, `features/` and `proxy.ts`, except `lib/env.ts` and `*.test.ts`. Tests, scripts and configs read their own variables. `process.env.NODE_ENV` stays literal in its four places (`proxy.ts`, `components/NovidadesModal.tsx`, the two `/design` layouts) with a disable comment.

## Why not throw at boot

A thrown error at start takes the whole app down, attendance included, for a variable that may only feed one route (Apify, the cron). Preview deployments would never start (they carry one variable). Each route already answers its own error when its variable is missing, and the log names the gap at the first request of every instance, which is what the owner needs to fix it in Vercel.

## Why not `instrumentation.ts`, why `NODE_ENV` stays literal

Measured on 16/11/2026 with B8 (production build, `e2e/desempenho.orcamento.spec.ts`):
- the commit before this change: login 231 kB, `/painel` 325, `/campanhas` 479;
- with `instrumentation.ts` holding the check: +1 kB on every route;
- with `NODE_ENV` read through a constant exported by `lib/env.ts`: +1 kB on every tenant route, because `NovidadesModal` kept its dev-only code (a cross-module constant is not folded; the literal is);
- final: login 232, `/painel` 325, `/campanhas` 480 (ceiling 480), `/campanhas/buscas/nova` 466.

The remaining +1 kB on some routes is not code: the total gzip of all client chunks went DOWN by 1.3 kB (2,135,482 to 2,134,175 bytes). Turbopack's numeric module ids grew from 5 to 6 digits (for example 71689 to 871689) because the project has more modules, and every chunk references them. Any new module anywhere may do the same; Campanhas has no margin left under its ceiling.

## Consequences

- A new environment variable goes into the type in `lib/env.ts` and into one list of `lib/env-conferir.ts` (the build fails otherwise), then is read through `envDoServidor`.
- The owner checks the Shared tab for the Asaas variables. If they are not there, billing in Production runs against the sandbox (`ASAAS_ENV` absent) and the payment answers 500 (key absent). If they are, they move to the required list.
- `BETA_ABERTO` can be deleted from Vercel.
- `e2e/central-clientes-lib.design.spec.ts` checks the Apify webhook and the cron read their secret through `envDoServidor`.
