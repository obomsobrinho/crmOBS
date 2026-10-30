# Own agenda: the AI asks day and period, the code offers at most 3 times and books
- Date: 2026-10-28
- Status: Proposed (source of truth and the rules decided by the owner on 2026-10-28; the build waits for his approval; open points in `docs/plano-agenda.md`, section 6)
- Area: agent-ai, data, product

## Context
"Agendar" captured a day and time in words and handed off; nothing checked availability or stored
a booking. On 2026-08-26 the owner had ruled "integrate Google Calendar, never a full own agenda".
On 2026-10-28 he reopened it and chose our own agenda: onboarding already loses most testers (1 of
8 connected WhatsApp), and a Google OAuth step plus Google's verification of the sensitive
`calendar.events` scope (months, 100-user cap before it) would block launch. The same day he
reviewed the screens on `/design/agenda` and set the rules: the AI always asks the day and the
period first and then offers at most 3 times of that period, the nearest ones ("mais que 3 é mal
visto"); no day limit for the AI; a free time inside the minimum notice is escalated to the team,
never booked nor hidden; the team books outside business hours; an automatic reminder (first "24h before",
then the same day "one run at 9h"); a weekly grid like Google Calendar.

Evidence for the brain design: the 2026-10-05 battery showed the model failing at date math until
the `### CALENDÁRIO` block was computed by code (30 of 30 checkable cases, 3 of 3). `runAgent` is
one strict-JSON call that n8n reads; the persona is the cached prefix.

## Decision
1. Source of truth: own tables `agenda_servicos`, `agenda_bloqueios`, `agendamentos` and
   `clients.agenda_config`. One agenda per tenant, all plans. Google only as a possible later sync.
2. Two confirmed bookings of a tenant can never overlap: `exclude using gist` on
   `tstzrange(inicio, fim)` where `status = 'confirmado'`. Blocks are checked in code.
3. All rules live in ONE pure module, `lib/agenda.ts`: start grid (`hora`, `meia`, `seguido`, with
   end + buffer rounded to the next mark), `consultarPeriodo` (3 nearest of the period, outside the
   notice window, or "antecedencia" to escalate), `validarHorario`, `decidirAgenda`,
   `janelaDoLembrete`, the code-written replies. Screens, routes and brain import it. The free
   times come from the agenda's OWN days and hours (`agenda_config.horario`, owner decision of
   2026-10-28 "Sim, horário próprio"; null = a copy of the business hours, `horarioDaAgenda`,
   prefilled on first activation). The agenda hours may go beyond the business hours, with no
   block (owner, 2026-10-28: "Pode passar"); the reminder stays inside the business hours.
4. Brain: a per-turn `### AGENDA` block (after CALENDÁRIO, cache untouched) carries the contract,
   the services and the person's bookings, never times. The output gains `agenda {acao, servico,
   dia, periodo, hora, agendamento}`. With `consultar` the CODE writes the reply with the times;
   with `marcar`/`remarcar` the code validates and books before replying; inside the notice window
   the turn becomes `pausar` with a summary (a help request); a taken time gets the 3 nearest of the
   same period. No function calling, one model call per turn.
5. The agenda switch (`agenda_config.ativa`) decides menu item, funnel column ("Agendado", created
   or archived by `agenda_etapa_do_funil`) and prompt block. Booking moves the conversation to
   "Agendado" (AI: canonical advance; team: `stage_source` human).
6. Reminder: ONE run per day at 9h São Paulo (Vercel Cron `0 12 * * *` UTC, `GET
   /api/agenda/lembretes`, header secret `CRON_SECRET`), only on days the company opens (business
   hours), covering bookings from tomorrow to the next open day inclusive (`janelaDoLembrete`);
   bookings created after the covering run get none. Fixed text, no AI, idempotent by claiming
   `lembrete_enviado_em`. Sent through `lib/envio-ativo.ts`, the single active-message piece that
   Follow-up will reuse; cap, interval, recent-conversation and "SAIR" values are pending.

## Consequences
- `CLAUDE.md` and `proximos-passos.md` must replace "never build a full own agenda" with the
  minimal own agenda rule once approved.
- The OUTPUT schema changes for every tenant (field `agenda`, empty when off): run `test:e2e:ia`
  and `test:e2e:n8n` before deploying.
- The migration must be applied by the owner; until then the brain treats the agenda as off and
  `/agenda` says it is not available. Types in `lib/database.types.ts` were written by hand and must
  be regenerated after applying.
- The layout reads `agenda_config` once per navigation for the menu (`agendaAtivaDoTenant`); fold
  it into `getMyClient` after the migration is in production.

## Final decisions (owner, 2026-10-28)
- National holidays (computed in `lib/feriados.ts`) are blocked for the AI unless the owner releases
  one (`agenda_config.feriadosLiberados`); optional days only show. Whole-day blocks with a reason.
- The AI reads the periods from the agenda hours (`periodosDoDia`).
- The old "Agendar" goal is gone: the agenda switch drives OBJETIVO, FLUXO and OUTPUT; without it
  nobody books (guided and advanced), a request for a time becomes `pausar`.
- Turning the agenda off sends "Agendado" contacts back to the previous column.
- Reminder: 20 to 60 s between messages per company, companies in parallel, self-chaining runs;
  never to an expired or late account; a refused send is recorded and retried, with an icon in the
  owner's central.
- The contact card shows the contact's bookings ("Horários marcados").
