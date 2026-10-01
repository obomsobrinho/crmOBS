# Handoff without pause: the n8n pause nodes are disabled
- Date: 2026-08-20
- Status: Accepted
- Area: n8n

## Context
Handoff no longer pauses nor mutes the AI (rule in the agent-ai area). Now `action=pausar` returns a message (the AI says what it will check and keeps attending). Consequence in n8n that is easy to forget: with non-empty `messages`, `Loop envio` ends and `Action` is reached, so node `Pausa IA (handoff)` fires again. Removing the pause on the app side is NOT enough.

## Decision
The two nodes `Pausa IA (handoff)` and `Pausa IA (agendado)` are DISABLED since 20/08/2026 (`disableNode`, which in n8n is pass-through, so `Notifica grupo` -> `Pausa IA (agendado)` still notifies the group). The node that STAYS active is `Pausar IA (Franck digitou)`: it represents "a human took over", the only case where the AI must go quiet. Reverting is `enableNode` on the two.

## Consequences
Re-enabling those nodes brings back the "46 of 47 contacts muted forever" failure.
