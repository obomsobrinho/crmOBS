# TanStack Query is the only browser data layer

Status: Accepted (owner, 11/11/2026)
Area: data, realtime

## Context

The app had five ways to read in the browser (`useLeitura`, `usePaginada`, `useCarga`, `lembrar`, per-screen hooks) and four ways to update after a write. Campanhas re-read 2 to 5 times per click, and deleting a lead then another answered "Este lead já saiu da lista." because the old page stayed on screen until the re-read came back.

## Decision

- One `QueryClient` per identity (`lib/query/provedor.tsx`, React `key` = user plus tenant), with the defaults of `lib/query/cliente.ts` (30 s fresh for lists, 30 min kept, no focus or reconnect refetch where realtime already revalidates, one retry only on network or 5xx).
- Keys `[area, entity, kind, params?]` from one key factory per area; mutation keys `[area, entity, action]`.
- Writes are optimistic through `lib/query/escrita.ts`: the row leaves at the click with its total; a refusal shows its reason and the final, debounced invalidation (`lib/query/invalidar.ts`) brings the row back; only the last pending write of `[area, entity]` invalidates.
- Sources throw `ErroDaApi` (`lib/query/erro.ts`) and call routes through `chamarApi` (`lib/query/api.ts`), which renews the session once on a 401 and repeats; a second 401 goes to `/login` with no return to the link (docs/adr/2026-09-30-pedidos-detail-is-a-request-sheet-not-a-chat.md). A refused write whose screen is gone shows `components/AvisoGlobal.tsx`.
- Realtime writes to the cache through one bridge registered in the `(app)` layout, from Step 3a.

## Consequences

- Areas migrate one by one (`.claude/rules/dados-estado-desempenho.md`, "State"); an area not migrated keeps its current pattern.

## Evidence

- `lib/query/escrita.test.ts` (`npm run test:unit`): five removals in flight with the third refused end with four rows gone, the third back, the total minus four and ONE re-read; a removal and a mark on the same list do not erase each other.
