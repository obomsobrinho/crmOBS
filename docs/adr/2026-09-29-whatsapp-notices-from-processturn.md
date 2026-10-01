# Help-request notice on WhatsApp is sent from processTurn
- Date: 2026-09-29
- Status: Accepted (beta P0; plans in `docs/plano-avisos.md`)
- Area: agent-ai

## Context
People who do not live on the screen must learn about a help request.

## Decision
- The notice leaves `processTurn`, only for a NEW request with `action = pausar` (`entraNaFila`).
- The scheduled meeting (`agendar`) stays notified by n8n "Notifica grupo", to the SAME destination: notifying through both would double the notice.
- Sent with `after()` from `next/server` (does not delay the answer n8n waits for), best-effort, `diagnostics.avisoAgendado`.
- Text is `textoDoAviso` (`lib/avisos.ts`); the "Abrir" link is `https://{VERCEL_PROJECT_PRODUCTION_URL}/pedidos?abrir={id}` (off Vercel, the line is dropped from the text).
- ⚠️ A phone with DDD 00 never generates a notice (`telefoneImpossivel`): it is the suite test conversation and the test tenant HAS a notice destination. Without the guard, each login run would send a real WhatsApp to the group, and `atendimento.serial.spec.ts` checks every turn.

## Consequences
- Destination semantics of `clients.notify_group_jid` live in the glossary (group or number, never the agent own number).
