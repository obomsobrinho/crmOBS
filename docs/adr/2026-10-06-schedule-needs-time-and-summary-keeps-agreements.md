# A meeting needs a day AND a time; the summary keeps what was agreed
- Date: 2026-10-06
- Status: Accepted
- Area: agent, prompt

## Context
Owner test on 2026-10-06 with a real chip (OBM tenant, advanced prompt):
1. "posso amanhã no período da tarde" became `agendar` with "amanhã, quarta, à tarde". The owner wants the agent to ask which time suits the person whenever only a period is given. The base said `agendar` = "dia E período", the guided flow asked "um dia e um período", and the OBM advanced text says "Confirmou dia e período: ... Use action agendar". The 2026-10-05 diagnostic battery had already seen "de tarde" scheduled without a day (2 of 3) and blamed the OBM example; the owner's position is that a fix found in testing belongs to the base and must reach every tenant automatically.
2. At 11:41 the AI answered "Claro, pode ser sim" to "consigo conversar agora" (fixed the same day, `QUANDO CHAMAR UM HUMANO`). At 14:31 the person wrote "Na verdade não consegui entrar, vamos marcar para agora". The help request summary read "quer atendimento agora, após confirmar conversa amanhã à tarde e dizer que não conseguiu entrar": it lost that the AI itself had agreed to the immediate call that did not happen. Cause: the base summary rule said "nunca inclua o que você ofereceu ou sugeriu".

## Decision
- Base contract (`### OUTPUT`, `buildBaseTail`): `agendar` only with day AND time. A day alone or a period alone ("amanhã à tarde", "quinta de manhã") is `none` and the agent asks which time suits the person. `preferencia_horario` format "terça às 15h". The JSON schema descriptions in `lib/agent.ts` say the same.
- `### PRECEDÊNCIA` now lists "quando uma conversa conta como marcada" among the things no tenant text can change. Without it the OBM text ("dia e período") still won once in the battery.
- The guided flow (steps 6 and 7) and its example ask for and confirm a time.
- Summary: the request is what the person asked or said, never what the agent suggested, but it now also includes what was already agreed (day and time) and what did not happen as agreed, with when it had been agreed.

## Consequences
- Every tenant, guided or advanced, asks for the time before a meeting counts as scheduled. A tenant prompt that says "dia e período" no longer overrides it.
- The battery (`npm run test:e2e:bateria`, 73 cases) changed P4, P9, C3 and O7 to expect the time question, dropped the OBM "de tarde" pending case (it passes now) and added M8 (the summary of 2026-10-06). First run: 73 passed, 2 only on retry. `test:e2e:ia` 28/28.

## Addendum 2026-10-06 (evening), owner decisions
- "À tarde" is 13:00 to 17:00 in whole hours, and only what has not started yet: at 13:00 "agora à tarde" offers 14h, 15h, 16h and 17h. Code computes it (`TARDE`, `horariosDaTarde`, `lib/horarios.ts`) inside the registered hours, and the `### CALENDÁRIO` block states today's and tomorrow's afternoon. The agent always asks the time offering those hours, saying which day; it never opens a help request just because the slot is today ("hoje à tarde" or "agora à tarde" is a period, not "now"). Morning and evening have no range defined by the owner yet.
- A closed business offering to check the next open day with the team (and opening a request) is accepted.
- When a help trigger happens (base or tenant `escalateWhen`), `pausar` in that same reply, without collecting more data first: a pizzeria with "quando a pessoa quiser fechar um pedido" asked "entrega ou retirada?" before passing (2 of 4).
- The base text of the day was tightened to keep the guided demo under the size warning (13,487 of 13,600); the OBM advanced prompt assembles to 14,702 of 16,000.

## Addendum 2026-10-07, periods follow each business's hours
- Owner: "tem que olhar de acordo com as configurações da empresa, deve ser algo automático e não engessado". `TARDE`/`horariosDaTarde` became `PERIODOS_DO_DIA`/`horariosDoPeriodo` (`lib/horarios.ts`): morning until 11h, afternoon 13h to 17h (owner), evening from 18h; each cut by the REGISTERED hours of that day (whole hours from opening and before closing; overnight runs to midnight) and, today, only what has not started. The OBM (8h to 18h) gets morning 8h to 11h and afternoon 13h to 17h, no evening; the pizzeria (18h to 23h) only evening, 18h to 22h. No registered hours, no list (never invent hours). `### CALENDÁRIO` states today's and tomorrow's lists and that rescheduling also needs the time.
- Measured on 2026-10-07, 5 tries each: R7 and P9 5/5; P4, P12, C3, L8, R9 4/5; M8 (summary keeps the failed agreement) 3/5. The suite runs with one retry, so a run is red in a minority of rounds from model variance alone.
- `npm run checar` now fails on a control character in a text file: a regex `` written by a script became backspace (0x08) and the regex never matched, so a check in `e2e/atendimento.serial.spec.ts` (since 99dbeab) and three new battery cases passed without checking anything.
