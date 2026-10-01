# Handoff does not pause and does not mute the AI
- Date: 2026-08-20
- Status: Accepted (supersedes the earlier "silent handoff" of phase 3.5; follow-ups: 2026-09-27-orientar-resolves-request-immediately.md, 2026-09-27-handoff-queue-and-handoffs-table.md)
- Area: agent-ai

## Context
The first handoff design did two things on `action=pausar`: it zeroed `messages` (silent AI) and wrote `atendimento_ia='pause'`. Production showed both defects together: the AI opened the handoff in silence, the person sent another request 26s later and, with the AI paused, that request was recorded but never classified. Pause is a one-way door, so 46 of the 47 OBM contacts were left with the AI off forever.

## Decision
HANDOFF DOES NOT PAUSE AND DOES NOT MUTE THE AI.
- The AI answers one sentence saying WHAT it will check (base text in `agent_config.handoffNotice`, rule in the prompt), sets `conversations.handoff_at` and keeps attending.
- Each new message generates a new handoff with the summary of the LAST request (`conversation_qualifications` already stores one row per turn).
- `handoff_at` holds the FIRST open handoff (it gives the real wait, "esperando há 6h"). It is cleared by `POST /api/conversations/resolve` (service_role, because the column has no UPDATE grant for the browser) and it feeds the "Precisa de você" filter.
- Pause means only what it should: a human took over (n8n node `Pausar IA (Franck digitou)`) or someone turned it off on the switch.
- n8n consequence: with non-empty `messages` the `Loop envio` ends and `Action` is reached, so the `Pausa IA (handoff)` node would fire again. Both `Pausa IA (handoff)` and `Pausa IA (agendado)` are disabled in n8n since 2026-08-20 (`disableNode`, pass-through, so `Notifica grupo` -> `Pausa IA (agendado)` still notifies the group). Reverting is `enableNode` on both. Removing the pause on the app side alone is not enough.

## Consequences
- ⚠️ An older version of the docs said `POST /api/send` cleared `handoff_at`. It does not, and never did.

## Evidence
- 46 of 47 OBM contacts had the AI off forever.
- Second request 26s after the first was stored but never classified.
