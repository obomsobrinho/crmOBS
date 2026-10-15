# Plan: "Clientes" central for the product owner (evolves `/admin`)

Status: DRAFT for the owner's approval (14/10/2026). Decisions taken with the owner in chat.

## Why

The owner needs ONE place to follow each company that uses the CRM (his customers): usage, health,
plan and payment, and actions. Not a menu full of separate admin pages. The first slice (`/admin`
with the Empresas list and the AI cap, `docs/plano-custo-ia.md`) is the base; this plan reshapes it.

## Decisions (owner, 14/10/2026)

1. **Name and access**
   - Menu item **"Clientes"**, shown ONLY to the product owner (`ADMIN_USER_IDS`, `lib/admin-acesso.ts`).
     Anyone else: no menu item, and the routes answer 404 (never reveal they exist), as today.
   - Routes (owner's choice, 14/10/2026): **`/clientes`** (list) and **`/clientes/[id]`** (detail) are
     the owner's central. The companies' contacts list moves to **`/contatos`** and `/contatos/[id]`
     (its screen name is already "Contatos").
   - For anyone who is NOT the product owner, `/clientes` and `/clientes/[id]` REDIRECT to `/contatos`
     (and `/contatos/[id]` when the id is a contact of their own tenant; otherwise `/contatos`): old
     bookmarks keep working and nothing reveals the central exists. The redirect is decided on the
     server (proxy/page), never by hiding UI. Every central API route stays 404 for non-owners.
   - The guard is per route (no shared prefix), so EVERY new central page and route must call the same
     guard (`ehAdmin` / `adminDaSessao`); a test lists the central routes and asserts the guard on each.
   - `/admin` redirects to `/clientes` for the owner and stays 404 for everyone else. The API moves from
     `/api/admin/*` to `/api/clientes-central/*` or stays `/api/admin/*` (executing agent's call; it is not
     visible), guard `adminDaSessao` unchanged.
   - Update links, NavRail, mobile bar, specs and CLAUDE.md routes. Tables and `lib/clientes.ts` keep
     their names.
   - In the central, the companies are called "clientes" (the tenants). Glossary in CLAUDE.md updated.

2. **List** (glance, paginated 10 + infinite scroll + server search with debounce, filter by situation):
   name; plan and situation (Vitalício, Em teste with days left, Ativo, Atrasado, Cancelado, Desativado);
   WhatsApp connected or down; agent active; AI usage this month (bar, % of cap, US$); last activity;
   one alert chip when something needs attention: near or at the cap, WhatsApp down, payment late,
   no activity for 7 days, setup not finished. Row click opens the detail.

3. **Detail page with tabs** (header: name, situation badge, main alert):
   - **Visão geral**: company and owner (name, e-mail), created at, setup finished or not, WhatsApp
     state, agent on/off and mode (guiado/avançado), team size, notice destination set or not, last
     activity, the alerts.
   - **Uso de IA**: today / 7 days / month; a per-day chart for the month; peak hours (hour x weekday
     grid over the last 30 days); estimated US$; the cap with the edit control (moves here from the list
     dialog, still one transaction with the audit row).
   - **Atendimento** (what to improve or offer): conversations in the period, how much the AI answered
     vs the team (`lib/mensagem.ts`), help requests by reason (`lib/motivos.ts`) and by solution
     (`lib/solucoes.ts`), saved rules count, response time if already measured in `lib/painel.ts`
     (reuse the panel's numbers, never a second formula).
   - **Financeiro**: plan, subscription status, trial end, grace, billing provider ids (masked), seats,
     charges history if Asaas has it; actions: mark **Vitalício** / remove it, extend trial (days), change
     plan, block / release. Every action goes through a server route and an `admin_acoes` row.
   - **Ações** (danger zone, separate tab): Desativar / Reativar, and Apagar de vez (see 5).

4. **"Vitalício" replaces the beta switch** (owner: "um formato vitalício que nunca cobra")
   - New access state **vitalício**: full access, never charged, never blocked by trial or payment.
     It lives in the access rule (`lib/billing.ts`, `accessState`), because `account_type` identifies
     and never authorizes (`docs/adr/2026-08-28-account-type-identifies-not-authorizes.md`).
     Storage: a new `subscription_status` value `lifetime` (check constraint updated) or a dedicated
     column, the executing agent picks the one that keeps one source of truth, and the Asaas webhook
     must NEVER overwrite a vitalício company.
   - Every new signup still gets the 7-day trial. The owner follows who is testing in the central and
     marks Vitalício whoever he wants to keep free.
   - `BETA_ABERTO` (`lib/beta.ts`) stays until the owner turns it off. The central shows, while it is on,
     a notice with HOW MANY companies would be blocked if it were turned off today (not vitalício, not
     active, trial over), so he marks them before switching. Removing the switch is a later step.

5. **Deleting a company in two steps** (owner agreed)
   - **Desativar**: AI stops, logins of that company are blocked (a clear screen, not an error), nothing
     is deleted. Reversible (**Reativar**).
   - **Apagar de vez**: only for a deactivated company, confirmed by typing its name. Removes conversations,
     contacts, help requests, files in Storage, the Evolution instance, cancels the Asaas subscription,
     and the company's users that belong to no other company. Before it, the screen offers to export the
     data (LGPD). The deletion is recorded in `admin_acoes` (who, when, company name and id; no content).
     Implement the purge as one server routine that lists every table with `client_id` (so a new table
     cannot be forgotten silently: a test compares the list against the schema).

6. **Out of this plan**: prospecting and owner campaigns become a separate menu item **"Campanha"**,
   to be discussed later. Real charging (turning billing on) stays a separate decision.

## Data and performance notes
- Per-company aggregates (per day, hour x weekday, counts) come from SQL functions over indexed
  columns (`agent_turns(client_id, created_at)`, `chat_messages(client_id, created_at)`, `handoffs`),
  service_role only, bounded windows (30 days), never fetching rows to count in memory.
- The list keeps one keyset query (`admin_empresas_pagina` evolves), alerts computed in SQL or from
  columns already read, no N+1 per row (WhatsApp state: use what is stored; never call Evolution for
  each row of the list; the detail may check live).
- Every write is a server route guarded by `adminDaSessao` + `revalidar`, with `admin_acoes`.

## Tests
- sem-login design specs for list, each tab, danger zone, and the hidden menu item.
- Unit: access rule with vitalício (never blocked, webhook cannot downgrade), alerts, purge table list
  vs schema.
- Serial on the OBS tenant: mark/unmark vitalício, extend trial, deactivate/reactivate (restore at the
  end). NEVER run "apagar de vez" against a real tenant in tests: a disposable tenant created and purged
  by the test itself.
- Attendant and non-admin: `/clientes` and `/clientes/[id]` redirect to `/contatos`, every central API
  route is 404, no menu item.

## Rules and ADR
- `.claude/rules/admin.md` updated (central routes, menu visibility, danger zone, purge routine).
- `.claude/rules/billing.md` (vitalício), CLAUDE.md routes and glossary.
- ADRs: central with tabs; vitalício replaces the beta switch; two-step deletion.

## Execution (how this plan is run)

The owner opens an ARCHITECT session (model and effort chosen by him). The architect never implements:
it spawns one executing subagent per delivery, reviews, runs the suites and shows the owner.

### Deliveries, model and effort per executing subagent

| Delivery | Scope | Subagent model | Effort |
|---|---|---|---|
| 1 | Routes (`/clientes` central, `/contatos`, redirects for non-owners, `/admin` redirect), menu item only for the owner, list, detail with tabs Visão geral, Uso de IA, Atendimento | `sonnet` | high |
| 2 | Tab Financeiro and its actions, Vitalício in the access rule (webhook never downgrades it), the `BETA_ABERTO` notice, tab Ações (Desativar / Reativar / Apagar de vez with export and purge routine) | `opus` | high |

- The architect passes `model` and `effort` explicitly when spawning each subagent (Agent tool), never the default.
- Delivery 2 starts only after the owner approves delivery 1 on screen.
- Executing subagents: no commit, no push; never run the login suites (`logado`, `atendente`, `logado-serial`) nor the paid ones (`ia`, `n8n`, `bateria`); they run `npx tsc --noEmit`, lint on changed files with `--max-warnings 0`, `npm run checar` and `npm run test:e2e -- --project=sem-login`, and report (files, migrations, decisions left for the owner).

### Closing each delivery (mandatory, in this order)

1. **`/simplify`** on the delivery's diff (reuse, simplification, efficiency, altitude). The architect may run the reviewers as read-only subagents and sends the deduped findings back to the SAME executing subagent to apply.
2. **`/code-review`** at `high` on the diff after step 1 (correctness and security: guards on every central route, tenant isolation, redirects revealing nothing, money and deletion paths). Findings go back to the executing subagent; the architect re-reports them with `outcome` after the fixes.
3. Suites run by the architect: `sem-login`, `test:e2e:ia`, `test:e2e:bateria`, `test:e2e:login`, `npm run build`. A failure that passes alone is noted as known flaky in the report, never ignored silently.
4. Show the owner the screens (local link and `/design` preview) and get approval.
5. Commit and push only after approval; after deploy, run `test:e2e:n8n` when the delivery touches the attendance path, and update `docs/handoff.md` (top) and `docs/proximos-passos.md`.

## Delivery 1 revision: owner feedback on screen (14/10/2026), IMPLEMENTED (15/10/2026, awaiting architect review; see `docs/adr/2026-10-15-charts-recharts-in-base-layer.md`)

State: delivery 1 implemented, reviewed (/simplify, /code-review high) and suites green (see chat); NOT committed. The owner did not approve the screen yet: he asked for a richer dashboard first. Start this revision when the usage limit resets, with the same executing-subagent flow (sonnet, high), then the same closing steps. Delivery 2 still waits for approval of delivery 1.

Decisions (owner, 14/10/2026):
1. Chart library: add the shadcn `chart` component (Recharts underneath) to `components/ui/`, themed with the design-system tokens (load the `dataviz` skill before writing charts). Tooltips on every chart.
2. Tab "Uso de IA": merge the "Limite de IA do mes" card and "Uso por dia no mes" into ONE interactive chart (per-day consumption with hover tooltip: day, tokens, turns, US$; the cap shown on the same chart). Period filter with the SAME chips as /painel and Atendimento (Dia, Semana, Quinzena, Mes; `lib/periodo.ts`).
3. "Horarios de pico": keep the weekday x hour heatmap, add a hover tooltip per cell (e.g. "quarta, 14h: 23 turnos"), a scale legend and the peak highlighted.
4. Tab "Atendimento": metrics are right; improve the LAYOUT with real charts (owner open to pie/donut, line, area where they fit). A new metric only if it is a genuinely good insight (never invented numbers).
5. Owner's general note: "da para melhorar muito", use the variety of chart types where each fits.
