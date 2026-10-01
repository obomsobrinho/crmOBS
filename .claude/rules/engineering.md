# Engineering musts (always loaded, apply even to new files)

These caused real owner complaints. Check each one BEFORE writing a list, query, subscription or screen.
Scoped rules (`data`, `realtime`, `ui`, ...) add detail; this file is the floor.

## Never size for the beta
- Production scale from day one. Every list paginates 10 at a time with infinite scroll; search goes to the server with debounce (`lib/use-debounce.ts`, `lib/use-paginada.ts`). Never fetch hundreds of rows to filter in memory.  (why: docs/adr/2026-10-01-production-loading-and-realtime-rules.md)
- Always list explicit columns in `select(...)`; no `select("*")` on lists, and never pull `persona`/`agent_config` into a list or a layout.
- Counters are HEAD/aggregate queries or SQL functions (`inbox_pagina`, `inbox_contagens`), never "fetch rows then `.length`".  (why: docs/adr/2026-10-01-production-loading-and-realtime-rules.md)
- New screens that load data: say how it paginates, how it searches and what the realtime does to ONE row, before coding.

## Realtime
- A realtime event updates ONLY the changed row. Never refetch the whole list on an event. A hidden tab does not fetch.  (why: docs/adr/2026-10-01-production-loading-and-realtime-rules.md)
- Never `.subscribe()` without a status callback; refetch on every `SUBSCRIBED` after the first and on focus return. Subscribe only through `useCanalTenant` / `useCanalConversa` (`lib/use-canal-ao-vivo.ts`, which owns all of that) and filter by tenant.  (why: docs/adr/2026-08-31-realtime-subscribe-callback-and-focus-refetch.md)
- Listening to a table not in the `supabase_realtime` publication is a silent dead handler (and refuses the whole channel). Detail in `realtime.md`.

## Reuse the base layer
- Never hand-write a button, input, textarea, card, tabs, dialog, sheet, select, switch, badge, avatar, stat or scroll area with loose classes. Use `components/ui/`. Before writing `className` on a screen, look for the variant; the same class soup twice becomes a variant.  (why: docs/design-system/camada-base.md)
- Scrollable areas use `<AreaRolavel>` (dissolves at the edges), never a bare `div` with `overflow-y-auto`. Async buttons use `carregando`, not a disabled button.  (why: docs/design-system/fundamentos-superficie.md, docs/adr/2026-09-26-button-carregando-prop.md)
- Colors, type roles and spacing come from `app/globals.css` tokens and `docs/design-system/`. Never `fill` colors as text; green/amber/red are state only; no fixed product name in a component (`lib/brand.ts`).  (why: docs/design-system/fundamentos-cor.md)

## Tenant isolation and secrets
- Every query and policy is tenant-scoped. `client_id` always points to the TENANT (`clients`), never to the contact. New RLS uses `(select auth.uid())`. New tables: RLS on, no grant to `anon`.  (why: docs/adr/undated-tenant-isolation-pool-rls.md)
- `service_role` (`lib/supabase/service.ts`) only on the server, never in the browser. Env vars listed in `data.md` are server-only: never `NEXT_PUBLIC`, never in chat, never committed.
- Enforce permissions and access on the server (route handler, page guard, RLS/grant). Hiding a button is not enforcement.  (why: docs/adr/undated-subscription-access-gate-read-only-mode.md)
- The browser never writes conversation tables except the granted columns (see `data.md`); n8n or service_role routes write.  (why: docs/adr/undated-crm-reads-only-n8n-writes-conversations.md)
- Any list or count over conversations excludes the notices number (`ehNumeroDeAvisos`, `lib/avisos.ts`).  (why: docs/adr/2026-09-29-numero-de-avisos-is-never-a-conversation.md)

## One source of truth per business rule
- A business rule lives in ONE pure `lib/` module (no I/O, no HTTP), used by server and browser: `lib/billing.ts` (access), `lib/mensagem.ts` (who replied), `lib/periodo.ts`, `lib/onboarding.ts`, `lib/avisos.ts`, `lib/horarios.ts`, `lib/pipeline.ts`, `lib/agent-prompt.ts` (`compilePersona`). Never copy the rule into a route, a component or SQL by hand. If SQL must repeat it, say so in the module and keep the two equal.
- Before adding a rule, grep for an existing module. Two opinions about the same number is how the product starts to lie.  (why: docs/adr/2026-08-27-dashboard-imported-is-not-ai-reply.md)

## Dates and writing
- Dates and day boundaries on screen and in logic use `America/Sao_Paulo` (`FUSO`, `lib/format.ts`; `diaSP`, `lib/inbox.ts`). Never UTC, never `Date.now()` in a Server Component body (wrap the clock, e.g. `agoraMs()`).  (why: docs/adr/2026-09-27-dates-on-screen-use-sao-paulo-timezone.md)
- The zone and screen date formatters live ONLY in `lib/fuso.ts` (`FUSO`, `diaIsoSP`, `dataLongaSP`, `diaMesCurtoSP`, `diaMesHoraSP`); never type `"America/Sao_Paulo"` elsewhere. Contact name = `nomeDoContato` (`lib/inbox.ts`); ninth digit spellings = `grafiasDeDigitos` (`lib/avisos.ts`).  (why: docs/adr/2026-10-01-one-source-for-timezone-names-and-phone-spellings.md)
- NEVER use an em dash or en dash in any visible text, generated prompt, error message or doc. Use comma, period, colon or parentheses.
- Visible vocabulary: "Agente ativo" / "Desativado" for the agent switch, never "pausado" (pausada = the AI of ONE conversation when a human took over).  (why: docs/adr/undated-agent-enabled-vs-published-at.md)

## Never invent
- Never invent a value (enum, ID, port, schema, credential, number shown to a customer). If unknown, leave it out or NULL and ask. `null`/unclassified is a valid state (`account_type`, plan).  (why: docs/adr/2026-08-28-account-type-identifies-not-authorizes.md)
- Business-behavior divergence is the owner's call, case by case. Do not create an automatic criterion to decide alone.

## Machine checks
- `eslint.config.mjs` encodes the checkable lines of this file (`no-restricted-syntax`). They are warnings for legacy code, but the PostToolUse hook (`.claude/hooks/lint.mjs`) lints every edited file with `--max-warnings 0`: a file you touch must come out clean.
- A real exception (e.g. `/agente` has a `sticky` footer, so no scroll mask) gets `// eslint-disable-next-line no-restricted-syntax -- <reason>`. Never disable without a reason.

## Next 16
- Middleware is `proxy.ts` (exports `proxy`). Route `params` is a Promise (`await ctx.params`). Read `node_modules/next/dist/docs/` before coding.
