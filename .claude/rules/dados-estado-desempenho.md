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
  - "lib/*-servidor.ts"
  - "lib/query/**"
  - "lib/realtime/**"
  - "lib/rota.ts"
  - "lib/admin.ts"
  - "lib/env.ts"
  - "proxy.ts"
  - "next.config.ts"
---
# Data, state and performance

The roadmap and the reasons are in `docs/plano-dados-e-estado.md` (the spec). This file holds only the rules, and says which ones apply now and which apply from a given step.

## State (updated in the commit that closes each step)
- Steps done: Step 0 (13/11/2026; the Supabase dashboard check (a) is left with the owner), Step 1, the Base (14/11/2026), Step 2, Campanhas (14/11/2026; the Apify webhook and the cron have no body to put in shadow mode, spec Step 2), and Step 3a, Pedidos, the tenant pilot (14/11/2026).
- Areas migrated: Campanhas (`features/campanhas/`), Pedidos (`features/pedidos/`).

**Which pattern new code follows**: in an area not migrated yet, new code follows that area's current pattern (`data.md`, `realtime.md`, `engineering.md` as written, e.g. a new list in Contatos uses `usePaginada` until Contatos migrates). A new screen or a wholly new area is born in the new pattern, from the step whose tooling it needs. A migrated area is one listed above; its files live in `features/<area>/`.

## Applies now, to all code
- A new screen does not await data before rendering: its page awaits only the gate (session, tenant, access), it has its own `loading.tsx` with the static frame, and its server reads run in parallel, never in series.  (why: docs/plano-dados-e-estado.md)
- State has three places, no mixing: server data in the browser data layer, navigation (tab, open item, filters, search, page) in the URL, interaction in the component. No global store; Context only injects a data source, never data; the one exception is the session (tenant, role, access) handed down by the `(app)` layout.  (why: docs/plano-dados-e-estado.md)
- A Realtime DELETE carries only the primary key in `old` (tested 13/11/2026, spec Step 0): it only drops an id already on screen. Never decide which tenant or which conversation a row belongs to from a DELETE, never filter it by another column.  (why: docs/plano-dados-e-estado.md)
- A new file of an area goes next to that area's current files until the area's move commit; after it, in `features/<area>/`. A move into `features/` is a commit of its own, never mixed with a behavior change, and happens when the area is touched, never in bulk.  (why: docs/plano-dados-e-estado.md)
- The full logged e2e suites (`npm run test:e2e:login`) run outside attendance hours: they read and write the production database, and on 13/11/2026 they took it to p90 9.8 s with 5xx errors.  (why: docs/plano-dados-e-estado.md)
- A migration in production is applied outside attendance hours: each one reloads the PostgREST schema cache, and one reload came a minute before the worst spike of 10/11/2026.  (why: docs/plano-dados-e-estado.md)

## Applies from Step 1 (the Base)
- Lab budget (B1 to B4, B8, B10, spec section 3) is an acceptance criterion of every delivery from the day its tool exists. A delivery that breaks one fixes it or records the owner's exception in an ADR. The production reading is the Supabase edge query (B9), weekly; there is no own beacon (decision of 14/11/2026).  (why: docs/plano-dados-e-estado.md)
- URL state goes through nuqs parsers, shallow mode, no Zod behind them. It lands with each screen, in the step that migrates it.  (why: docs/plano-dados-e-estado.md)
- Browser reads in a migrated area go through an area hook on TanStack Query, with keys from the area's key factory (`[area, entity, kind, params?]`); never a `useEffect` that fetches, never an inline key. Lists keep the previous result while filters change. A migrated page reads no database on the server (the session comes from the layout, the lock is RLS plus the write routes) and its menu link prefetches on intent (hover or touch), never every visible link. A write route that changes data passes `ativa: true` to `sessaoDaRota`, except the ones that must work for a blocked company (`billing/subscribe`, `team/remove`).  (why: docs/plano-dados-e-estado.md)
- Writes are optimistic mutations with keys `[area, entity, action]`: change the cache at the click; on a refusal show the reason and let the final invalidation bring the row back; invalidate (debounced) only when it is the last pending write of its `[area, entity]`; totals change with the rows. The inverse operation is an exception for a measured wait only.  (why: docs/plano-dados-e-estado.md)
- API routes answer `{ error, codigo? }` with the HTTP status. The browser source always throws a typed `ErroDaApi`, never returns an error as a value; an end state equal to success (delete of a row already gone) is success inside the source. A 401 is handled once, by the query client: `chamarApi` renews the session once and repeats, then `/login` (no return to the link, docs/adr/2026-09-30-pedidos-detail-is-a-request-sheet-not-a-chat.md).  (why: docs/plano-dados-e-estado.md)
- Every route body and query string, the Asaas and Apify webhooks and the crons cross a Zod schema; machine callers start in shadow mode and reject only after a week with zero mismatches. The n8n webhooks validate and log, never refuse (except a missing field the handler cannot work without, with a notice). `lib/env.ts` arrives in Step 5. A new or complex form uses react-hook-form with the Zod resolver and the `Form` of `components/ui/`.  (why: docs/plano-dados-e-estado.md)
- Lint for these rules is an error in `features/**` and a warning elsewhere.  (why: docs/plano-dados-e-estado.md)

## Applies from Step 3a (the realtime bridge)
- Realtime callbacks of a migrated area write to the cache through the bridge registered once in the `(app)` layout, never from a screen. UPDATE patches the row by id comparing `new` with the cached row (never depends on `old`). INSERT follows the per-list table of spec 2.7: tenant lists keep today's behavior (fetch one row and place it, e.g. `encaixar`, or patch); only counters and lists without a placement rule invalidate, debounced 500 ms. A DELETE of an id not in the cache is ignored. No echo suppression: applying by id is idempotent.  (why: docs/plano-dados-e-estado.md)
- The bridge is `lib/realtime/PonteDoRealtime.tsx`, one hook per area (`usePonteDePedidos`). What a bridge imports enters the JS of every route: keep its heavy part (source, placement rules) behind `import()`, loaded on the first event. A list nobody observes is only marked stale (`refetchType: "none"`), and a reconnect cuts each list to its first page before invalidating. The one exception is an open item's own channel (`useCanalConversa`, e.g. the messages of an open request), which stays in the component that opens it and writes to that item's key.  (why: docs/adr/2026-11-14-realtime-bridge-and-full-prefetch-for-migrated-areas.md)
- A migrated route goes into `PRE_CARGA_INTEIRA` (`components/LinkNaIntencao.tsx`: the intent prefetch is the whole route, so coming back makes 0 requests, B2) and into `AREAS_MIGRADAS`/`TELA_PRONTA` of `e2e/desempenho.orcamento.spec.ts`. Never a route whose page still reads the database: its full prefetch would run those reads.  (why: docs/adr/2026-11-14-realtime-bridge-and-full-prefetch-for-migrated-areas.md)
