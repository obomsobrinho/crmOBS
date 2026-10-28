# Own agenda: free slots computed by code in the prompt, booking done by code
- Date: 2026-10-28
- Status: Proposed (source of truth decided by the owner on 2026-10-28: own agenda; the build and the defaults in `AGENDA_PADRAO` wait for his approval)
- Area: agent-ai, data, product

## Context
"Agendar" captured a day and time in words and handed off; nothing checked availability or stored
a booking. On 2026-08-26 the owner had ruled "integrate Google Calendar, never a full own agenda".
On 2026-10-28 he reopened it and chose our own agenda: onboarding already loses most testers (1 of
8 connected WhatsApp), and a Google OAuth step plus Google's verification of the sensitive
`calendar.events` scope (months, 100-user cap before it) would block launch.

Evidence for the brain design: the 2026-10-05 battery showed the model failing at date math until
the `### CALENDÁRIO` block was computed by code (30 of 30 checkable cases, 3 of 3). `runAgent` is
one strict-JSON call that n8n reads; the persona is the cached prefix.

## Decision
1. Source of truth: own tables `agenda_servicos`, `agenda_bloqueios`, `agendamentos` and
   `clients.agenda_config`. Minimal: one agenda per tenant, no grid editor, no recurrence. Google
   only as a possible later one-way sync.
2. Two confirmed bookings of a tenant can never overlap: `exclude using gist` on
   `tstzrange(inicio, fim)` where `status = 'confirmado'`. Blocks are checked in code.
3. Availability = `horarioCadastrado` minus bookings minus blocks, with notice, horizon, buffer
   and grid, in ONE pure module `lib/agenda.ts`. Screens, routes and brain import it.
4. Brain: a per-turn `### HORÁRIOS LIVRES` block (after AGORA, cache untouched) lists slots with
   short codes; the output gains `agenda {acao, horario, agendamento}`. The code accepts only codes
   from that turn, books before replying, and rewrites the reply when the slot is gone. No function
   calling.
5. Business defaults live in `AGENDA_PADRAO` and are not decisions until the owner says so.
6. Booking notice stays n8n's "Notifica grupo"; cancel and reschedule notices go from the app to
   `notify_group_jid`. A booking never opens a help request.

## Consequences
- `CLAUDE.md` and `proximos-passos.md` must replace "never build a full own agenda" with the minimal
  own agenda rule once approved.
- The OUTPUT schema changes for every tenant (field `agenda`, empty when off): run `test:e2e:ia`
  and `test:e2e:n8n` before deploying.
- Migration must be applied by the owner; until then the brain ignores the agenda (missing tables
  are treated as off) and `/agenda` says the agenda is not available.
- Reminders are manual until a scheduler and a channel decision exist.
