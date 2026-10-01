# CONDUÇÃO DA CONVERSA added to the base tail; persona limit raised to 14,000
- Date: 2026-09-29
- Status: Accepted (limit raised again, see 2026-09-30-dates-and-times-in-base-prompt.md)
- Area: agent-ai

## Context
Owner test: the AI offered a conversation with the team for the third time in response to "obrigado".

## Decision
Add `CONDUÇÃO DA CONVERSA` to `buildBaseTail`: an ambiguous sentence does not become a help request, an offer is not repeated, and a thanks closes with the real next step and `action none`. Raise `LIMITS.persona` from 12,000 to 14,000 (warning at 11,900).

## Consequences
- The limit counts the WHOLE prompt. The larger base put the OBM persona above the old limit (the playground bench and Save refused it), hence the raise.

## Evidence
Measured afterwards: 3 of 3 correct.
