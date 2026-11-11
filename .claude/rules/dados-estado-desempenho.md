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
