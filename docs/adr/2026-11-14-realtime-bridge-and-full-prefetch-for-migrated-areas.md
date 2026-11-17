# Realtime bridge in the layout, and a full prefetch on intent for migrated areas

Date: 2026-11-14. Status: Accepted. Area: data, realtime, performance. Step 3a of `docs/plano-dados-e-estado.md` (Pedidos, the tenant pilot).

## Context

Step 3a is the first tenant area on the query cache: reads straight from the browser through RLS (D1), an infinite list, realtime into the cache, URL state, no database read on the page (D8). Three things were open when it started:

1. Where the realtime callbacks live. Spec 2.7 asks for a bridge registered once in the `(app)` layout, so a cached list does not stay "fresh" with 30 s old data while the person is on another screen.
2. The B2 budget (0 blocking requests when coming back to a screen seen in the last 5 minutes, the navigation request included). With the Step 1 intent prefetch (`router.prefetch(href)`), the first B2 run on Pedidos still made one `?_rsc=` request at the click: a dynamic route is prefetched only up to its `loading.tsx`.
3. The weight of the bridge. Registered in the layout, everything it imports enters the JS of every route. The first build with it put 4 to 14 kB on every route (Painel 299 to 313 kB, Campanhas 474 to 479 kB against its 480 ceiling).

## Decision

- **The bridge** is `lib/realtime/PonteDoRealtime.tsx`, mounted once in `app/(app)/layout.tsx` inside the session and data providers. Each migrated area registers its hook there (`usePonteDePedidos`, `features/pedidos/api/ponte.ts`). `lib/use-canal-ao-vivo.ts` keeps owning the channels; the bridge is one more subscriber of the tenant channel.
  - A `handoffs` event of a conversation (400 ms burst window, as the screen had) re-reads ONE conversation queue (`pedidos_pagina` with `p_telefone`) or the closed requests by id, and places them in every cached list with the screen's own rules (`encaixarAbertosDaConversa`, `encaixarResolvido`), through `aplicarNaLista` (`features/pedidos/api/cache.ts`, which joins the loaded pages into one, keeping the cursor and `temMais`).
  - A list with no observer is only marked stale (`refetchType: "none"`): zero reads while the person is elsewhere, so RPC counts stay at today's level.
  - Counters are a debounced invalidation; the open detail of that conversation re-reads only itself.
  - Reconnect and focus return cut each list back to its first page before invalidating (`soPrimeiraPagina`), so it re-reads one page, like `usePaginada` did.
- **The heavy part loads on the first event**: `ponte.ts` imports only the channel hook, the keys and the cache helpers; the source and the placement rules live in `sincronizar.ts`, loaded with `import()` when a `handoffs` event arrives (the Pedidos screen already ships it). Measured after: Painel 300 kB, Campanhas 476 kB, Pedidos 337 kB.
- **Exception, the item's own channel**: the messages channel of an open request (`useCanalConversa` in `SecoesDoPedido`, `chat_messages` filtered by phone on the server) stays in the component that opens it and writes to that item's key. It is per item, not per tenant, and it is the same rule Step 4 already has for the open conversation.
- **Full prefetch on intent for migrated routes**: `components/LinkNaIntencao.tsx` calls `router.prefetch(href, { kind: "full" })` for the routes in `PRE_CARGA_INTEIRA` (today `/pedidos`), the same strategy as `<Link prefetch={true}>`; `onInvalidate` lets the next gesture prefetch again when Next drops it (the static stale time, 5 minutes). A migrated page reads no database (D8), so the full prefetch costs no database read; the other routes keep the prefetch up to their frame, because a full prefetch of them would run their reads. Campanhas stays out (D16). The `kind` option exists in `router.prefetch` in Next 16.2 (`app-router-instance.js`) but is not in the documented signature; if an upgrade drops it, B2 fails and says so.
- With the full prefetch the click shows the screen itself, not the frame, so B1 accepts the screen's own block for migrated routes (`TELA_PRONTA` in `e2e/desempenho.orcamento.spec.ts`).

## Consequences

- Measured on 14/11/2026, production build: B1 Pedidos 111 ms with the navigation delayed 3 s; B2 "A, B, back to Pedidos" 0 requests; B8 Pedidos 337 kB (ceiling 340).
- A help request opened while the screen is open shows with exactly one `pedidos_pagina` call, the conversation queue (`e2e/pedidos.serial.spec.ts`).
- Found, not fixed: going back in the browser to a history entry created BEFORE a reload keeps the screen as it was (Next does not re-sync that `popstate`, and neither does nuqs). Back from an entry pushed after the reload works. Campanhas has the same behavior. Recorded in `docs/handoff.md`.
- Each new migrated area adds its hook to `PonteDoRealtime` (keeping its heavy part behind `import()`) and its route to `PRE_CARGA_INTEIRA` and to `AREAS_MIGRADAS`/`TELA_PRONTA` in the budget spec.

## Addendum, 15/11/2026 (Contatos, Step 3b)

- Contatos has no realtime; its bridge (`features/contatos/api/ponte.ts`) listens to `contato-bus` and marks lists, counts and fichas stale, so a contact edited in the Conversas ficha is never shown from an old cache in Contatos.
- A layout that did server work only to call `after()` (the profile photo check) loses it when it stops reading: the work becomes a small route the screen asks for after opening (`POST /api/contacts/fotos`), throttled per tab, so coming back stays at 0 requests.
- The B2 harness ignores `/_next/static/` files: a lazy chunk of the middle screen still loading does not block the destination.
- Search in the URL: the URL is written at each key and only the read is debounced; a URL write after the delay cancelled a navigation already started (rule line in `dados-estado-desempenho.md`).
