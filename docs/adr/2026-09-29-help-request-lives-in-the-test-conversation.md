# The help request lives in the test conversation, with the same composer as Conversas
- Date: 2026-09-29
- Status: Accepted
- Area: agent-ai

## Context
Owner: "gap de primeira impressão". Owner: "mostrar de um jeito na montagem e de outro quando funcionar não é bom".

## Decision
- With an open request the client box gives way to the Conversas box, and it is the SAME `MessageComposer` with the `pedido` prop: opens on Orientar a IA, toggles to Responder, has Resolvido.
- Replying as the team adds the marker "O time assumiu a conversa", the green bubble, closes the request as `resolvido` and PAUSES the test AI, as in real attendance. A green strip above the client box says so and has "Devolver para a IA" (the gesture of the AI switch in the Conversas header), otherwise replying would end the test.
- Orienting closes the request (gray line, same `HandoffCard`) and the AI answers AT ONCE: `processTurn` accepts `retomada` also in `dryRun`, and the bench sends `pedidosAbertos` because the test queue lives in the browser.
- Whether to enter the queue is the SAME decision as in attendance (`diagnostics.pedidoNaFila`, with the safety net), computed on the server.
- ⚠️ The resumption NEVER opens a request: on a serious subject it still returns `pausar`, and with the queue just emptied the same subject came back as a new request.
- The diagnostics handoff panel became read-only (the old "Orientar e responder" re-ran the last question and was removed).

## Consequences
- Refines 2026-09-27-orientar-resolves-request-immediately.md (resumption turn) for the bench.
