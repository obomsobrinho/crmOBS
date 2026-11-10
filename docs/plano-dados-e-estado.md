# Plan: data and state, one pattern for the whole app

Status: **Proposed**, written 10/11/2026. Nothing here is approved and no code changes until the owner approves this spec. The open decisions are at the end; none of them is assumed below (where a step depends on one, it says so).

Inputs: the owner's complaints of 10/11/2026 (every screen change shows loading; refresh inside a lead list goes back to the general list; deleting a lead then another answers "Este lead já saiu da lista."), the slowness diagnosis of the same day (production build measured locally against the production Supabase, plus Supabase logs and `pg_stat_statements`), the architecture proposal `arquitetura-atenda-2026-11-10.html` and its review `revisao-arquitetura-atenda-2026-11-10.html` (owner's vault, `assets/atenda/`). Every item the review marked "to check" was checked in the repository and in the database; the answers are inline.

Relation to `docs/plano-carregamento.md`: that plan is **kept and referenced, not replaced**. Its six owner rules (paginate by 10 with infinite scroll, server search with debounce, realtime touches only the changed row, hidden tab does not fetch, Conversas opens on "today" plus open help requests, messages only when the conversation opens) stay binding, and its database work (keyset list RPCs, trigram search, `(select auth.uid())` in RLS) is the foundation this plan builds on. What this spec supersedes is its browser layer: the generic `lib/use-paginada.ts` and the per-screen fetch hooks are replaced, area by area, by the query layer below.

Out of scope for the whole plan:
- **Design** (Light theme weight on the other screens, component audit, critique). The owner decided on 10/11/2026 that the design front starts only after this whole plan is executed. The component audit is NOT a prerequisite of the Base.
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
| No production performance numbers | no Web Vitals, no `Server-Timing`, no navigation timing | the 14.8 s was found in Supabase logs, by hand |

## 2. The pattern

### 2.1 Three places for state, no mixing

| State | Lives in | Examples |
|---|---|---|
| Server data | TanStack Query cache (browser) | lists, pages, counters, a lead, a campaign |
| Navigation | URL | tab, open list, filters, search, page, open item |
| Interaction | `useState` in the component | dialog open, field being typed, focus, hover |

No global store and no Context for database data. Context is allowed only to inject the data SOURCE (real or fake for `/design`), never data.

### 2.2 Read and write path, by operation type

Two variants until the owner decides (decision D1). Admin areas (Campanhas, `/clientes`) read through API routes in both, because they read with `service_role` and RLS does not cover them; that is not a choice.

Variant A (recommended; it is what the tenant screens already do):

```
READ (tenant screen)     component -> area hook -> useQuery(queryFn = area source) -> supabase-js (browser, user JWT) -> PostgREST -> RLS -> RPC/table
READ (admin area)        component -> area hook -> useQuery -> fetch /api/admin/... -> rotaDoAdmin -> service (service_role) -> Postgres
COMMON WRITE             component -> useMutation (optimistic) -> supabase-js on a GRANTED column only (data.md) -> RLS
SENSITIVE / BUSINESS     component -> useMutation (optimistic) -> fetch /api/... -> sessaoDaRota or rotaDoAdmin (revalidar) -> Zod -> service -> Postgres
BACK CHANNEL             Postgres -> Realtime -> useCanalTenant / useCanalConversa -> cache bridge (2.7) -> setQueryData or invalidate
```

Variant B (every read through an API route): the same, with the tenant READ going `fetch /api/... -> sessaoDaRota -> service`. Cost measured on 10/11 (local production build, warm database): reads through an API route 66 to 360 ms (median about 130 ms) against direct browser reads to Supabase 53 to 101 ms. One more function hop per read, and every read becomes a Vercel invocation.

### 2.3 First paint: the click never waits for data

Where the request waits today (checked):
- `proxy.ts` runs on every request (documents, RSC and prefetches): `auth.getClaims()`, local JWT check, no network except when the token expired (then one call to `/auth/v1/token`, measured 351 to 572 ms, once per hour per user).
- `app/(app)/layout.tsx` awaits `getMyClient()` (getClaims + `clients` and `user_clients` in parallel, one round) and then `agendaAtivaDoTenant()` (a second round, inline in the JSX). `estadoDoConsumoDoTenant` is inside `<Suspense fallback={null}>` and does NOT block. On a client navigation inside the `(app)` group the layout is not re-rendered (Next partial rendering), so these rounds cost only on a hard load and on prefetches.
- Every page awaits the session again (`requireActiveTenant`, `getMyClient` or `adminDaPagina`, memoized per request) and then its data.
- `app/(app)/contatos/layout.tsx` and `app/(app)/inbox/layout.tsx` await their first list page. A `loading.tsx` inside those folders sits BELOW their layout, so it cannot show before the list read; today the generic `(app)/loading.tsx` covers them.

The pattern:
1. **Every route has its own `loading.tsx`** that draws the screen's static frame (title, tabs, filters, buttons, empty blocks) with no data and no session. In production `<Link>` prefetches every dynamic route up to its loading boundary, so this frame paints at the click. The session gate keeps running in the page on the server while the frame is visible; the frame holds nothing sensitive, and a redirect still happens before any data appears.
2. **Pages and segment layouts do not await data.** They await only the gate (session, tenant, access) and render the client screen, which reads through `useQuery`. Segment layouts that read lists (`contatos`, `inbox`) stop reading.
3. **Data blocks use `useQuery` and show their own skeleton while `isPending`.** No Suspense for data (`useSuspenseQuery` in a client component also runs during SSR in the App Router, without the browser session). No server prefetch and no `HydrationBoundary` in the initial scope; re-evaluated only for Conversas, in Step 4, with numbers.
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
// features/campanhas/api/chaves.ts (path depends on decision D6)
export const chavesDeLeads = {
  tudo: ["campanhas", "leads"] as const,
  listas: () => [...chavesDeLeads.tudo, "lista"] as const,
  lista: (p: ParamsDaLista) => [...chavesDeLeads.listas(), p] as const,
  detalhe: (id: string) => [...chavesDeLeads.tudo, "detalhe", id] as const,
};
```

Invalidation is always by prefix (`chavesDeLeads.listas()` refreshes every list and keeps the details).

### 2.6 Writes: optimistic, safe under rapid clicks

Every mutation follows the same script: change the cache at the click, undo with the INVERSE operation if the server refuses (never restore a snapshot of the whole list, which would erase the other pending mutations), and invalidate only when it is the last pending mutation of its key. Totals change together with the rows.

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
      if (!r.ok && r.motivo !== "nao_encontrado") desfazer(qc, ctx);
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
- The `isMutating(...) === 1` check inside `onSettled` is the concurrent-optimistic-update pattern recommended by the TanStack maintainers; Step 1 proves it in a unit test before Campanhas uses it.
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

Finding for `realtime.md`: its line on `REPLICA IDENTITY FULL` says FULL is needed so "RLS must evaluate the old row". Per the docs above, DELETE events are not RLS-checked at all and carry only the PK under RLS. FULL is still what keeps UPDATE `old` values; the reason in the rule must be corrected in Step 1. Today 7 published tables are FULL and `conversation_qualifications` is default (append-only), consistent with the rule.

### 2.8 URL state

Tab, open list or item, filters, search, sort and page live in the URL. Opening a list or an item pushes a history entry; typing a filter or a search replaces it (debounced, the same 300 ms). The server page reads the same parameters to pick the gate's redirects and the frame; the client reads them through the chosen tool (decision D3). Every URL parameter has a schema (decision D4) so a hand-edited URL never crashes a screen: an invalid value falls back to the default.

### 2.9 Validation, errors, session expiry

- **Validation**: route bodies, URL parameters and forms parse through a schema; the TypeScript type comes from the schema (decision D4 for scope).
- **One error shape** for every API route: HTTP status plus `{ error: string, codigo?: string }`, `error` being the sentence the screen shows (Portuguese) and `codigo` the machine reason (`nao_encontrado`, `ativa`, ...). It keeps the shape 148 places already use; the 15 occurrences of `{ ok: false, erro }` and `{ ok: false, error }` converge to it area by area.
- **Session expired**: one global handler on the query client (queries and mutations): a 401 sends to `/login` (keeping the URL to come back); no screen handles 401 by itself.
- **Errors per block**: a query error renders the block's error state with "Tentar de novo" (one shared component), never a blank screen. A render crash is caught by `app/(app)/error.tsx` (none exists today).

### 2.10 Observability in production

Without it nobody can prove the 14.8 s are gone. Two numbers per route, p50 and p90, per day: click to frame and click to first data. Plus the Supabase side: the hourly PostgREST p50/p90/p99 query already used in the diagnosis, kept as a saved query. Tool: decision D7.

### 2.11 Source injection and `/design`

The `queryFn` calls the area SOURCE (`lib/*-fonte.ts` today), taken from a provider. `/design` mounts the same provider with the fake source (`fonte-de-mentira`), so the design e2e suite keeps running without a database. A source never imports the query client; a hook never imports `supabase-js` directly.

## 3. Steps

Each step closes with the `fechar-entrega` skill (types, lint, build, the right suites), the owner's flow (implement, show him, tests, `/simplify` and `/code-review`, `main`), and one ADR or rule update when it introduces a rule. File moves to `features/` (if decision D6 is yes) go in a commit of their own, with no behavior change, before or after the behavior commit, never mixed.

### Step 0: immediate relief and the root cause of the 14.8 s

Independent of the migration; can start as soon as the owner approves it.

Scope:
1. **Parallel server reads**:
   - Pipeline: `getMyClient` and `pipeline_stages` together, then the columns (3 rounds to 2; the columns need the stage keys).
   - Pedidos: without `?abrir=`, the first page runs together with members and counters (3 rounds to 2).
   - Agenda: config, agenda, week and blocks together after the session (3 rounds to 2; the week read is discarded on the rare redirect).
   - Layout: `agendaAtivaDoTenant` alongside the rest instead of after it, or read in the same `clients` row (the rule "`getMyClient` exposes scalars only" allows a scalar extracted from the jsonb; to be checked against `normalizarConfigDaAgenda`). Hard loads only.
2. **`loading.tsx` per route** with the static frame for Pipeline, Pedidos, Agenda, Painel, Campanhas, Nova busca, Equipe, Agente, Perfil. Contatos and Conversas keep the generic one until Step 3 and 4 (their layouts read lists, see 2.3).
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
- On `next build` + `next start`, clicking each route with a frame shows it in under 300 ms with the navigation RSC response delayed by 3 s (Playwright `page.route` on RSC requests without the `next-router-prefetch` header, which delays the session gate too, not only the data).
- A written attribution of the 14.8 s (which hypothesis held, with numbers) and the options with their cost for the owner.

Out: any change to SQL functions, PostgREST or compute settings; any client cache.

### Step 1: the Base

Scope:
1. Dependencies:
   - TanStack Query v5 (measured 10.8 kB gzip with the hooks we use).
   - The schema library (D4).
   - The URL tool (D3).
   - Vitest if D2 says now.
2. `QueryClient` factory with 2.4's defaults and lifetime; the provider in `app/(app)/layout.tsx` and in the `/design` layouts (fake source).
3. The key factory convention (2.5) and the pure cache helpers (`tirarDaPagina`, `devolverNaPagina`, `acharLinha`, patch by id, both list shapes), tested.
4. The realtime bridge (2.7): the callbacks of `useCanalTenant`/`useCanalConversa` call area bridges; event-type rules, debounce, echo suppression. The hooks themselves keep owning channels, status callback, the skipped first `SUBSCRIBED` and the hidden-tab park.
5. URL state helper or setup (2.8).
6. The error shape (2.9): a server helper for routes, a browser parser, the global 401 handler, the shared block error component, `app/(app)/error.tsx`.
7. Schema helper for route bodies inside `sessaoDaRota`/`rotaDoAdmin` (used by Step 2 on).
8. Observability (2.10): one day of baseline numbers BEFORE Step 2 ships.
9. Guardrails (section 4): ADRs, rule lines, lint rules, the frame e2e harness on a production build (allow-list of migrated routes, starting with the Step 0 frames).

Files:
- `package.json`
- `lib/query/` (client, keys convention, cache helpers)
- `lib/realtime/` or `lib/use-canal-ao-vivo.ts` (bridge)
- `lib/url/` (if a helper)
- `lib/rota.ts`, `lib/admin.ts` (schema and error helpers)
- `app/(app)/layout.tsx`, `app/(app)/error.tsx`, `app/design/**/layout.tsx`
- `eslint.config.mjs`, `e2e/` (frame spec, production web server project)
- `.claude/rules/{engineering,data,realtime,ui}.md`, `docs/adr/`

Acceptance:
- No visible behavior change.
- `npm run build`, `npm run lint`, `npm run checar` and the `sem-login` suite pass.
- The cache helpers and the concurrent-delete rule pass unit tests: 5 deletes in flight, the 3rd refused, give 4 rows gone, 1 back, total minus 4, one invalidation.
- The baseline observability numbers exist for one day.

Out: migrating any screen.

### Step 2: Campanhas, the pilot (exit gate for the rest)

Starts only after the `importar-planilha` work is merged into `main` (it edits `components/admin/campanhas`).

Scope:
- `useLeitura`/`usePaginaDaFonte` replaced by the area hooks (queries through the admin API routes).
- No double read: the server stops pre-reading data the client will query; the page keeps only the gate and the frame.
- Optimistic writes for remove lead, delete list, delete campaign and mark lead (`nao_encontrado` on delete counts as done).
- Tab, open list, campaign, filters and page in the URL (refresh and back keep them).
- Nova busca frame in `loading.tsx`.
- Schemas and the single error shape in `app/api/admin/campanhas/**`.
- Area folder per D6, moves in a separate commit.

Files: `components/admin/campanhas/**`, `lib/campanhas-fonte.ts`, `lib/campanhas-servidor.ts` (only where routes change), `app/(app)/campanhas/**`, `app/api/admin/campanhas/**`, `e2e/campanhas*.spec.ts`.

Acceptance (measured):
- Switching Campanhas and Leads tabs, opening a list and coming back from Nova busca: 0 blocking reads (the screen shows cached data before any request returns), against 2 to 5 today.
- Frame under 300 ms with RSC delayed 3 s.
- Refresh and back keep tab, list, filters and page.
- Remove 5 leads in under 2 s with the API delayed 1 s: no "já saiu da lista", the total is right, and one refused delete brings back only its own row.
- Existing Campanhas e2e (including `/design`) pass.

**Exit gate**: if any criterion fails, the next area does not start; fix the Base or revisit the pattern first.

Out: the other admin screens, `/clientes` central (it keeps `lembrar` until Step 5).

### Step 3: the tenant screens, straight to infinite queries

Scope:
- Contatos (list and ficha), Pipeline, Painel, Agenda and Pedidos: frame at the click, data per block through `useQuery`.
- `usePaginada` lists go straight to `useInfiniteQuery` (no double migration).
- Realtime through the bridge; `contato-bus` and the data `router.refresh` calls replaced by cache updates.
- `contatos/layout.tsx` stops reading the list (its `loading.tsx` becomes possible).
- Painel's heavy aggregates become per-block queries (the same RPCs, direct by RLS if D1 is A).

Files:
- `app/(app)/{contatos,pipeline,painel,agenda,pedidos}/**`
- `components/{ListaClientes,FichaContato,PipelineBoard,Pedidos}.tsx`, `components/{pipeline,agenda,painel}/**`
- `lib/{clientes,pipeline,agenda,pedidos}-fonte.ts`, `lib/use-paginada.ts` (removed when its last user goes), `lib/contato-bus.ts`

Acceptance:
- Frame under 300 ms with RSC delayed 3 s for each screen.
- Revisiting a screen within 30 min: 0 blocking reads.
- `e2e/realtime.serial.spec.ts` and `e2e/clientes.serial.spec.ts` pass with RPC call counts not higher than today.
- `/design` suites pass.
- Production p50 click to frame under 300 ms in the observability numbers.

Out: Conversas, NavRail counters.

### Step 4: Conversas, last, with the n8n battery before and after

Scope:
- `inbox/layout.tsx` (stops awaiting the first page), `ContactSidebar`, the open conversation (`useMensagensDaConversa`, handoffs, notes), NavRail counters (`useContagemAoVivo`).
- `encaixar` stays the INSERT placement rule.
- Re-evaluate server prefetch with `HydrationBoundary` for the first inbox page only, with numbers from production.

Files: `app/(app)/inbox/**`, `components/{ContactSidebar,ConversationView,NavRail,AiSummary,ContactNotes}.tsx`, `components/thread/**`, `lib/inbox-fonte.ts`, `lib/use-contagem-ao-vivo.ts`.

Acceptance:
- `npm run test:e2e:n8n` passes before and after with no difference.
- `realtime.serial` and `atendimento.serial` pass.
- Message arrival to screen not slower than today (timed in the battery).
- Opening a conversation shows the frame under 300 ms with RSC delayed 3 s.

Out: any change to n8n workflows or to the brain.

### Step 5: URL state in the rest

Scope: filters, search, tab and page in the URL for Conversas chips and search, Contatos filter, Pedidos tab and search, Pipeline filters, Agenda week, the `/clientes` central (and its `lembrar` cache moves to the query layer).

Acceptance: refresh and back keep the state on every list (one e2e per list); shared links open the same view.

Out: new filters.

## 4. Guardrails (so this does not come back a third time)

1. **ADR "The screen never waits for the database to appear"** plus an `engineering.md` line: pages and segment layouts do not await data; every route has a `loading.tsx` frame; server reads in parallel. Also fix the `next.config.ts` comment that credits speed to `loading.tsx` alone.
2. **ADR "TanStack Query is the only browser data layer"** plus `data.md` and `realtime.md` lines:
   - every browser read through an area hook with the key factory;
   - writes are optimistic mutations with inverse undo and last-mutation invalidation;
   - realtime by event type (2.7);
   - the `REPLICA IDENTITY FULL` reason corrected;
   - the line "Reuse `lib/use-paginada.ts`" retired when Step 3 lands.
3. **State rule** in `ui.md`: server data in the query cache, navigation in the URL, interaction in the component.
4. **Lint** (warnings for legacy code, errors for migrated areas through the existing PostToolUse hook):
   - no `useEffect` that fetches in `components/**`;
   - no `supabase-js` import in components (only in sources);
   - no query key written inline;
   - no new file loose in `lib/` or `components/` root once D6 is decided.
5. **Tests**:
   - the frame e2e on a production build (RSC delayed 3 s, frame under 300 ms) with the allow-list growing per step;
   - the concurrent-delete e2e per area with writes;
   - unit tests for cache helpers and schemas (if D2).
6. **Every new or touched route validates its input with a schema** and answers the single error shape.

## 5. Decisions for the owner

None is assumed in this spec. Each has options and a recommendation.

**D1. Read path.**
- A: tenant screens read directly from the browser through RLS; API routes only for sensitive and business writes (admin areas always through routes).
- B: every read through an API route.
- C: decide per area.

Recommendation: **A**. It is what the tenant screens already do, one hop less (measured: 53 to 101 ms direct against 66 to 360 ms through a route, warm), and no Vercel invocation per read. B only buys a single place to log and validate reads, which RLS and the list RPCs already give.

**D2. Vitest now or later.**
- Now: in Step 1, for pure rules, schemas and the cache helpers.
- Later: after the migration.
- Not at all: keep pure functions tested through Playwright.

Recommendation: **now**. The concurrent-delete logic and the cache helpers are exactly the code that is cheap to unit test and expensive to debug through the browser, and fast feedback helps the coding agents.

**D3. URL state: nuqs or an own helper.**
- nuqs: a library for typed URL state, made for the App Router.
- Own helper: about a hook plus parsers on top of `useSearchParams` and `window.history.replaceState`/`pushState`, which Next 16 syncs with the router without a server round trip.

Recommendation: **nuqs**, the proposal and the review agree. Typed parsers, batching and throttled updates are code we would otherwise write; confirm its Next 16 support at install time.

**D4. Zod in the routes.**
- All 62 routes at once.
- New routes plus every route touched by a step, area by area.
- Only URL parameters and forms.

Recommendation: **new and touched routes, area by area** (Step 2 converts the Campanhas routes). Same safety where it matters, no big-bang diff on routes nobody is changing.

**D5. react-hook-form.**
- None for now.
- Only in new forms, with the Zod resolver (the shadcn `Form` assumes it).
- Migrate the existing forms.

Recommendation: **only in new forms**. No step of this plan needs a form library, and the existing forms work. When a new form with real validation appears, it starts on react-hook-form plus the schema, so validation and type stay one.

**D6. `features/` folder.**
- Yes: `features/<area>/{components,hooks,api,server,schemas.ts,regras.ts}`, moved area by area in the step that migrates it, moves in separate commits, lint blocking new loose files.
- Only `hooks/` and `services/` at the root.
- Keep the current layout.

Recommendation: **yes, per area**. Campanhas today spans `components/admin/campanhas`, four `lib/` files and `app/api/admin/campanhas`. One folder per area is what lets an agent or a person find everything at once. Separate move commits keep the reviews readable.

**D7. Production observability tool** (added by this spec; the review asks for observability without naming a tool).
- Own beacon: Next `useReportWebVitals` plus our click to frame and click to data marks, posted to a small route and table (no personal data).
- Vercel Speed Insights: Web Vitals per route, no code of ours; cost to check in the Vercel plan.
- Both.

Recommendation: **own beacon**. The two numbers that matter here (click to frame, click to data) are not Web Vitals, and a table can be queried next to the Supabase logs.
