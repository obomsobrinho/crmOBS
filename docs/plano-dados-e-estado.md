# Plan: data and state, one pattern for the whole app

Status: **Decisions closed by the owner on 11/11/2026** (section 9). Written 10/11/2026. Before Step 0 starts, another agent reviews this spec and the owner holds a strategy conversation; no code changes until then.

**Performance is the first goal of this plan.** The budget in section 3 is the acceptance criterion of every step and stays a rule after the plan ends. This document is the single roadmap for data, state and performance; the documentation map is in section 6.

Inputs:
- The owner's complaints of 10/11/2026: every screen change shows loading; refresh inside a lead list goes back to the general list; deleting a lead then another answers "Este lead já saiu da lista.".
- The slowness diagnosis of the same day: the production build measured locally against the production Supabase, plus Supabase logs and `pg_stat_statements`.
- The architecture proposal `arquitetura-atenda-2026-11-10.html` and its review `revisao-arquitetura-atenda-2026-11-10.html` (owner's vault, `assets/atenda/`). Every item the review marked "to check" was checked in the repository and in the database; the answers are inline.

Relation to `docs/plano-carregamento.md`: that plan is **kept and referenced, not replaced**.
- Its six owner rules stay binding: paginate by 10 with infinite scroll, server search with debounce, realtime touches only the changed row, a hidden tab does not fetch, Conversas opens on "today" plus open help requests, messages load only when the conversation opens.
- Its database work (keyset list RPCs, trigram search, `(select auth.uid())` in RLS) is the foundation this plan builds on.
- What this spec supersedes is its browser layer: the generic `lib/use-paginada.ts` and the per-screen fetch hooks are replaced, area by area, by the query layer below.

Out of scope for the whole plan:
- **Design** (Light theme weight on the other screens, component audit, accessibility, critique, copy). The owner decided on 10/11/2026 that the design front starts only after this whole plan is executed. The component audit is NOT a prerequisite of the Base. The track it will follow is fixed in section 7; the only design work inside this plan is the single pattern for the new screen states (7.1), defined in the Base.
- Bulk selection with batch actions in the Leads tab (noted for later).
- Cache Components / `staleTimes` / `unstable_instant` (Next 16). Re-evaluated after Step 3, with measurements.
- Buying a bigger Supabase compute. Step 0 measures; the purchase is the owner's call with the numbers.

## 1. What is wrong today (measured)

| Symptom | Cause in the code | Number |
|---|---|---|
| Every click shows a loading screen | Every page and layout is `force-dynamic` and awaits all reads before returning anything; the only per-screen skeletons are `inbox/[id]` and `clientes/[id]`, the rest falls back to the generic `app/(app)/loading.tsx` | Click to new screen 0.2 to 4.7 s on the local production build; up to 14.8 s for one read in production at 12h15 BRT, 10/11 |
| Server waterfalls | Pipeline, Pedidos and Agenda await 3 rounds in series; Painel 2 | each round = one Supabase round trip |
| Campanhas re-reads on every tab switch and on the way back | `useLeitura` keeps data in component state; unmount drops it. It also re-reads in the browser what the server just sent | 2 to 5 reads per click (0.07 to 0.36 s warm, 1 to 5.8 s in a spike) |
| Refresh loses the open list and filters | `tela` and every filter are `useState`; no component reads the URL (`useSearchParams` is used nowhere) | all screens |
| Delete then delete again: "já saiu da lista" | after a delete `useLeitura` keeps the OLD page on screen until the re-read returns; the deleted row stays clickable; the total is stale | the stale window = one re-read |
| Five ways to read, four ways to update after a write | `useLeitura`, `usePaginada`, `useCarga`, `lembrar` (admin), per-screen hooks; local patch, `versao` bump, `contato-bus`, `router.refresh` | none written down as a rule |
| Three error shapes from the API | `{ error }` (148 places), `{ ok: false, erro }` (14), `{ ok: false, error }` (1); no browser handling of 401; no `error.tsx` anywhere | |
| Inputs checked by hand | the 62 routes check bodies with `typeof`; 34 files read `process.env` directly with no schema; webhooks from n8n, Asaas, Apify and the crons are parsed by hand | |
| No production performance numbers | no Web Vitals, no `Server-Timing`, no navigation timing | the 14.8 s was found in Supabase logs, by hand |

## 2. The pattern

### 2.1 Three places for state, no mixing

| State | Lives in | Examples |
|---|---|---|
| Server data | TanStack Query cache (browser) | lists, pages, counters, a lead, a campaign |
| Navigation | URL, through nuqs | tab, open list, filters, search, page, open item |
| Interaction | `useState` in the component (or react-hook-form inside a form, 2.12) | dialog open, field being typed, focus, hover |

No global store and no Context for database data. Context is allowed only to inject the data SOURCE (real or fake for `/design`), never data.

### 2.2 Read and write path, by operation type (D1)

Tenant screens read directly from the browser through RLS; API routes carry sensitive and business writes. Admin areas (Campanhas, `/clientes`) read through API routes because they read with `service_role` and RLS does not cover them.

```
READ (tenant screen)     component -> area hook -> useQuery(queryFn = area source) -> supabase-js (browser, user JWT) -> PostgREST -> RLS -> RPC/table
READ (admin area)        component -> area hook -> useQuery -> fetch /api/admin/... -> rotaDoAdmin -> Zod -> service (service_role) -> Postgres
COMMON WRITE             component -> useMutation (optimistic) -> supabase-js on a GRANTED column only (data.md) -> RLS
SENSITIVE / BUSINESS     component -> useMutation (optimistic) -> fetch /api/... -> sessaoDaRota or rotaDoAdmin (revalidar) -> Zod -> service -> Postgres
MACHINE CALLERS          n8n, Asaas, Apify, pg_cron, Vercel Cron -> /api/... -> secret check -> Zod -> service -> Postgres
BACK CHANNEL             Postgres -> Realtime -> useCanalTenant / useCanalConversa -> cache bridge (2.7) -> setQueryData or invalidate
```

Why not every read through a route (measured on 10/11, local production build, warm database): reads through an API route took 66 to 360 ms (median about 130 ms) against 53 to 101 ms for direct browser reads, and every read would become a Vercel invocation.

### 2.3 First paint: the click never waits for data

Where the request waits today (checked):
- `proxy.ts` runs on every request (documents, RSC and prefetches): `auth.getClaims()`, local JWT check, no network except when the token expired (then one call to `/auth/v1/token`, measured 351 to 572 ms, once per hour per user).
- `app/(app)/layout.tsx` awaits `getMyClient()` and then `agendaAtivaDoTenant()`.
  - `getMyClient()` is getClaims plus `clients` and `user_clients` in parallel: one round.
  - `agendaAtivaDoTenant()` is a second round, inline in the JSX.
  - `estadoDoConsumoDoTenant` is inside `<Suspense fallback={null}>` and does NOT block.
  - On a client navigation inside the `(app)` group the layout is not re-rendered (Next partial rendering), so these rounds cost only on a hard load and on prefetches.
- Every page awaits the session again (`requireActiveTenant`, `getMyClient` or `adminDaPagina`, memoized per request) and then its data.
- `app/(app)/contatos/layout.tsx` and `app/(app)/inbox/layout.tsx` await their first list page. A `loading.tsx` inside those folders sits BELOW their layout, so it cannot show before the list read; today the generic `(app)/loading.tsx` covers them.

The pattern:
1. **Every route has its own `loading.tsx`** that draws the screen's static frame (title, tabs, filters, buttons, empty blocks) with no data and no session.
   - In production `<Link>` prefetches every dynamic route up to its loading boundary, so this frame paints at the click.
   - The session gate keeps running in the page on the server while the frame is visible. The frame holds nothing sensitive, and a redirect still happens before any data appears.
2. **Pages and segment layouts do not await data.** They await only the gate (session, tenant, access) and render the client screen, which reads through `useQuery`. Segment layouts that read lists (`contatos`, `inbox`) stop reading.
3. **Data blocks use `useQuery` and show their own skeleton while `isPending`.**
   - No Suspense for data: `useSuspenseQuery` in a client component also runs during SSR in the App Router, without the browser session.
   - No server prefetch and no `HydrationBoundary` in the initial scope; re-evaluated only for Conversas, in Step 4, with numbers.
4. Server reads that stay (the gate, an `?abrir=` lookup) run in parallel, never in series.

Trade-off accepted: on a first visit the data starts after hydration (measured about 350 ms after the RSC response on the local build), instead of arriving in the HTML. In exchange the click never waits, and every later visit opens from the cache.

### 2.4 Query client configuration

| Option | Value | Why |
|---|---|---|
| `staleTime` | 30 s for lists and counters; 5 min for configuration (stages, team, plans) | realtime keeps lists current; configuration rarely changes |
| `gcTime` | 30 min | agreed with the review: memory is cheap and more screens open from the cache. A tab with Conversas open all day stays bounded because only visited keys are kept |
| `refetchOnWindowFocus` | `false` | `useCanalTenant`/`useCanalConversa` already revalidate on focus return (`realtime.md`); both on would read twice. Their focus callback invalidates the area keys instead |
| `refetchOnReconnect` | `false` | agreed with the review, same reason: the realtime hooks refetch on every `SUBSCRIBED` after the first |
| `retry` | 1 for queries, 0 for mutations | a repeated write can duplicate; the error goes to the screen |
| Persist the cache on the device | no | tenants' customer data (LGPD) on possibly shared devices |
| Client lifetime | one `QueryClient` per signed-in session; `clear()` on logout and on account switch | keys do not carry the tenant id because the client never outlives the session |

### 2.5 Query keys: one format

`[area, entity, kind, params?]`, built only through one key factory per area, never written inline.

```ts
// features/campanhas/api/chaves.ts
export const chavesDeLeads = {
  tudo: ["campanhas", "leads"] as const,
  listas: () => [...chavesDeLeads.tudo, "lista"] as const,
  lista: (p: ParamsDaLista) => [...chavesDeLeads.listas(), p] as const,
  detalhe: (id: string) => [...chavesDeLeads.tudo, "detalhe", id] as const,
};
```

Invalidation is always by prefix (`chavesDeLeads.listas()` refreshes every list and keeps the details).

### 2.6 Writes: optimistic, safe under rapid clicks

Every mutation follows the same script:
- change the cache at the click;
- undo with the INVERSE operation if the server refuses (never restore a snapshot of the whole list, which would erase the other pending mutations);
- invalidate only when it is the last pending mutation of its key;
- totals change together with the rows.

```ts
// features/campanhas/api/leads.ts (illustrative; helpers tested in Step 1)
const chaveDeTirarLead = ["campanhas", "leads", "tirar"] as const;

export function useTirarLead(buscaId: string | null) {
  const qc = useQueryClient();
  const fonte = useFonteDeCampanhas();
  return useMutation({
    mutationKey: chaveDeTirarLead,
    mutationFn: (id: string) => fonte.removerLead(id, buscaId),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: chavesDeLeads.listas() });
      const removida = acharLinha(qc, chavesDeLeads.listas(), id); // only the row and where it was
      qc.setQueriesData({ queryKey: chavesDeLeads.listas() }, tirarDaPagina(id)); // removes the row, total - 1
      return { removida };
    },
    onSuccess: (r, _id, ctx) => {
      // "nao_encontrado" means the row is already gone: same end state, not an error
      if (!r.ok && r.codigo !== "nao_encontrado") desfazer(qc, ctx);
    },
    onError: (_e, _id, ctx) => desfazer(qc, ctx), // inverse operation: puts back THIS row, total + 1
    onSettled: () => {
      // the current mutation still counts here: 1 means "I am the last one"
      if (qc.isMutating({ mutationKey: chaveDeTirarLead }) === 1) {
        return qc.invalidateQueries({ queryKey: chavesDeLeads.listas() });
      }
    },
  });
}

function desfazer(qc: QueryClient, ctx?: { removida: LinhaRemovida | null }) {
  if (ctx?.removida) qc.setQueriesData({ queryKey: chavesDeLeads.listas() }, devolverNaPagina(ctx.removida));
}
```

- The error is shown in place (the row comes back with the reason), with the shared error component (2.9).
- Simpler fallback allowed for low-traffic writes: do not reinsert, show the reason and let the final invalidation bring the row back.
- The `isMutating(...) === 1` check inside `onSettled` is the concurrent-optimistic-update pattern recommended by the TanStack maintainers. A Vitest unit test proves it in Step 1 before Campanhas uses it.
- Infinite lists: `tirarDaPagina` and `devolverNaPagina` work on both shapes, `{ itens, total }` and `{ pages: [...] }`, and are pure functions (tested).

### 2.7 Realtime into the cache, by event type

`lib/use-canal-ao-vivo.ts` stays the only place that opens channels. What changes is what the callbacks do: they write to the cache through one bridge per area instead of touching component state.

| Event | Rule |
|---|---|
| UPDATE | Patch the row in every cached key that holds it (`setQueriesData` by id). If the row's sort or filter column changed (e.g. `last_message_at`, `stage`), treat it as INSERT plus DELETE. |
| INSERT | Invalidate the area's list and counter keys, debounced (500 ms, the value `inbox-fonte` already uses) so a burst becomes one read. Exception: where a pure placement rule already exists (`encaixar`, `lib/inbox-lista.ts`), fetch only the row and place it, as today. |
| DELETE | Checked in the Supabase docs (Realtime, Postgres Changes, 10/11/2026): DELETE events are **not filterable** and **RLS is not applied** to them; with RLS on and `REPLICA IDENTITY FULL`, `old` carries **only the primary key**. So a DELETE is a hint: remove that id from the cache if present, then the debounced invalidation of lists and counters. Never read tenant or content from a DELETE payload. |
| Echo of our own write | While a mutation of the same area is pending (`isMutating({ mutationKey: [area] }) > 0`), events of that area are not applied; they mark the area dirty, and the last mutation's invalidation covers them. |
| Reconnect (`SUBSCRIBED` after the first) and focus return | Invalidate the area's keys (replaces today's per-screen refetch). The first `SUBSCRIBED` is still skipped. |

`REPLICA IDENTITY FULL` keeps the old values on UPDATE. Today 7 published tables are FULL and `conversation_qualifications` is default (append-only). The reason in `realtime.md` ("RLS must evaluate the old row") does not match the docs above; the correction is listed in section 8.

### 2.8 URL state (D3: nuqs)

Tab, open list or item, filters, search, sort and page live in the URL, read and written through nuqs with one parser per parameter.
- Opening a list or an item pushes a history entry; typing a filter or a search replaces it (debounced, the same 300 ms).
- The server page reads the same parameters, through the same parsers, to choose redirects and the frame.
- Every parameter has a Zod-backed parser (2.9), so a hand-edited URL never crashes a screen: an invalid value falls back to the default.
- nuqs's support for Next 16.2 and its compressed size are checked at install (Step 1) before it is added; if either fails, the fallback is a small own helper on `useSearchParams` plus `window.history.replaceState`/`pushState` (which Next 16 syncs with the router), and the owner is told.

### 2.9 Validation, errors, session expiry (D4: Zod on every input)

**Validation.** Every input crosses a Zod schema before it is used, and the TypeScript type comes from the schema:

| Input | Where the schema lives | When |
|---|---|---|
| API route bodies and query strings | `features/<area>/schemas.ts`, applied by a helper inside `sessaoDaRota`/`rotaDoAdmin` | area routes in their step; every remaining route in a final sweep (Step 5) |
| Webhooks from n8n (`/api/agent`, `/api/inbound-media`, `/api/clients/by-instance/[instanceName]`) | `features/conversas/schemas.ts` | Step 4, with the n8n battery before and after |
| Asaas webhook (`/api/billing/webhook`) | `features/assinatura/schemas.ts` | Step 1 in shadow mode, enforced in Step 3 |
| Apify webhook and the crons (`/api/prospeccao/apify`, `/api/prospeccao/cron`, `/api/agenda/lembretes`) | the owning area's `schemas.ts` | Step 2 (Campanhas) and Step 3 (Agenda) |
| URL parameters | the nuqs parsers (2.8) | with each screen |
| Forms | the same schema through the react-hook-form resolver (2.12) | new or complex forms |
| Environment variables | one `lib/env.ts`: server variables and `NEXT_PUBLIC_*` in two schemas, optional ones marked optional with the degradation `data.md` already describes (e.g. without `APIFY_TOKEN` "Nova busca" answers 503) | Step 1 in shadow mode, enforced after the owner confirms the Vercel variable list |

**Shadow mode** for every machine caller and for the environment: the schema parses and logs every mismatch without rejecting, for at least one week of real traffic. Only after zero mismatches (or after the schema is fixed to match what the callers really send) does it start to reject. A webhook that starts refusing real payloads would break attendance or billing silently.

**One error shape** for every API route: HTTP status plus `{ error: string, codigo?: string }`.
- `error` is the sentence the screen shows (Portuguese); `codigo` is the machine reason (`nao_encontrado`, `ativa`, ...).
- It keeps the shape 148 places already use; the 15 occurrences of `{ ok: false, erro }` and `{ ok: false, error }` converge to it area by area.
- Webhook answers keep whatever status and body their caller expects (n8n and Asaas read them); the shape applies to routes the app calls.

**Session expired**: one global handler on the query client (queries and mutations). A 401 sends to `/login`, keeping the URL to come back; no screen handles 401 by itself.

**Errors per block**: a query error renders the block's error state with "Tentar de novo" (one shared component), never a blank screen. A render crash is caught by `app/(app)/error.tsx` (none exists today).

### 2.10 Observability in production (D7: own beacon)

Without it nobody can prove the 14.8 s are gone.
- **Browser marks**: click to frame (the route's `loading.tsx` or the frame painted) and click to first data (the first block's query settled), per route. Also Next's `useReportWebVitals` for LCP, INP and CLS.
- **Transport**: batched and sent with `navigator.sendBeacon` to one route (`/api/telemetria`, Zod on the body, no session required beyond the cookie, rate limited per session). It never blocks a screen and never retries.
- **Storage**: one table with route, metric, value in ms, day and tenant id. No personal data: no user id, no phone, no URL parameters. RLS on, no grant to `anon` or `authenticated`, insert only through the route with `service_role`. The migration is DDL and waits for the owner's release, like every migration. Column names and retention are settled in Step 1.
- **Reading**: one saved SQL query (p50, p75, p90 per route per day) next to the five usage queries in `docs/instrumentacao-uso.md`, plus the Supabase-side hourly edge query (B9). Read weekly into `docs/handoff.md`.

### 2.11 Source injection and `/design`

The `queryFn` calls the area SOURCE (today `lib/*-fonte.ts`, after the move `features/<area>/api/fonte.ts`), taken from a provider. `/design` mounts the same provider with the fake source (`fonte-de-mentira`), so the design e2e suite keeps running without a database. A source never imports the query client; a hook never imports `supabase-js` directly.

### 2.12 Forms (D5: ready in the Base, used when needed)

The app has few forms today and they work; none is migrated. The pattern is ready from the Base so a new or complex form (the owner expects verticalized segments to bring them) starts on it:
- react-hook-form plus `@hookform/resolvers` with the area's Zod schema, and the shadcn `Form` component added to `components/ui/form.tsx` on top of the existing `input`, `select`, `checkbox`, `textarea` and `switch`.
- "Complex" means more than a couple of fields, cross-field validation, or a field array. A one-field form (a search, a rename) stays a controlled input.
- The submit is a `useMutation` (2.6), so the same optimistic and error rules apply.
- Bundle: the library loads only on routes that render a form; its size is measured at install (B8).

### 2.13 Folders: vertical slice (D6)

Each business area owns one folder; `app/` keeps only thin routes; `lib/` keeps only infrastructure.

```
app/                         routes only: page.tsx, layout.tsx, loading.tsx, route.ts (thin: gate, schema, call the area)
features/
  <area>/                    campanhas, contatos, conversas, pipeline, painel, agenda, pedidos, agente, conhecimento, equipe, assinatura, central
    components/              the area's screens and blocks
    hooks/                   the area hooks (useLeads, useTirarLead): the only door from a component to data
    api/                     key factory (chaves.ts), queryOptions, mutations, the source (fonte.ts) and its fake (fonte-de-mentira.ts)
    server/                  services used by routes and pages (today's *-servidor.ts), server-only
    schemas.ts               Zod: route bodies, webhooks, URL parsers, forms
    regras.ts                pure business rules (no I/O), with their Vitest tests next to them
components/
  ui/                        base layer (shadcn and our variants), unchanged rules
  shared/                    used by several areas: NavRail, banners, avatars
lib/                         infrastructure only: supabase/, query/, realtime/, env.ts, format.ts, fuso.ts, utils.ts
```

- Pure rule modules that several areas share and that the rules files cite by path (`lib/billing.ts`, `lib/mensagem.ts`, `lib/periodo.ts`, `lib/avisos.ts`, `lib/horarios.ts`, ...) stay where they are until a delivery updates every citation in `.claude/rules` and `CLAUDE.md` in the same commit (`npm run checar` fails on a cited path that moved).
- An area moves in the step that migrates it, in a commit with only `git mv` and import updates, before or after the behavior commit, never mixed.
- From Step 1, lint warns on a new file loose in `lib/` or at the root of `components/`.

## 3. Performance budget

Every number below says where it came from:
- "Measured" means measured on 10/11/2026: the production build run locally (`next build` + `next start`) against the production Supabase with the owner's session, Playwright timing scripts, and the Supabase logs.
- "External" means a published threshold, named.
- Nothing else.

### 3.1 The budget

| # | Metric | Baseline | Budget | Source of the budget |
|---|---|---|---|---|
| B1 | Click to the screen's frame, client navigation, with the navigation response delayed 3 s | no per-screen frame on most routes; the generic skeleton or the old screen stays until the server answers (0.2 to 4.7 s measured; 14.8 s for one read in production) | ≤ 300 ms | external: Nielsen's response limits (0.1 s feels instant, 1 s keeps the flow); 300 ms leaves room for the test machine over the 0.1 s target |
| B2 | Blocking requests when opening a screen seen in the last 30 min (`gcTime`) | 1 server render plus 0 to 5 reads (Campanhas: 5 on the way back) | 0 | the owner's rule ("the click is instant, only dynamic data loads") |
| B3 | Duplicate reads of the same data in one visit | Campanhas reads on the server and again in the browser: 5 duplicates per entry | 0 | the same rule; a duplicate is pure waste |
| B4 | Optimistic write visible after the click, with the API delayed 1 s | the row stays until the re-read (seconds in a spike) | ≤ 100 ms | external: Nielsen 0.1 s |
| B5 | Production, click to frame, p75 per route per day | not measured (no tool today) | ≤ 300 ms | B1 in the field |
| B6 | Production, click to first data, p75 per route per day | not measured; the Supabase edge saw 652 ms p50 and 7 s p90 for the session read alone on 10/11 | ≤ 1 s | external: Nielsen 1 s |
| B7 | Production hard load: LCP, INP, CLS at p75 | not measured in the field. Local TTFB 0.19 to 0.34 s on Agenda, Agente, Campanhas, Nova busca, Clientes, Equipe and Perfil; 1.4 to 4.8 s on Painel, Conversas, Contatos, Pipeline and Pedidos (cold database, server reads before the HTML). FCP lands about 80 ms after TTFB, so the server decides first paint | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 | external: Google Core Web Vitals "good" thresholds (web.dev) |
| B8 | JS on a hard load, compressed, per route | login 227 kB; tenant routes 277 to 321 kB (Painel 285, Conversas 302, Contatos 295, Pipeline 309, Pedidos 316, Agenda 312, Agente 321, Equipe 297, Perfil 277, Clientes 300); Campanhas 465 kB, Nova busca 446 kB | login ≤ 240 kB; any tenant route ≤ 340 kB; Campanhas and Nova busca ≤ 480 kB; a route growing more than 10 kB in one delivery says why in its handoff line | measured baseline plus the Base's known cost (TanStack Query 10.8 kB measured) and a small margin. Zod, nuqs and react-hook-form are measured at install, and the ceilings are confirmed or adjusted with the owner then |
| B9 | Supabase REST latency at the edge (upstream time), per working hour | p50 96 to 396 ms, p90 about 0.9 to 2.8 s, p99 1.4 to 9 s (24 h to 10/11); best warm hour p50 6 ms, p90 83 ms (6,029 requests) | p90 ≤ 300 ms, p99 ≤ 1 s | measured: the warm hour shows the database can do it; the gap is what Step 0 attributes |
| B10 | Server rounds before a page can render | Pipeline, Pedidos, Agenda 3; Painel 2 | Step 0: ≤ 2; from Step 3: the gate only (1) | measured |

### 3.2 How each number is measured and locked

| # | Measured by | Locked by |
|---|---|---|
| B1 | Playwright against `next build` + `next start`: `page.route` delays RSC navigation requests (those without the `next-router-prefetch` header) by 3 s, which delays the session gate too; the test clicks the menu item and asserts the frame's heading is visible | a new e2e project on the production build (`frame`), with an allow-list of routes that grows per step; run by `fechar-entrega` |
| B2, B3 | the same harness counts requests between the click and the data on screen, and flags two requests for the same query key or route in one visit | same e2e project |
| B4 | e2e per area with writes: API delayed 1 s, five deletes in a row, the row is gone within 100 ms and the total is right; plus the Vitest test of the concurrent-delete helpers | the area's e2e suite and `npm run test:unit` |
| B5, B6, B7 | the production beacon (2.10) | the saved query, read weekly into `docs/handoff.md`; a route over budget for 3 days in a row is a bug ahead of new features (the same priority as an attendance bug) |
| B8 | a script after `next build` that sums the compressed JS each route loads, checked once against the Playwright figure above | the script fails above the ceiling; `fechar-entrega` runs it after the build (`checar` stays offline and does not build) |
| B9 | the hourly edge-log query used in the diagnosis (`edge_logs`, upstream time, `/rest/v1/*`), saved in `docs/instrumentacao-uso.md` | weekly read into `docs/handoff.md`; the fix it calls for is the owner's call (Step 0) |
| B10 | the Supabase edge log timeline of one navigation (Step 0); after Step 3, B1 makes a waterfall visible as a failure | B1 |

There is no CI in this repository (no `.github/workflows`), so "locked" means the `fechar-entrega` skill and the PostToolUse lint hook, as for every other rule here. Step 1 adds `npm run test:unit` and the B8 script to `fechar-entrega`.

## 4. Steps

Each step closes with:
- the `fechar-entrega` skill (types, lint, build, the right suites, and from Step 1 the unit tests and the B8 script);
- the owner's flow: implement, show him, tests, `/simplify` and `/code-review`, `main`;
- one ADR or rule update when it introduces a rule.

An area's move into `features/<area>/` goes in a commit of its own, with no behavior change, never mixed with the behavior commit.

**Start condition**: Step 0 does not start until the external review of this spec is done and the owner has held the strategy conversation (11/11/2026).

### Step 0: immediate relief and the root cause of the 14.8 s

Independent of the migration.

Scope:
1. **Parallel server reads**:
   - Pipeline: `getMyClient` and `pipeline_stages` together, then the columns (3 rounds to 2; the columns need the stage keys).
   - Pedidos: without `?abrir=`, the first page runs together with members and counters (3 rounds to 2).
   - Agenda: config, agenda, week and blocks together after the session (3 rounds to 2; the week read is discarded on the rare redirect).
   - Layout: `agendaAtivaDoTenant` alongside the rest instead of after it, or read in the same `clients` row (the rule "`getMyClient` exposes scalars only" allows a scalar extracted from the jsonb; to be checked against `normalizarConfigDaAgenda`). Hard loads only.
2. **`loading.tsx` per route** with the static frame for Pipeline, Pedidos, Agenda, Painel, Campanhas, Nova busca, Equipe, Agente, Perfil. Contatos and Conversas keep the generic one until Steps 3 and 4 (their layouts read lists, see 2.3).
3. **Root cause measurement** (read only, a short report into `docs/handoff.md` and an ADR if a cause is confirmed). Evidence so far:
   - `select` on `clients` executes in 5 ms on average in Postgres (`pg_stat_statements`, 15 thousand calls), but took 652 ms p50, 7 s p90 and 14.8 s max at the Supabase edge (upstream time) on 10/11. The same query went from 6 ms to 14.8 s within one minute.
   - The time is lost between the Supabase edge and the Postgres executor. That rules out Vercel cold start and the Vercel to Supabase distance as the cause of the seconds. The functions run in `gru1` (`x-vercel-id`; `vercel.json` does not pin it, the project setting does).
   - RLS without an index is ruled out for these two tables: `user_clients` has its PK `(user_id, client_id)`, matching the policy.

   To measure:
   - (a) Supabase dashboard (Reports, Database): CPU, memory and swap, disk IO budget, at 15:10 to 15:20 UTC on 10/11 and at the next spikes, plus the current plan and compute size. Instance settings seen: `max_connections` 60, `shared_buffers` 224 MB, PostgREST pool of 10. Precedent: on 01/10/2026 this database already locked up for lack of memory on the Supabase free plan (`docs/plano-carregamento.md`).
   - (b) Sample `pg_stat_activity` for the `authenticator` connections (active vs idle, wait events) every 5 s during a 30 min working session, to see whether requests queue on the 10-connection pool.
   - (c) Correlate spikes with PostgREST schema cache reloads and pool re-initialization (`postgrest_logs`: 6 reloads in 24 h, one at 15:13:04 UTC just before the worst minute; each migration applied in production triggers one).
   - (d) Correlate with the 5 min `prospeccao_tick_5m` cron (`prospeccao_ativar_agendadas` and `prospeccao_apagar_antigos`: p50 1.25 s, peaks 6 s, at 15:15:00).
   - (e) Time the list RPCs as `authenticated` with a real JWT claim (`set local role` + `request.jwt.claims`) to confirm RLS cost in the functions.
   - (f) Idle effect: a trivial read after 15 to 120 s idle took 0.29 to 1.3 s against 0.17 to 0.24 s warm. It explains part, not the bursts.

Files: `app/(app)/pipeline/page.tsx`, `app/(app)/pedidos/page.tsx`, `app/(app)/agenda/page.tsx`, `app/(app)/layout.tsx`, new `app/(app)/<route>/loading.tsx` files.

Acceptance (measured):
- Pipeline, Pedidos and Agenda do 2 server rounds instead of 3 (counted in the Supabase edge log timeline for one navigation).
- On `next build` + `next start`, clicking each route with a frame shows it in under 300 ms with the navigation RSC response delayed by 3 s (B1).
- A written attribution of the 14.8 s (which hypothesis held, with numbers) and the options with their cost for the owner.

Out: any change to SQL functions, PostgREST or compute settings; any client cache; any move to `features/`.

### Step 1: the Base

Scope:
1. Dependencies, each checked against Next 16.2 and React 19.2 and measured for B8 at install:
   - `@tanstack/react-query` v5 (10.8 kB gzip measured with the hooks we use);
   - `zod`;
   - `nuqs`;
   - `react-hook-form` and `@hookform/resolvers`;
   - `vitest` (dev), with `npm run test:unit`, wired into `fechar-entrega`.
2. `QueryClient` factory with 2.4's defaults and lifetime; the provider in `app/(app)/layout.tsx` and in the `/design` layouts (fake source).
3. The key factory convention (2.5) and the pure cache helpers (`tirarDaPagina`, `devolverNaPagina`, `acharLinha`, patch by id, both list shapes), with Vitest tests including the concurrent-delete case.
4. The realtime bridge (2.7): the callbacks of `useCanalTenant`/`useCanalConversa` call area bridges; event-type rules, debounce, echo suppression. The hooks themselves keep owning channels, status callback, the skipped first `SUBSCRIBED` and the hidden-tab park.
5. nuqs adapter in the root of the app and the shared parsers (2.8).
6. The error shape (2.9): a server helper for routes, a browser parser, the global 401 handler, the shared block error component, `app/(app)/error.tsx`.
7. Zod helpers (2.9): body and query parsing inside `sessaoDaRota`/`rotaDoAdmin`; `lib/env.ts` in shadow mode; the Asaas webhook schema in shadow mode.
8. Forms (2.12): `components/ui/form.tsx` and one documented example in `docs/design-system/camada-base.md`; no existing form migrated.
9. The `features/` skeleton (2.13): the empty structure (the existing `@/*` alias already resolves `@/features/...`) and the lint warning on new loose files.
10. Observability (2.10): marks, beacon route, table (migration released by the owner), saved queries; one day of baseline numbers BEFORE Step 2 ships.
11. Guardrails (section 5): ADRs, rule lines, lint rules.
12. The performance budget tooling (section 3.2): the `frame` e2e project, the request-count assertions, the JS-per-route script with the B8 ceilings, the saved B9 query.
13. The screen states pattern (7.1): the base components and their page in `docs/design-system/camada-base.md`, used by every step from Step 2 on.

Files:
- `package.json`, `vitest.config.ts`
- `lib/query/` (client, keys convention, cache helpers), `lib/realtime/` or `lib/use-canal-ao-vivo.ts` (bridge), `lib/env.ts`
- `lib/rota.ts`, `lib/admin.ts` (schema and error helpers)
- `app/(app)/layout.tsx`, `app/(app)/error.tsx`, `app/design/**/layout.tsx`, `app/api/telemetria/route.ts`, `app/api/billing/webhook/route.ts` (shadow schema only)
- `components/ui/{form,esqueleto,erro-do-bloco}.tsx` (names settled in Step 1)
- `features/` (skeleton), `eslint.config.mjs`, `e2e/` (frame spec, production web server project)
- `supabase/migrations/` (beacon table, after the owner's release)
- `.claude/rules/`, `docs/adr/`, `docs/instrumentacao-uso.md`, `.claude/skills/fechar-entrega/SKILL.md`

Acceptance:
- No visible behavior change.
- `npm run build`, `npm run lint`, `npm run checar`, `npm run test:unit` and the `sem-login` suite pass.
- The concurrent-delete unit test passes: 5 deletes in flight with the 3rd refused end with 4 rows gone, 1 back, total minus 4, one invalidation.
- The baseline observability numbers exist for one day.
- The env and Asaas schemas are logging in shadow mode, with their mismatch count visible.

Out: migrating any screen; enforcing any schema on a machine caller.

### Step 2: Campanhas, the pilot (exit gate for the rest)

Starts only after the `importar-planilha` work is merged into `main` (it edits `components/admin/campanhas`).

Scope:
- Move commit first: `components/admin/campanhas/**`, `lib/campanhas-fonte.ts`, `lib/campanhas-servidor.ts`, `lib/prospeccao.ts` and the other Campanhas-only `lib/` files into `features/campanhas/`. Only `git mv` and imports change.
- `useLeitura`/`usePaginaDaFonte` replaced by the area hooks (queries through the admin API routes).
- No double read: the server stops pre-reading data the client will query; the page keeps only the gate and the frame.
- Optimistic writes for remove lead, delete list, delete campaign and mark lead (`nao_encontrado` on delete counts as done).
- Tab, open list, campaign, filters and page in the URL through nuqs (refresh and back keep them).
- Nova busca frame in `loading.tsx`.
- Zod and the single error shape in `app/api/admin/campanhas/**`; the Apify webhook and the Campanhas cron in shadow mode.

Files: `features/campanhas/**` (after the move), `app/(app)/campanhas/**`, `app/api/admin/campanhas/**`, `app/api/prospeccao/**`, `e2e/campanhas*.spec.ts`.

Acceptance (measured):
- Switching Campanhas and Leads tabs, opening a list and coming back from Nova busca: 0 blocking reads (the screen shows cached data before any request returns), against 2 to 5 today (B2, B3).
- Frame under 300 ms with RSC delayed 3 s (B1).
- Refresh and back keep tab, list, filters and page.
- Remove 5 leads in under 2 s with the API delayed 1 s: no "já saiu da lista", the total is right, and one refused delete brings back only its own row (B4).
- JS for Campanhas and Nova busca within B8.
- Existing Campanhas e2e (including `/design`) pass.

**Exit gate**: if any criterion fails, the next area does not start; fix the Base or revisit the pattern first.

Out: the other admin screens; the `/clientes` central (it keeps `lembrar` until Step 5).

### Step 3: the tenant screens, straight to infinite queries

Scope:
- Each area moves into `features/<area>/` (separate commits): contatos, pipeline, painel, agenda, pedidos.
- Contatos (list and ficha), Pipeline, Painel, Agenda and Pedidos: frame at the click, data per block through `useQuery`, read directly through RLS (D1).
- `usePaginada` lists go straight to `useInfiniteQuery` (no double migration).
- Realtime through the bridge; `contato-bus` and the data `router.refresh` calls replaced by cache updates.
- `contatos/layout.tsx` stops reading the list (its `loading.tsx` becomes possible).
- Painel's heavy aggregates become per-block queries (the same RPCs).
- Zod on the routes of these areas; the Agenda cron (`/api/agenda/lembretes`) in shadow mode; the Asaas webhook schema enforced if its shadow week had zero mismatches.

Files:
- `features/{contatos,pipeline,painel,agenda,pedidos}/**` (after the moves)
- `app/(app)/{contatos,pipeline,painel,agenda,pedidos}/**`, their API routes
- `lib/use-paginada.ts` (removed when its last user goes), `lib/contato-bus.ts`

Acceptance:
- Frame under 300 ms with RSC delayed 3 s for each screen (B1); revisiting within 30 min: 0 blocking reads (B2).
- `e2e/realtime.serial.spec.ts` and `e2e/clientes.serial.spec.ts` pass with RPC call counts not higher than today.
- `/design` suites pass; JS per route within B8.
- Production p75 click to frame within B5 in the observability numbers.

Out: Conversas, NavRail counters.

### Step 4: Conversas, last, with the n8n battery before and after

Scope:
- Move into `features/conversas/` (separate commit).
- `inbox/layout.tsx` (stops awaiting the first page), `ContactSidebar`, the open conversation (`useMensagensDaConversa`, handoffs, notes), NavRail counters (`useContagemAoVivo`).
- `encaixar` stays the INSERT placement rule.
- Zod for the n8n webhooks (`/api/agent`, `/api/inbound-media`, `/api/clients/by-instance/[instanceName]`): shadow mode first, enforced only after a week with zero mismatches and a green battery.
- Re-evaluate server prefetch with `HydrationBoundary` for the first inbox page only, with numbers from production.

Files: `features/conversas/**` (after the move), `app/(app)/inbox/**`, `app/api/{agent,inbound-media,send,conversations}/**`, `app/api/clients/by-instance/**`, `components/shared/NavRail.tsx`, `lib/use-contagem-ao-vivo.ts`.

Acceptance:
- `npm run test:e2e:n8n` passes before and after with no difference; `realtime.serial` and `atendimento.serial` pass.
- Message arrival to screen not slower than today (timed in the battery).
- Opening a conversation shows the frame under 300 ms with RSC delayed 3 s (B1).
- The n8n webhook schemas logged zero mismatches for a week before being enforced.

Out: any change to n8n workflows or to the brain's behavior.

### Step 5: URL state in the rest, and the last routes

Scope:
- Filters, search, tab and page in the URL (nuqs) for Conversas chips and search, Contatos filter, Pedidos tab and search, Pipeline filters, Agenda week, the `/clientes` central (and its `lembrar` cache moves to the query layer, `features/central/`).
- The remaining areas move to `features/` (agente, conhecimento, equipe, assinatura, central).
- Zod sweep: every route not converted by an earlier step gets its schema and the single error shape; `lib/env.ts` enforced after the owner confirms the Vercel variable list.

Acceptance:
- Refresh and back keep the state on every list (one e2e per list); shared links open the same view.
- No route left without a schema (a `checar` check lists routes that parse a body without one).
- Every budget item B1 to B10 within budget, recorded in `docs/handoff.md`.

Out: new filters.

## 5. Guardrails (so this does not come back a third time)

1. **ADR "The screen never waits for the database to appear"** (Step 0 or 1): pages and segment layouts do not await data; every route has a `loading.tsx` frame; server reads in parallel. Also fix the `next.config.ts` comment that credits speed to `loading.tsx` alone.
2. **ADR "TanStack Query is the only browser data layer"** (Step 1):
   - every browser read through an area hook with the key factory;
   - writes are optimistic mutations with inverse undo and last-mutation invalidation;
   - realtime by event type (2.7).
3. **ADR "Every input crosses a Zod schema"** (Step 1), including shadow mode for machine callers and the environment.
4. **ADR "Vertical slice: one folder per area"** (Step 1).
5. **The rule file** `.claude/rules/dados-estado-desempenho.md` (section 8): the budget, the three places for state, and the per-step transition, so the rule text always matches the code. Its lines grow as each step lands.
6. **Lint** (warnings for legacy code; a migrated area's files must come out clean through the existing PostToolUse hook):
   - no `useEffect` that fetches in components;
   - no `supabase-js` import in components (only in sources);
   - no query key written inline;
   - no new file loose in `lib/` or at the root of `components/`;
   - no `process.env` outside `lib/env.ts` (from Step 5, when env is enforced).
7. **Tests**:
   - the frame e2e on a production build (B1 to B3) with the allow-list growing per step;
   - the concurrent-delete e2e per area with writes (B4);
   - Vitest for pure rules, cache helpers and schemas, run by `fechar-entrega`.
8. **The performance budget (section 3) is a rule**: a delivery that breaks one item either fixes it or records the owner's exception in an ADR.

## 6. Documentation map (one source per subject)

| Subject | Single source | Notes |
|---|---|---|
| Data, state and performance in the browser and on navigation | this document | the roadmap until Step 5 ends; then its rules live in `.claude/rules/dados-estado-desempenho.md` and the ADRs of section 5 |
| Owner's loading rules and the database side of lists | `docs/plano-carregamento.md` | still binding; its browser layer is superseded area by area (note at its top) |
| Product roadmap and decisions | `docs/proximos-passos.md` | points here for data, state and performance |
| Where the product stands, traps, status | `docs/handoff.md` | points here; weekly budget readings (B5 to B9) are recorded there |
| Design: tokens, base layer, reasoning | `docs/design-system/` | the only design source; the code wins on any disagreement (its README) |
| Why each rule exists | `docs/adr/` with `docs/adr/README.md` | ADRs that this plan will replace carry a transition note, not "Superseded", until the replacing step lands |
| Finished plans and one-off reports | `docs/arquivo/` | moved there with a line on top saying why and what replaces them; nothing deleted |

## 7. After Step 5: the design track

The design front starts after Step 5 is closed, not before and not in parallel. This section fixes the track so nothing has to be decided again; it does not design anything.

### 7.1 Inside this plan: one pattern for the new screen states

The migration creates states the app does not have today. They get ONE pattern, defined in the Base (Step 1, item 13), so each area does not invent its own:

| State | Today | Pattern (Base) |
|---|---|---|
| Block loading | `loading.tsx` and screens draw ad hoc `animate-pulse` divs with loose classes (`app/(app)/loading.tsx`); there is no skeleton in `components/ui/` | one skeleton component in `components/ui/` with variants for line, block and list row, using the existing surface tokens |
| Block error | none; screens show an inline sentence or nothing | one block error component (reason sentence plus "Tentar de novo"), red only as state (`fundamentos-cor.md`) |
| Empty | `components/ui/estado-vazio.tsx` exists | kept as is |
| Item leaving and coming back (optimistic undo) | none | one exit and return transition from the existing animation tokens (`fundamentos-animacao.md`), plus the reason shown in place |
| Route frame | generic skeleton | each `loading.tsx` composes the real page header components with the skeleton, so the frame and the loaded page do not jump |
| Form field error | each form writes its own | the shadcn `Form` message slot with the schema's sentence (2.12) |

Their copy follows the visible-vocabulary rules already in `engineering.md` (no dash, Portuguese UI). Polishing them is part of the design track, not of this plan.

### 7.2 The track, in order, after Step 5

1. Component audit of the base layer and the product components (names, fixed values, duplication), confirming what lives in `components/ui`, `components/shared` and each `features/<area>/components`.
2. Light theme weight: carry the visual weight of the new login to the other screens (the owner's request of 06/11/2026, recorded in `docs/proximos-passos.md`).
3. Accessibility review (contrast, keyboard, touch target, screen reader), weighing the phone.
4. Copy of the states from 7.1.

Each design change lands per area, in commits separate from any behavior change.

### 7.3 Design documents: findings of 10/11/2026

- `docs/design-system/pendencias.md` was last updated on 31/08/2026. Its item 12 says mobile "não foi resolvido", but the mobile plan ran on 23/09/2026 (`docs/arquivo/relatorio-mobile.md`). A note now says the item is stale and needs re-checking. The Light weight complaint of 06/11/2026 and the new screen states were not recorded there; both are now listed (items 13 and 14).
- `docs/design-system/README.md` still opens with the 30/08/2026 context (17 files in `components/ui/`, now 28). That is history, not a conflict, since its rule is "the code wins".
- `docs/proximos-passos.md` had the Light weight work "anotado para a semana de 09/11/2026". That conflicted with the owner's 10/11 decision to run design after this plan; it now carries a note saying so.
- No other design document conflicts with this plan: none of them defines loading, error or optimistic states.

## 8. Instruction files

The owner approved on 11/11/2026 (relayed by the Campanhas session) that the data, state and performance rules live in their own rule file, that the existing rules get transition notes, that `realtime.md` gets the corrected `REPLICA IDENTITY FULL` reason, and that `CLAUDE.md` gets only a short reference (to keep it small). The owner confirmed in the plan session on 11/11/2026 and the changes below are **applied** (the rule file, the transition notes and the `CLAUDE.md` line); the text here is kept as the record of what was written. `AGENTS.md` holds only the Next 16 warning and does not mirror `CLAUDE.md`: no change.

### 8.1 New file `.claude/rules/dados-estado-desempenho.md` (applied)

```markdown
---
paths:
  - "app/**/page.tsx"
  - "app/**/layout.tsx"
  - "app/**/loading.tsx"
  - "app/api/**/route.ts"
  - "components/**/*.tsx"
  - "features/**"
  - "lib/use-*.ts"
  - "lib/*-fonte.ts"
  - "lib/query/**"
  - "lib/realtime/**"
  - "next.config.ts"
---
# Data, state and performance

The roadmap and the reasons are in `docs/plano-dados-e-estado.md` (the spec). This file holds only the rules, and says which ones apply now and which apply to an area once its step has landed. An area that has not migrated keeps following `data.md`, `realtime.md` and `engineering.md` as written.

## Applies now, to all code
- Performance budget B1 to B10 (spec, section 3) is an acceptance criterion of every delivery. A delivery that breaks one fixes it or records the owner's exception in an ADR. A route over budget in production for 3 days in a row is a bug ahead of new features.  (why: docs/plano-dados-e-estado.md)
- A new screen does not await data before rendering: its page awaits only the gate (session, tenant, access), it has its own `loading.tsx` with the static frame, and its server reads run in parallel, never in series.  (why: docs/plano-dados-e-estado.md)
- State has three places, no mixing: server data in the browser data layer, navigation (tab, open item, filters, search, page) in the URL, interaction in the component. No global store; Context only injects a data source, never data.  (why: docs/plano-dados-e-estado.md)
- A Realtime DELETE event is not filtered by tenant and not checked by RLS, and under RLS its `old` carries only the primary key: use it only as a hint to drop that id and re-read; never read tenant or content from it.  (why: docs/plano-dados-e-estado.md)
- New files go into `features/<area>/` (vertical slice, spec 2.13), not loose in `lib/` or at the root of `components/`. A move into `features/` is a commit of its own, never mixed with a behavior change.  (why: docs/plano-dados-e-estado.md)

## Applies from Step 1 (the Base)
- Browser reads go through an area hook on TanStack Query, with keys from the area's key factory (`[area, entity, kind, params?]`); never a `useEffect` that fetches, never an inline key.  (why: docs/plano-dados-e-estado.md)
- Writes are optimistic mutations: change the cache at the click, undo with the inverse operation, invalidate by prefix only when it is the last pending mutation of its key, totals change with the rows.  (why: docs/plano-dados-e-estado.md)
- Realtime callbacks write to the cache through the area bridge: UPDATE patches the row; INSERT and DELETE invalidate lists and counters with a 500 ms debounce; events of an area with a pending mutation are deferred to that mutation's invalidation.  (why: docs/plano-dados-e-estado.md)
- Every input crosses a Zod schema (route bodies, webhooks, URL parameters, forms, environment); machine callers and the environment start in shadow mode and reject only after a week with zero mismatches.  (why: docs/plano-dados-e-estado.md)
- API routes answer `{ error, codigo? }` with the HTTP status; a 401 is handled once, by the query client.  (why: docs/plano-dados-e-estado.md)
- URL state goes through nuqs parsers; a new or complex form uses react-hook-form with the Zod resolver and the `Form` of `components/ui/`.  (why: docs/plano-dados-e-estado.md)
```

### 8.2 Transition notes in the existing rules (applied)

| File | Line today | Change |
|---|---|---|
| `.claude/rules/engineering.md`, "Never size for a small audience" | "Every list paginates 10 at a time ... (`lib/use-debounce.ts`, `lib/use-paginada.ts`)" | append: "Transition: `use-paginada` becomes an infinite query per area in Step 3 of `docs/plano-dados-e-estado.md`; see `dados-estado-desempenho.md`." |
| `.claude/rules/realtime.md` | "Reuse `lib/use-paginada.ts` and `lib/use-contagem-ao-vivo.ts` ..." | append: "Transition: replaced area by area in Steps 3 and 4 of `docs/plano-dados-e-estado.md`." |
| `.claude/rules/realtime.md` | "`REPLICA IDENTITY FULL` is required where UPDATE/DELETE events matter (RLS must evaluate the old row)." | replace the reason: "`REPLICA IDENTITY FULL` is required where UPDATE old values matter. DELETE events are not RLS-checked and not filterable, and under RLS their `old` carries only the primary key (Supabase docs, Postgres Changes), so a DELETE is only a hint." |
| `.claude/rules/data.md` | "A mutation never calls `router.refresh()` for a small change: announce on `lib/contato-bus.ts` or patch local state." | append: "Transition: becomes an optimistic mutation on the query cache in Step 3 of `docs/plano-dados-e-estado.md`." |

### 8.3 `CLAUDE.md`, one line in "Where to read more" (applied)

Right after the `docs/handoff.md` line:

"- `docs/plano-dados-e-estado.md` = the single roadmap for data, state and performance (its budget is an acceptance criterion); the rules are in `.claude/rules/dados-estado-desempenho.md`."

## 9. Decisions (closed by the owner on 11/11/2026)

| # | Decision | Owner's answer | What it changed in the plan |
|---|---|---|---|
| D1 | Read path | direct browser reads through RLS; API routes only for sensitive writes ("sim") | one path in 2.2 (the alternative removed); admin areas still read through routes because they use `service_role` |
| D2 | Vitest | now ("gostei, vamos seguir assim") | Step 1 adds `vitest` and `npm run test:unit` to `fechar-entrega`; pure rules, cache helpers and schemas get unit tests; B4 is locked by a unit test too |
| D3 | URL state | nuqs | 2.8 and every step use nuqs parsers; the own helper is only the fallback if nuqs fails the Next 16.2 check at install |
| D4 | Zod | every input: route bodies, the n8n and Asaas webhooks, URL parameters, environment variables, not only forms | 2.9 lists every input type with its step; machine callers and the environment start in shadow mode; Step 5 gains the sweep of every remaining route and the enforcement of `lib/env.ts`; a lint against `process.env` outside `lib/env.ts` |
| D5 | react-hook-form | ready in the Base for new or complex forms, no migration of the forms that work ("já vamos deixar isso no gatilho pois talvez nossa vertente possa verticalizar") | 2.12; Step 1 adds `react-hook-form`, `@hookform/resolvers` and `components/ui/form.tsx`; a field-error state joins 7.1 |
| D6 | `features/` | yes, vertical slice ("sim, vertical slice") | 2.13 fixes the structure; each step starts with the move commit of its area; the lint against new loose files starts in Step 1; shared pure rules cited by the rules files stay in `lib/` until their citations move with them |
| D7 | Production measurement | own beacon ("é uma boa") | 2.10 fixes marks, transport, storage and reading; the beacon table is a migration that waits for the owner's release |

Still open, by design: the B8 ceilings are confirmed with the owner once Zod, nuqs and react-hook-form are measured at install; the beacon table's columns and retention are settled in Step 1.
