# Already-resolved help requests enter the prompt as their own section
- Date: 2026-09-27
- Status: Accepted
- Area: agent-ai

## Context
Without knowing a request was already resolved, the AI reopened the same subject on every "ok, fico no aguardo".

## Decision
`pedidosResolvidos` (`lib/agent-turn.ts`) feeds the section `### PEDIDOS DE AJUDA JÁ RESOLVIDOS` in `lib/agent.ts`: the 2 most recent in the window, with day and hour.
- ⚠️ Never as a `system` note in the middle of the history, and never with the word "orientação" in the line. Both made the AI ignore the turn ORIENTAÇÃO DO OPERADOR.

## Evidence
- Reopening the subject: 3 of 3 without the section, 0 of 3 with it.
- Orientation-driven discount: fell to 0 of 3 with the bad variants; final version 6 of 6 versus 4 of 6 without the section.
