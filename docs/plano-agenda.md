# Plan: Agenda (own agenda, minimal)

**Status: owner decided on 28/10/2026: OWN agenda, not Google Calendar** ("vamos seguir com a nossa
mesmo"). The MVP is implemented on branch `claude/agenda-plano-0fc545`, NOT deployed and with the
migration NOT applied anywhere. Every other business choice below is a DEFAULT picked overnight
for the owner to confirm or change; they all live in one place, `AGENDA_PADRAO` in `lib/agenda.ts`.
ADR: `docs/adr/2026-10-28-own-agenda-slots-in-prompt.md` (Proposed until the owner approves the
build).

This reverses part of the 26/08/2026 rule "NÃO construir agenda própria completa, integrar Google
Calendar". What stays from that rule: no FULL agenda (no drag and drop grid, no multi professional,
no recurring rules, no waiting list). What changes: the source of truth is our own tables. When the
owner approves, `CLAUDE.md` ("Never build a full own agenda") and `proximos-passos.md` need the new
wording; this branch does not edit them.

## 1. The problem

"Agendar" today captures a day and time in words, records it, moves the conversation to
`aguardando_humano` and n8n's "Notifica grupo" tells the team, who books by hand. Nothing checks
availability, nothing is stored as a booking. Competitors list scheduling as a table item, and 4 of
the 5 tester segments book time.

## 2. Decision 1: source of truth (decided: own agenda)

| | A. Own agenda (chosen) | B. Google Calendar | C. Own + optional Google sync later |
|---|---|---|---|
| Owner setup | none: turn on, list services | sign in with Google, authorize, pick calendar | A now, optional connect later |
| Our setup | migration only | Google Cloud project, consent screen, privacy policy page, domain verification, verification review | A now, B's setup only if sync is built |
| Google verification | not needed | `calendar.events` is a **sensitive** scope: verification required, Google says it "might require several months"; 100-user cap for life before it. `calendar.freebusy` and `calendar.app.created` do not appear among the sensitive scopes in at least one developer's console (forum report), so they MAY avoid verification; unconfirmed, must be checked in the console | only for the sync |
| Build cost | availability, conflicts, reschedule are ours (pure module + one DB constraint) | availability from freeBusy; conflicts still ours; token storage, revocation, reconnection | A + one-way push |
| What the owner sees in the panel | the bookings, day and week list, create, cancel, reschedule | a list mirrored from Google, or "open Google" | A |
| Double booking when the owner also books outside | risk: a booking made on paper or in another app is invisible unless the owner blocks the time in the panel | lower: freeBusy sees everything in the owner's calendar | A's risk until sync |
| Onboarding | no new step (1 of 8 testers connected WhatsApp: every extra step costs) | extra OAuth step | none at first |

Market (see section 9): clinic and salon tools (GestãoDS/ChatGDS, Clínica nas Nuvens, Trinks) own
the agenda; the AI receptionist atenda.pt integrates with "a sua agenda" (provider not stated);
DeskcommCRM owns it and syncs to Google as an option.

## 3. MVP scope (implemented)

- **Services with duration** per tenant (`agenda_servicos`).
- **Availability** = business hours already in the agent config (`horarioCadastrado`) minus
  bookings minus **blocked times** (`agenda_bloqueios`), with minimum notice, horizon and buffer.
- **Conflict prevention** in the database: an exclusion constraint makes two confirmed bookings
  of the same tenant that overlap impossible (`btree_gist`). The code also checks blocks.
- **Panel `/agenda`**: day or week list, create, cancel, reschedule, block times, settings
  (owner). `/design/agenda` shows the same screen with fake data.
- **AI booking**: when the tenant turned the agenda on and has the goal `agendar`, each turn gets
  `### HORÁRIOS LIVRES` computed by code with short codes; the model picks one code; the code
  validates, books, and fixes the reply if the slot was taken in between. Reschedule and cancel in
  the chat use the same contract.
- **Notice to the team**: booking keeps going through n8n's "Notifica grupo" (unchanged), now with
  the exact slot in `preferencia_horario`; cancel and reschedule are noticed by the app (same
  destination, `notify_group_jid`), DDD 00 never noticed.
- **Reminders: stub.** A one-click "Lembrete" in the panel copies a ready text and opens the
  conversation. Automatic reminders need a scheduler plus active messaging over QR or the Official
  API: not built (decision D8).

Out: several professionals or rooms, recurring blocks, waiting list, Google sync, public booking
page, automatic reminders.

## 4. Flow

```
Customer: "queria marcar"
processTurn (agenda on + goal agendar)
  1. read services, config, future bookings and blocks of the tenant (one query each, bounded)
  2. lib/agenda.ts: free slots per service -> ### HORÁRIOS LIVRES with codes (S1, S2, ...)
     plus ### AGENDAMENTOS DESTA PESSOA (future bookings of this phone, codes A1...)
  3. runAgent: one call, same strict JSON + `agenda` {acao, horario, agendamento}
AI: "Tenho quinta, 30/10, às 9h, 10h30 ou 14h. Qual fica melhor?"   (action none)
Customer: "10h30"
AI: action agendar, agenda {acao: marcar, horario: S2}
  4. code: S2 must be in THIS turn's list; insert into agendamentos
     ok   -> reply as written; preferencia_horario = "quinta, 30/10, às 10h30"
     23P01 (overlap) or invalid -> replace the reply with a code-written one offering
             the next free slots; action none
  5. n8n sends the reply and notices the team (unchanged)
Reschedule: acao remarcar + horario + agendamento (A1): new booking, old one cancelled.
Cancel: acao cancelar + agendamento: booking cancelled, team noticed by the app.
```

Without the agenda on, nothing changes. If the agenda tables are missing (migration not applied)
or a read fails, the turn runs exactly as today.

## 5. Data model (`supabase/migrations/20261028050000_agenda_propria.sql`, NOT applied)

- `clients.agenda_config jsonb` (null = off): `{ ativa, antecedenciaMin, diasAFrente,
  intervaloMin }`, normalized by `normalizarConfigDaAgenda`.
- `agenda_servicos` (id, client_id, nome, duracao_min 5..480, ativo, ordem).
- `agenda_bloqueios` (id, client_id, inicio, fim, motivo, criado_por).
- `agendamentos` (id, client_id, phone, nome, servico_id, servico_nome snapshot, inicio, fim,
  status `confirmado`/`cancelado`, origem `ia`/`time`, criado_por, cancelado_em, cancelado_por
  `cliente`/`time`, remarcado_de) with `exclude using gist (client_id with =, tstzrange(inicio,
  fim) with &&) where (status = 'confirmado')`.
- RLS on, members read their tenant, writes only through server routes (service_role) and the
  brain. No grant to `anon`. `agendamentos` in `supabase_realtime`. All three in
  `TABELAS_DO_CLIENTE`.

## 6. Defaults I chose (the owner decides; all in `AGENDA_PADRAO`, `lib/agenda.ts`)

| # | Question | Default | Alternatives |
|---|---|---|---|
| D2 | Who confirms | AI confirms on the spot | team approves each |
| D3 | Minimum notice | 2 hours | none, 1h, 4h, 1 day |
| D4 | How far ahead | 14 days | 7, 30, 60 |
| D5 | Buffer between bookings | 0 min | 10, 15, 30 |
| D6 | Slot grid | every 30 min | 15, 60 |
| D7 | Slots offered at once | up to 3, spread across the day | whole day |
| D8 | Reminders | manual (copy text, open conversation) | automatic over QR under the active-messaging rules; automatic on the Official API |
| D9 | Customer reschedules or cancels in the chat | yes, AI does it, team noticed | goes to the team |
| D10 | Funnel stage after booking | unchanged (`agendar` still moves to `aguardando_humano`) | new canonical "Agendado" |
| D11 | Several professionals | no (one agenda per tenant) | yes |
| D12 | Plans | all plans | Profissional and up; add-on |
| D13 | Menu | "Agenda" leaves "Em breve", between Conversas and Contatos, for owner and attendants | owner only |
| D14 | Who edits services, hours rules, blocks | owner edits services and rules; any member blocks times and books | owner only |
| D15 | Team booking outside business hours | allowed (warning only) | blocked |

## 7. Risks

| Risk | Answer |
|---|---|
| Double booking from two chats at once | DB exclusion constraint; the losing turn gets a code-written reply with the next slots |
| Owner books outside the panel | blocked times in the panel; residual risk stated on the screen |
| Model books a time never offered | only a code from this turn's list is accepted |
| Timezone | all math in America/Sao_Paulo (`lib/fuso.ts`), SP has no DST since 2019 |
| No business hours registered | the agenda cannot be turned on (settings say why) |
| Prompt size | 3 days x up to 6 slots per service, max 6 services; block only when on |
| Mixed audience | screen text says "horário" and "serviço"; segment words come from the service names |

## 8. Tests

- Pure specs of `lib/agenda.ts` (slots, notice, horizon, buffer, blocks, midnight, codes,
  decision of the booking) and the decision applied to a mocked model output: `sem-login`, free.
- `/design/agenda` screens: `sem-login` and 390px, free.
- After the migration is applied to a Supabase branch or a local stack: `logado-serial` spec for
  the routes (create, overlap 409, cancel, reschedule). Written later, needs the DB.
- Paid, only when named: `test:e2e:ia` and `test:e2e:n8n` before any deploy that turns it on.

## 9. Reference: DeskcommCRM

Read only on GitHub (github.com/melgarafael/DeskcommCRM, **MIT license**: reusing ideas is fine;
copying code would be allowed with the MIT notice kept, but nothing was copied).

What it does (migration `0177_agenda_o_compromisso_marcado.sql`, `docs/architecture/agenda-no-turno.md`,
`components/agenda/*`, `app/api/v1/agenda/*`):
- **Model**: `calendar_event_types` (service: duration 5..1440, slot interval, buffer before and
  after, location kind, reminder on/off and minutes before, a WhatsApp template name, default
  owner), `calendar_appointments` (starts_at, ends_at, status with pending/confirmed/cancelled,
  owner user, created_by kind, source, `reminder_sent_at`, coherent cancel check, partial index
  on live bookings), `calendar_availability_exceptions` per person per day in minutes,
  `calendar_connections` for Google per user. Pending bookings expire (`0249`).
- **Conflicts**: checked in application code; migration 0177 has no exclusion constraint.
- **People**: agenda per person ("agenda dos colegas"), filter by person, owner per booking.
- **AI**: tool calling (`crm_list_appointments` and write tools) through the Vercel AI SDK, then
  a re-read of the agenda before the closing summary, so the summary never states a stale time.
- **Reminders**: per service, minutes before, via a WhatsApp template (Official API) and a
  scheduler service (`Dockerfile.scheduler`).
- **Extras**: Google Calendar and Meet, addresses, collective bookings, "comanda" per booking,
  LGPD anonymization of agenda rows.

Is it good: broad and careful (tests per rule, LGPD, timezone per person), but heavy: ~60 API
routes and dozens of components for the agenda alone, and tool calling with a second model pass.

Taken: buffer and duration per service as the natural home (ours: duration per service, buffer
global for now); a coherent cancel check (`cancelado_em` set exactly when cancelled); a partial
index on live bookings; reminder "minutes before" as the future field shape; re-reading bookings
after the action (ours: the code books before replying, so the reply is never stale).
Done better: the overlap is impossible in the database (exclusion constraint), not just checked in
code; one model call with slots computed by code instead of tools plus a closing pass; no Google
step in onboarding; one agenda per tenant until a customer asks for more.

## 10. Alternative kept on file: Google Calendar

If the owner later wants sync: one-way push of our bookings to a calendar created by the app
(`calendar.app.created`) plus `calendar.freebusy` to read busy blocks, both to be confirmed as
non-sensitive in the console before building. Setup steps: Google Cloud project, Calendar API,
consent screen (External, homepage, privacy policy, terms, authorized domain), domain verification,
scopes, Web OAuth client with redirect `/api/agenda/google/callback`, env vars set by the owner.
Quotas (projects after 01/05/2026): 10,000 requests/min per project, 600/min per user, free under
the daily threshold. Sources: developers.google.com/calendar/api/auth,
developers.google.com/calendar/api/guides/quota, support.google.com/cloud/answer/7454865,
discuss.google.dev (calendar.app.created scope picker thread).

## Market sources

atenda.pt and atenda.pt/precos (AI books and reschedules, reminders, EUR 89 single plan);
ia.zapresponder.com.br ("Agendamentos" are scheduled messages; Starter R$ 132 without meeting
scheduling); helenacrm.com (agenda through integrators); intercom.help/chatgds article 14744352
(reminders by Meta templates); intercom.help/clinicanasnuvens article 8387018 (manual confirmation
list, AI as paid add-on).

## 11. Implementation state (28/10/2026, branch `claude/agenda-plano-0fc545`)

Built:
- `lib/agenda.ts` (pure): `AGENDA_PADRAO` and every default, `horariosLivres`, `montarOfertas`,
  `blocoDaAgenda`, `decidirAgenda`, the code-written replies. Specs: `e2e/agenda-lib.design.spec.ts`.
- `lib/agenda-servidor.ts` (server): reads that return `null` when the tables do not exist,
  `marcarAgendamento` (23P01 = overlap), `cancelarAgendamento`, `remarcarAgendamento`.
- Routes: `POST /api/agenda/agendamentos`, `PATCH /api/agenda/agendamentos/[id]`
  (`cancelar`/`remarcar`), `POST|DELETE /api/agenda/bloqueios`, `PUT /api/agenda/config` (owner),
  `GET /api/agenda/horarios`. All through `sessaoDaRota`, tenant from the session.
- Brain: `agendaDoTurno` + `montarOfertas` before the model, `### HORÁRIOS LIVRES` after
  `### CALENDÁRIO`, field `agenda` in the output schema, `aplicarAgenda` books before replying.
  `diagnostics.agenda` tells the bench what happened (or would happen in `dryRun`).
- Screen `/agenda` (`components/agenda/Agenda.tsx` over `lib/agenda-fonte.ts`), menu item
  between Conversas and Contatos; `/design/agenda` runs the same screen on a memory source.
- Migration `20261028050000_agenda_propria.sql`, types in `lib/database.types.ts` written BY HAND
  (no local database tonight): regenerate after applying. The three tables are in
  `TABELAS_DO_CLIENTE` and the export.

Not built or stubbed:
- Automatic reminders (D8): manual copy text. Needs a scheduler and the channel decision.
- Realtime on `/agenda`: the table is in the publication with `REPLICA IDENTITY FULL`, but it
  is NOT in `ESCUTAS_DO_TENANT` (`lib/use-canal-ao-vivo.ts`): adding it before the migration
  reaches production would make Supabase refuse the whole tenant channel. Add it after.
- "Team approves each booking" (D2 alternative): not built; the AI always confirms.
- The bench shows `diagnostics.agenda` only in the raw diagnostics; no dedicated card.
- Booking notice still has no "Abrir" link (n8n "Notifica grupo" unchanged).
- Cost note: every turn of a tenant with the goal `agendar` does one extra read (agenda config
  and services) even when the agenda is off, because `agenda_config` cannot join the main
  `clients` select until the migration exists everywhere. Fold it in after.

Before any deploy: apply the migration (owner), regenerate types, then `npm run test:e2e:ia` and
`npm run test:e2e:n8n` (paid) because the output schema changed for every tenant.
