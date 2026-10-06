# The turn calendar is computed in code
- Date: 2026-10-05
- Status: Accepted
- Area: agent, prompt

## Context
On 2026-10-05 a diagnostic battery ran 31 cases, 3 times each, against the real brain (`runAgent` plus the guardrail, fixed clock, the OBM advanced prompt snapshot, no WhatsApp). Conversation context, conversation moment, request interpretation and faithfulness to the base passed every repetition. Every consistent failure was calendar arithmetic:

- Friday 19:00, "amanhã de manhã": scheduled Saturday, a closed day (3 of 3).
- Wednesday 16:00, "hoje às 17h": answered that 17h "já passou" (3 of 3).
- Monday 23:50, "amanhã cedo": lost which day tomorrow is (3 of 3).
- "de tarde" alone: assumed today without asking the day (1 of 3).

To find the culprit the failing cases ran in three more variations. A larger model (`gpt-5.5`) with the same prompt passed all. The same model (`gpt-5.4-mini`) with a 15-line prompt failed the three calendar cases the same way, so the prompt was not the cause. The same model and prompt plus a code-computed calendar of the next 8 days passed the 30 checkable cases, 3 of 3. A second round on four guided presets (dental, law, retail, restaurant) showed the same class of error in three of them, e.g. a restaurant open until 23:00 answering "já encerramos" at 21:00 and "ainda dá sim" at 23:30.

It is the principle already used for operator guidance (`notaDeHorarios`, docs/adr/2026-09-30-dates-and-times-in-base-prompt.md): the model talks, the code does the arithmetic.

## Decision
- Every turn gets a `### CALENDÁRIO` block right after `### AGORA` (`calendarioBlock`, `lib/horarios.ts`): one line per day for today plus 7, with weekday, date and, when the tenant has hours, the resolved state (FECHADO, aberto das X às Y, ainda NÃO abriu, JÁ ENCERROU, ABERTO AGORA, an overnight shift that crosses midnight, and early morning inside yesterday's overnight shift).
- The hours are the REGISTERED ones only (`horarioCadastrado`): `agent_config.hours`, also stored for advanced tenants. No registered hours, or every day closed, means the block lists dates only. It never falls back to `DEFAULT_HOURS`, which would invent opening hours.
- The bench tests the hours IN EDIT in guided mode (`horarioOverride`, honored only in `dryRun`, like `personaOverride`).
- The block goes after AGORA, in the per-turn part of the system prompt, so the cached prefix (persona) is untouched.
- The base line on dates now points to "as seções AGORA e CALENDÁRIO".

## Consequences
- About ten lines more per turn, no model change.
- Holidays are not in the calendar. The agent schedules on a holiday because nobody tells it. Owner decision (2026-10-05): not built now; the Google Calendar integration (P2, `docs/proximos-passos.md`) covers it.
- A code-level lock on `agendar` (refuse a closed day or a passed hour) is NOT built. Owner decision (2026-10-05): the real agenda (Google Calendar, with agent tools) resolves it.
- Proof: offline `e2e/horarios.design.spec.ts` (the block itself) and the paid `e2e/horarios.ia.spec.ts` ("Calendário do turno, guiado": the three failures above, guided mode with fixed hours in the body).
