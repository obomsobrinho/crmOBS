# The agenda consults only when the person asks, and the model's own reply no longer triggers it
- Date: 2026-11-05
- Status: Accepted
- Area: agent-ai, product

## Context
The prompt simulator with a simulated lead (04/11/2026) showed 6 of 48 conversations getting a slot list on the first reply, from people who only greeted or asked for an explanation. Three causes:
- The model consulted without being asked.
- `consultaDeSeguranca` read the model's own reply ("posso agendar uma demonstração") as a booking request.
- The words "horário", "hoje" and "agendamento" were read as a request ("vocês abrem hoje? qual o horário?", "chega mais pedido de agendamento").

## Decision
- **Prompt:** `### AGENDA` (`lib/agenda.ts`) opens with a gate: the steps apply only when the person wants to book. A greeting, a question about how it works, price, or refusing a call is never `consultar`.
- **Booking intent:** `falaEmMarcar` is the one reading of the person's words (verb forms, free slots, period). "Horário" alone, a greeting or "agendamento" as a subject do not count.
- **Safety net:** `consultaDeSeguranca` needs `falaEmMarcar` on the person's message. The reply counts only in the two cases of 29/10: the model asked "manhã ou tarde?", or asked for help to see slots (`fechar`/`falta_info`).
- **Campaign opening:** `consultaBarradaNaAbertura` blocks `consultar` on the first reply to a campaign lead unless the person talks about booking, or gives a day with a period or a time (`horariosCitados`).
- **Order:** the block is decided BEFORE the net. It only clears a `consultar`, so a help request from the model stays intact.

## Consequences
- Only tenants with the agenda on are affected.
- Known limits, the owner's call:
  - A bare day accepting a campaign invite ("pode ser amanhã") is blocked.
  - When the block clears a model `consultar`, the reply the model wrote goes out, though the prompt tells it that reply is discarded.
  - `falaEmMarcar` is a word list: "tem alguma vaga pra hoje?" does not match.
  - `marcar` without a valid time still becomes a consult inside `decidirAgenda`.
- `e2e/horarios.ia.spec.ts` assumes the OBS agenda is off. It is on, so 5 or 6 of its cases fail on `main` before and after this change.

## Evidence
- `e2e/agenda-lib.design.spec.ts`, describe "ensaio com lead simulado (04/11/2026)".
- The same `horarios.ia` cases fail on `ae1b882` without this change (6 failed, 22 passed) and with it (5 failed, 23 passed).
