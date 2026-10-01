# Orienting a help request resolves it immediately
- Date: 2026-09-27
- Status: Accepted (supersedes the 2026-09-26 rule: request closed only when processTurn consumed the instruction on the next turn)
- Area: agent-ai

## Context
Owner: "se eu já orientei, está resolvido". The 2026-09-26 rule closed the request only when `processTurn` consumed the instruction in the following turn, so it stayed open after the owner had already acted.

## Decision
- `processTurn` no longer closes any request.
- `POST /api/conversations/orientar` closes the request (`ia`), turns the AI back on, drops the assignee and runs a RESUMPTION turn (`processTurn` with `retomada`: no new client message, the history ends with `DEIXA_RETOMADA` from `lib/agent.ts`).
- The reply goes through the n8n flow "CRM Envio IA" (`N8N_IA_SEND_WEBHOOK_URL`, `n8n/crm-envio-ia.json`), which records the row as an AI reply. Manual send does NOT work for this (it records `manual` and pauses the AI).
- Any failure falls back to the pending instruction, as before. The composer pill (orienting with no request) still waits for the client.
- ⚠️ An instruction consumed by `processTurn` closes no request: closing "all the open ones" there would resolve for free what nobody answered.

## Consequences
- Resolved requests entering the prompt followed: see 2026-09-27-resolved-requests-enter-the-prompt.md.
