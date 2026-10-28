# Agenda through Google Calendar: free slots computed by code, booking done by code
- Date: 2026-10-28
- Status: Proposed (waiting for the owner's decisions D1 to D17 in `docs/plano-agenda.md`)
- Area: agent-ai, data, product

## Context
The goal "Agendar" today captures a day and a time in the customer's words, records it, moves the
conversation to `aguardando_humano` and lets n8n's "Notifica grupo" tell the team, who books by
hand. Nothing checks availability or creates an event. The owner decided on 2026-08-26 that the
Agenda is the first item after the beta and must integrate Google Calendar, never a full own
calendar (`docs/proximos-passos.md`). That note also assumed the agent would need function calling
in `/api/agent`.

Evidence that shapes the decision:
- On 2026-10-05 the diagnostic battery (31 cases x 3, real brain) showed the model failing at date
  math (booked Saturday morning on a Friday 19h; said 17h "already passed" at 16h). With the
  `### CALENDÁRIO` block computed by code (`lib/horarios.ts`), the same model passed the 30
  checkable cases 3 of 3. Principle: the model talks, the code does the math.
- `runAgent` is one strict-JSON call; n8n reads `action`, `messages`, `summary`,
  `preferencia_horario`. The persona is the cached prefix; per-turn blocks go after AGORA.
- Competitors (research of 2026-10-28 in the plan): the AI booking in a real calendar is the
  selling line (atenda.pt); serious clinic tools send reminders via Official API templates.

## Decision (proposed)
1. When a tenant has Google connected and the goal `agendar`, `processTurn` reads Google freeBusy,
   a pure module `lib/agenda.ts` computes free slots (business hours, service duration, buffer,
   minimum notice, horizon) and a `### HORÁRIOS LIVRES` block with short ids goes after
   `### CALENDÁRIO`.
2. The model keeps one call and the same contract, plus one field: the id of the chosen slot. The
   code accepts only an id offered in that turn, reserves the slot in `appointments` (unique per
   tenant and start time), re-checks freeBusy and creates the event with an id derived from the
   row (idempotent on n8n retry). On failure the code discards the model's reply and writes one
   offering the next free slots, with action `none`.
3. No function calling for now. It becomes worth it only when the agent needs several distinct
   tools.
4. Narrowest Google scopes: `calendar.app.created` (a calendar created by the CRM, the only place
   it writes) and `calendar.freebusy` (busy blocks of the owner's calendars, never their content).
5. Google stays the source of truth for availability; `appointments` is the CRM's record of what
   it booked. Booking notice keeps going through n8n's "Notifica grupo" (no n8n change in the
   MVP). A booking still never opens a help request
   (`docs/adr/2026-09-30-schedule-does-not-open-help-request.md`).
6. Without Google connected, or when Google fails, today's `agendar` behavior is the fallback.

## Consequences
- Reverses the 2026-08-26 assumption that function calling is this phase's architectural change;
  `proximos-passos.md` must record it if accepted.
- New tables `agendas`, `agenda_tokens` (service_role only, encrypted refresh token),
  `appointments` (realtime publication, `TABELAS_DO_CLIENTE`, LGPD export).
- New server-only env vars (Google OAuth client and token key) go to `data.md`.
- The Google project needs verification before the 100th consenting account (cap cannot be reset).
- Slot rules live only in `lib/agenda.ts`; screens, bench and brain import it.
- Automatic reminders stay out until the owner picks a path (active-messaging rules over QR, or
  Official API).
