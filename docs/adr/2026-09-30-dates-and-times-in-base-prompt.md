# Date and time rules live in the base, not only in guided mode
- Date: 2026-09-30
- Status: Accepted
- Area: agent-ai

## Context
Owner test at 22h. The rule of using `### AGORA` existed only in guided mode. OBS (advanced) asked "hoje às 18h?" at 22h, offered "16h" without the day, swapped the agreed 18h for "amanhã de manhã" and repeated the audio transcription verbatim.

## Decision
- Three lines entered `CONDUÇÃO` (valid in both modes).
- `ORIENTAÇÃO DO OPERADOR` (`operatorBlock`, `lib/agent.ts`) now receives the time and states the day, because it comes later and tells the model to follow the guidance.
- `LIMITS.persona` raised to 16,000 (warning at 13,600): OBS was 332 chars from the limit, and passing it makes the tenant serve the saved text silently.
- OBS stays in advanced mode (guided keeps only 2,000 chars of details and would lose her flow and examples).

## Consequences
- Backup of the OBS advanced prompt: `Desktop/prompt-avancado-OBS-2026-09-30.md`.
- Related: the "already passed or not" computation became code in `lib/horarios.ts` because the model erred both ways when comparing alone; `e2e/horarios.ia.spec.ts` proves dates and times in both modes with a FIXED clock (`agoraTeste`, dryRun only), including the control case (16h at 10h is today).

## Evidence
Without the operator-block change: 0 of 3; with it: 6 of 6, and 6 of 6 in the other two cases.
