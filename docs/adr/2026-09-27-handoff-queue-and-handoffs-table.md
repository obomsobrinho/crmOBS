# Help requests become a queue: `handoffs` table, composer-integrated request, AI decides "new request"
- Date: 2026-09-27
- Status: Accepted (amended 2026-09-28 with the `mesmoAssunto` safety net; follows 2026-08-20-handoff-does-not-pause-or-mute-ai.md)
- Area: agent-ai

## Context
A conversation can have several open requests. A unique index (`mt_handoffs_fila` removed it) forbade that. The request lived in a separate card instead of where the person writes.

## Decision
- A conversation may have MANY open requests, resolved oldest to newest.
- Table `handoffs`: one row per help request (`opened_at`, `summary`, `instruction`, `closed_at`, `closed_how` = `ia`/`resolvido`, `closed_by`). Member read, service_role write only, in realtime with replica FULL. `conversations.handoff_at` stays the "Precisa de você" signal (opening of the oldest open request); the table is the queue and the history. `processTurn` opens; three doors close, all through `fecharPedido` (`lib/handoffs.ts`), which closes ONE request and recomputes `handoff_at` for the next in the queue.
- With an open request the composer (`MessageComposer`, prop `pedido`) shows it on top ("1 de 2 · há 6h") and OPENS on "Orientar a IA" (amber). The selector toggles only between orient and Responder (internal note disappears), "Resolvido" sits beside it. One view in both modes (owner decision): no "Eu respondo", no "Voltar ao pedido". Replying from here sends `pedidoId` to `POST /api/send`, which closes the request as `resolvido` (the AI stays paused: whoever answered took over).
- The conversation has no amber, only the gray closed-request line (`HandoffCard`, now draws only the closed one, anchored on `closed_at`). The "O cliente quer" strip has no request button. The "Orientar a IA" pill (no open request) stays for orienting something nobody asked (the discount). Preview: `/design?handoff=aberto|resolvido`.
- WHO decides whether a request is new is the AI: field `pedido_novo` in the output format (`lib/agent.ts`) plus section `### PEDIDOS DE AJUDA EM ABERTO`. Insisting on the same subject creates no duplicate.
- ⚠️ SAFETY NET IN CODE (`mesmoAssunto`, 2026-09-28, found in live test): the AI said "mesmo pedido" for the site quote while the invoice request was open, and the request vanished unseen. If the summary shares NO subject word with the open requests (ignoring words every request has: "cliente", "falar", "pessoa"), it enters the queue anyway. Erring toward the duplicate is deliberate: a duplicate closes in one click, a swallowed request nobody sees.

## Evidence
- "e aí, conseguiu ver?" gave `pedido_novo=false` twice, a new subject gave `true`.
- After the safety net: 12 of 12 (new subject enters, insistence does not duplicate).
