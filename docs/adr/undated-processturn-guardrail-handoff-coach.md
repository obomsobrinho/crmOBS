# Extract the agent turn into processTurn, with dryRun, diagnostics, guardrail and handoff coach
- Date: undated (phase 3.5, "AI closing")
- Status: Partially reverted (see 2026-08-20-handoff-does-not-pause-or-mute-ai.md; the "silent handoff" part only)
- Area: agent-ai

## Context
Turn orchestration lived inside `/api/agent`. The test bench needed to run the same brain without touching WhatsApp or the database, and the agent needed a check on its own answer before sending.

## Decision
- Turn orchestration moved from `/api/agent` to `processTurn` (`lib/agent-turn.ts`, server-only), reused by the test bench.
- `dryRun` mode persists nothing. A turn diagnostics block (`lib/agent-diagnostics.ts`, pure) reports: RAG used plus similarity, stage that would move, latency, guardrail.
- Guardrail (`lib/guardrail.ts`, pure) checks the finished answer before it leaves. It blocks price, link and phone number that are not in the sources (persona + RAG + operator instruction) and strong promises. If it fails, the turn degrades to `pausar`.
- Handoff coach: `conversations.pending_instruction` (written directly by the browser) holds the operator instruction. `/api/agent` consumes it on the next turn and clears it, and the AI resumes by itself.
- The test bench (side panel inside `/agente`, owner-only) talks to the real brain through `POST /api/playground` (owner session, forces `dryRun`), with no WhatsApp.

## Consequences
- One code path serves production and the bench, so the bench is evidence about production.
- `pending_instruction` enters the system prompt as trusted team guidance while any tenant member can write it (open owner decision, see the data/RLS notes).
