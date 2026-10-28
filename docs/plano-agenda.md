# Plan: Agenda (own agenda, minimal)

**Status: owner decided on 28/10/2026: OWN agenda, not Google Calendar** ("vamos seguir com a nossa
mesmo"). The MVP is implemented on branch `claude/agenda-plano-0fc545`, NOT deployed and with the
migration NOT applied anywhere. The owner reviewed the screens and decided the rules on 28/10/2026
(section 3); what is still open is listed in section 6. Every value lives in `lib/agenda.ts`.

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

## 3. Owner's decisions of 28/10/2026 (review of `/design/agenda`, "Pode mandar")

These replace the overnight defaults D2 to D15 wherever they differ.

AI rules
1. The AI confirms by itself.
2. The AI ALWAYS asks the day and the period (morning, afternoon, evening) first, and only then
   offers at most 3 times of that period, the nearest ones. Never more than 3, even when more are
   free.
3. No limit of days ahead for the AI: it offers the nearest within the requested day and period.
4. Minimum notice, configurable, default 2h. A free time INSIDE that window (free at 14h, asked at
   13h30) the AI does not book: it says it will confirm with the team and opens a help request
   (`pausar`) for the owner to decide. It escalates, it does not hide.
5. The customer reschedules and cancels in the chat.
6. The team books by hand outside business hours and with no day limit; the AI does not.

Reminder
7. Automatic over WhatsApp, fixed text, no AI cost, 24h before, ALWAYS inside business hours. When
   24h before falls outside them, it goes at the last open moment before that (Monday 9h with
   Sunday closed: Saturday). A booking made less than 24h ahead gets no reminder. Setting: on/off.

Settings (Configurações, section Agenda)
8. An "Agenda" item with an on/off checkbox and a short text. Checked opens the settings below.
   Off: the Agenda disappears from the menu, the funnel and the AI prompt. The activation also
   appears in onboarding as the same item.
9. Days and hours = the existing business hours (single source).
10. Services: list with "+ Adicionar serviço", each with a name and a free duration in minutes.
    Owner only. With a single service the AI does not ask which.
11. Buffer between bookings: 0, 5, 10, 15 or 30 min.
12. "Os horários começam": on the hour (8h, 9h, 10h); on the hour or half hour (8h, 8h30, 9h,
    default); right after the previous one (8h, 8h40, 9h20). When the buffer is above 0: "O
    intervalo de N min entre horários já entra na conta." (end + buffer, rounded up to the next
    mark of the option).
13. Minimum notice: free value, default 2h, with the sentence "A IA só marca sozinha com pelo menos
    2h de antecedência. Se o cliente pedir um horário mais próximo, ela avisa que vai confirmar e
    chama você."
14. One agenda per company, all plans.

Funnel and menu
15. With the agenda on, the funnel gets an "Agendado" column (suggested name) and booking moves the
    contact there. Without the agenda, the column does not exist.
16. Menu: Agenda between Conversas and Contatos, only with the agenda on.

Layout
17. Weekly grid in the Google Calendar and Teams style (reference: Clinic Radar on Dribbble): day
    columns with a counter, the "now" line, cards with a colored left bar, name and time, today
    highlighted.
18. No side list of appointments. Instead a month mini calendar with the shown week highlighted;
    clicking a week moves the grid; arrows and the month on top also navigate.
19. Clicking a booking opens the detail: who (contact, phone), service, time, what it is about, and
    reschedule and cancel.

## 4. How it works now (implemented)

```
Customer: "queria marcar"
processTurn (agenda on, business hours registered, at least one service)
  ### AGENDA block (after CALENDÁRIO, cache prefix untouched): the contract, the services
  (codes V1, V2 only when more than one) and the person's future bookings (A1...). NO times.
AI: asks the service (if several), then the day and the period
Customer: "quinta à tarde"
AI output: agenda {acao: consultar, dia: 2026-10-29, periodo: tarde}
  code reads ONLY that day (no day limit), consultarPeriodo():
    up to 3 nearest free times of the period, outside the notice window -> CODE writes the reply
      "Amanhã, quinta, 29/10, à tarde, tenho 14h, 14h30 ou 15h. Qual fica melhor?"
    free only inside the notice window -> code writes "vou confirmar com a equipe", action pausar
    nothing free -> "não tenho horário livre. Prefere outro período ou outro dia?"
Customer: "14h30"
AI output: action agendar, agenda {acao: marcar, dia, hora: 14:30}
  code: validarHorario() -> ok: book (DB exclusion constraint), reminder time stored,
        conversation moves to "Agendado"; inside the notice window: help request;
        taken or off the grid: code offers the 3 nearest of the same period
n8n sends the reply and notices the team (unchanged)
```

Reschedule: the same two steps with `acao: remarcar` and `agendamento: A1` (the old time does not
count as busy). Cancel: `acao: cancelar` + `agendamento`, the team is noticed by the app.

Grid of start times (`iniciosDoDia`): "hora" and "meia" walk the marks inside business hours; after
a busy block the next start is end + buffer rounded up to the next mark. "seguido" chains: each
start is the previous end + buffer.

## 5. Data model (`supabase/migrations/20261028050000_agenda_propria.sql`, NOT applied)

- `clients.agenda_config jsonb` (null = off): `{ ativa, antecedenciaMin, intervaloMin, inicio,
  lembrete }`, normalized by `normalizarConfigDaAgenda`.
- `agenda_servicos` (name, `duracao_min` 5..480, `ativo`, `ordem`).
- `agenda_bloqueios` (start, end, reason).
- `agendamentos` (phone, name, service snapshot, start, end, status, origin, `resumo` = what it is
  about, `lembrete_em`, `lembrete_enviado_em`, cancel fields, `remarcado_de`), exclusion constraint
  against overlap, partial index on pending reminders.
- `agenda_etapa_do_funil(p_client, p_ativa)`: on creates (or unarchives) the canonical "Agendado"
  stage right after "Aguardando atendimento"; off archives it. Called by `PUT /api/agenda/config`.
- RLS on, members read, writes only by server routes and the brain. `agendamentos` in the realtime
  publication with `REPLICA IDENTITY FULL`. All three tables in `TABELAS_DO_CLIENTE`.

## 6. Still open (not decided by the owner; marked PENDENTE in the code)

| # | Question | What the code does now |
|---|---|---|
| P1 | Where each period starts and ends | morning before 12h, afternoon 12h to 18h, evening from 18h (`PERIODOS_DA_AGENDA`) |
| P2 | "Last open moment" for a reminder that falls outside business hours | 30 min before closing (`LEMBRETE_ANTES_DE_FECHAR_MIN`) |
| P3 | Reminder on or off by default | on (`AGENDA_PADRAO.lembrete`) |
| P4 | Where "Configurações" lives in the menu | page `/agenda/configuracoes`, reached by the agenda gear and a link in Agente, "O que ele pode fazer" |
| P5 | The activation item in onboarding (montagem) | not built |
| P6 | What happens to the old "Agendar" goal (team confirms) now that the agenda switch decides | the agenda switch wins; the goal still drives the prompt when the agenda is off |
| P7 | Conversations already in "Agendado" when the agenda is turned off | the stage is archived; the conversations keep the key |
| P8 | Clicking an empty slot of the grid to book there | not built (button "Marcar horário") |
| P9 | Cancelled bookings on screen | not shown in the grid |
| P10 | The reminder text and whether the customer can answer "SAIR" | fixed text in `textoDoLembrete`; no opt-out |

## 7. What the automatic reminder still needs (not built, by instruction)

The time is computed and stored at booking (`lembrete_em`, rule `momentoDoLembrete`). Sending it
needs a scheduler, which is new infrastructure, so it was not built:
1. A cron (Vercel Cron or an n8n schedule; the n8n option touches production and needs the owner's
   explicit OK) calling a protected route every few minutes.
2. The route: read `agendamentos` where `lembrete_em <= now()` and `lembrete_enviado_em is null`
   (index exists), send `textoDoLembrete` over Evolution (`sendText`, the same pipe as the help
   notices, DDD 00 never), stamp `lembrete_enviado_em`. A new server-only secret for the cron call.
3. Owner decisions P10 and the active-messaging rules (daily cap, random interval, "responda SAIR").

## 8. Tests

Free (run on this branch): `e2e/agenda-lib.design.spec.ts` (grid modes, buffer, 3 nearest per
period, no day limit, notice escalation, validation, decisions, reminder time, config) and
`e2e/agenda.design.spec.ts` (weekly grid, mini calendar, detail, team booking inside and outside
business hours, settings with the buffer note, the 3 start options, the notice sentence, service
validation, menu without the item when off), plus `cursor`, `rolagem`, `casca.mobile`.
Needs the migration applied: routes against the database (overlap 409, stage "Agendado" created
and archived, RLS). Paid, only when named: `test:e2e:ia` and `test:e2e:n8n`, because the output
schema and the prompt changed for every tenant with the agenda on.

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

