# A help request's resolution is a stored column, never derived text
- Date: 2026-10-08
- Status: Accepted
- Area: data, pedidos, conversation

## Context
`handoffs.closed_how` had two values, `ia` and `resolvido`, and each screen built its own sentence from them at render time ("Como: A IA respondeu com a orientação do time", "Resolvido por X", "resolvido com a sua orientação", "resolvido pelo time"). `resolvido` mixed two different outcomes: the team closed the request and handed the conversation back to the AI (`POST /api/conversations/resolve`), or the team answered in its own words from the conversation and kept it, with the AI paused (`POST /api/send` with `pedidoId`, the "Eu respondo" door). The owner asked for three labels in the Pedidos redesign of 2026-10-08: "Orientou IA", "Time resolveu", "Time assumiu".

## Decision
- One pure source, `lib/solucoes.ts`: `orientou_ia` ("Orientou IA"), `time_resolveu` ("Time resolveu"), `time_assumiu` ("Time assumiu"). Screens show `rotuloDaSolucao`; anything outside the list is `null` (`solucaoDoBanco`) and the screen shows no badge, never a guess.
- `handoffs.solucao text null` with a `check` on the same keys (migration `20261008233757_solucao_do_pedido.sql`). Recorded at close time, server side, by `fecharPedido` (`lib/handoffs.ts`), whose parameter is now `solucao`. Every door maps to exactly one key:
  - `POST /api/conversations/orientar` -> `orientou_ia`;
  - `POST /api/conversations/resolve` -> `time_resolveu`;
  - `POST /api/send` with `pedidoId` -> `time_assumiu` (the sender took over: `assumirConversa`, AI stays paused).
- History backfill: `ia` -> `orientou_ia`, `resolvido` -> `time_resolveu`. A historical `resolvido` that came from the send door is NOT reclassified: nothing in the database separates the two, and inventing would make the screen lie.
- Transition: the migration can run before the deploy. A `before insert or update of closed_how` trigger (`handoffs_solucao_do_legado`) fills `solucao` from `closed_how` while the deployed app still writes only `closed_how`. New code writes `solucao` and never `closed_how`. `pedidos_pagina` returns `solucao` instead of `closed_how`.
- UI: label "Solução" (never "Como"), a `Badge variant="solucao"` with one icon per key (`components/SolucaoBadge.tsx`) in the list row and in the detail. Brand tone on purpose: green, amber and red are state, and a resolution is not good or bad. The conversation's closed-request line (`HandoffCard`) shows the same label.

## Consequences
- Adding a resolution changes `lib/solucoes.ts`, the `check` (new migration) and the door that records it, together. `e2e/pedidos.design.spec.ts` reads the migration and fails if the keys or the backfill map diverge from the module.
- `closed_how` is legacy and no longer written by the app. Dropping it and the transition trigger is a follow-up after the deploy (owner/architect decision).
- During the gap between migration and deploy, the old app's Pedidos sheet shows its fallback sentence ("Resolvido pelo time"), because `pedidos_pagina` no longer returns `closed_how`; and a close through the send door is recorded as `time_resolveu` by the trigger.
- Evidence: production on 2026-10-08 had 5 closed requests (3 `ia`, 2 `resolvido`); after the migration, 3 `orientou_ia` and 2 `time_resolveu`.
