# /pedidos is paginated and reads from one source
- Date: 2026-10-02
- Status: Accepted (applies 2026-10-01-production-loading-and-realtime-rules.md to /pedidos)
- Area: data, realtime

## Context
Audit F3 (R-07, RT-03, STRUCT-03). `app/(app)/pedidos/page.tsx` and `components/Pedidos.tsx` each wrote the same handoffs query plus the contact-names query. The "Resolvidos" tab (30 days) was not paginated, the "Abertos" number was `abertos.length`, and every realtime event on `handoffs` refetched three queries (open, resolved, names) for the whole list.

## Decision
- ONE fetch module, `lib/pedidos-fonte.ts`, with two implementations of the same contract: the database (`public.pedidos_pagina` / `public.pedidos_contagens`, `security invoker`) and memory (only for the `/design` preview). The server page reads the first 10 of the opening tab, the tab counts and the `?abrir=` request through it; the browser reads the next pages, search and single rows through the same functions.
- Both tabs paginate 10 at a time (`usePaginada`, infinite scroll) and search goes to the server after a 300ms debounce (name, or what was asked, or phone digits, accent and case insensitive). The tab is part of the params: switching tabs reads the first page of the other one.
- Order stays: Abertos oldest first (`opened_at, id`), Resolvidos newest first within 30 days (`closed_at desc, id desc`). It lives in the SQL `order by` and in `ordemAbertos` / `ordemResolvidos` (`lib/pedidos.ts`); change both.
- "2 of 3 in this conversation" is computed in SQL over the whole open queue (window functions), not over the rows that arrived.
- Counts are an aggregate (`pedidos_contagens`), never `rows.length`.
- Realtime goes through `useCanalTenant`. An event on `handoffs` is debounced (400ms) and fetches ONE conversation's open queue (`abertosDoFone`) or the one request that closed (`porId`); `encaixarAbertosDaConversa` / `encaixarResolvido` place it. A row that sorts after the last loaded one while more pages exist is not inserted (it arrives by scroll). The reassubscription and focus return call `revalidar`, the only place that rereads the loaded rows.
- The notices number is excluded in SQL (`p_fora` from `foraDaLista`, same as `inbox_pagina`) and again by `ehNumeroDeAvisos` on events.

## Consequences
Migration `20261001224315_mt_pedidos_pagina.sql` (two functions and two partial indexes on `handoffs`) must be applied before this code is deployed. The search rule is written twice (`casaBuscaPedido` and the SQL `where`); keep them equal.

## Evidence
- Before: 3 queries per realtime event, all open and 30 days of resolved loaded on every visit.
- After: pure pieces covered in `e2e/pedidos.design.spec.ts`; 25 requests page by 10 in `/design/pedidos?muitos=1`.
