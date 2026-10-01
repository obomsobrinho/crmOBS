# Scheduling does not open a help request
- Date: 2026-09-30
- Status: Accepted
- Area: agent-ai

## Context
Owner finding. A booked meeting was entering the requests queue.

## Decision
Only `pausar` (and the guardrail, which degrades to `pausar`) enters the queue of requests. `agendar` does not. A booked conversation is announced by the n8n "Notifica grupo" node, and if the time does not suit, the owner gets in touch.

## Consequences
- Never open a `handoffs` row for `action = agendar`.
- The notice for scheduled meetings stays in n8n (same destination), to avoid a double notice.
