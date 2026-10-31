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
   REPLACED the same day by a single daily run at 9h (section 7).

Settings (Configurações, section Agenda)
8. An "Agenda" item with an on/off checkbox and a short text. Checked opens the settings below.
   Off: the Agenda disappears from the menu, the funnel and the AI prompt. The activation also
   appears in onboarding as the same item.
9. ~~Days and hours = the existing business hours (single source).~~ Replaced the same day (owner:
   "Sim, horário próprio"): the agenda has its OWN days and hours, edited in its settings (per day
   open or closed, start and end) with a "Copiar o horário de atendimento" button. On first
   activation they come prefilled with a copy of the business hours. The AI's free times and the
   grid come from the agenda hours; the reminder still goes inside the business hours.
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

Adjustments after testing (28/10/2026): no counter on the day headers; the detail shows WHO and
WHEN first, then the service, with phone and "what it is about" as secondary and the actions in
the footer; "Marcar horário" searches existing contacts by name or phone on the server (the
Contatos search, `clientes_pagina`, debounced, 8 results) and falls back to a new contact;
service and date fields share size; a click anywhere on the date opens the calendar; the grid
fills the screen height.

## 4. How it works now (implemented)

```
Customer: "queria marcar"
processTurn (agenda on, agenda hours or business hours to copy, at least one service)
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

Grid of start times (`iniciosDoDia`): "hora" and "meia" walk the marks inside the agenda hours; after
a busy block the next start is end + buffer rounded up to the next mark. "seguido" chains: each
start is the previous end + buffer.

### 4b. Agent prompt (what changed on 28/10/2026)

- The "Agendar" goal left the form and the config (`GOALS`, `validateConfig` drops it from old
  configs and presets). The agenda switch, valid for the turn (agenda on, hours, at least one
  service), decides it: `personaDoTenant(client, agenda !== null)` and the bench pass
  `agendaAtiva` to `compilePersona`.
- Agenda off (guided and advanced): the base contract says "NUNCA use agendar"; a request for a
  time becomes `pausar` (help request). This also changes tenants in advanced mode whose text
  says "use agendar" (the base wins by PRECEDÊNCIA).
- Agenda on: OBJETIVO, FLUXO and OUTPUT send the model to the `### AGENDA` section; `agendar` only
  for a time the system offered; `preferencia_horario` is filled by the system. The
  `### CALENDÁRIO` block stops listing hours per period (`calendarioBlock(..., semOfertas)`),
  so the model has no list of its own to offer from.
- This changes the prompt base for every tenant: `npm run test:e2e:ia` (paid) before any deploy.

## 5. Data model (`supabase/migrations/20261028193508_agenda_propria.sql`, NOT applied)

- `clients.agenda_config jsonb` (null = off): `{ ativa, antecedenciaMin, intervaloMin, inicio,
  lembrete, horario }`, normalized by `normalizarConfigDaAgenda`. `horario` = the agenda's OWN days and
  hours (same shape as the business hours); null = a copy of the business hours (`horarioDaAgenda`).
- `agenda_servicos` (name, `duracao_min` 5..480, `ativo`, `ordem`).
- `agenda_bloqueios` (start, end, reason).
- `agendamentos` (phone, name, service snapshot, start, end, status, origin, `resumo` = what it is
  about, `lembrete_enviado_em` (claimed by the 9h run), cancel fields, `remarcado_de`), exclusion constraint
  against overlap, partial index on pending reminders.
- `agenda_etapa_do_funil(p_client, p_ativa)`: on creates (or unarchives) the canonical "Agendado"
  stage right after "Aguardando atendimento"; off archives it. Called by `PUT /api/agenda/config`.
- RLS on, members read, writes only by server routes and the brain. `agendamentos` in the realtime
  publication with `REPLICA IDENTITY FULL`. All three tables in `TABELAS_DO_CLIENTE`.

## 6. Final decisions of 28/10/2026 (owner, item by item) and what is still open

Decided and built:
| # | Decision | Where |
|---|---|---|
| A | National holidays (fixed and Good Friday, computed, no API) are marked on the grid and blocked for the AI; the owner releases a specific one in the settings | `lib/feriados.ts`, `feriadoQueFecha`, `agenda_config.feriadosLiberados` |
| B | Block one or more whole days with a reason (local holiday, recess, vacation); the AI offers nothing and the grid shows the block on every day it covers | "Bloquear" dialog, "Dias inteiros" |
| C | The contact's bookings (future, past, cancelled) on the contact card, newest first, 10 at a time; titled "Horários marcados" (mixed audience) | `components/ContactAgendamentos.tsx` |
| 1 | The AI reads the periods from the agenda hours (13h to 17h means afternoon only); morning before 12h, afternoon 12h to 18h, evening from 18h | `periodosDoDia`, `resumoDosPeriodos`, `textoDaConsulta` |
| 2 | Reminder on by default | `AGENDA_PADRAO.lembrete` |
| 3 | Settings: gear on the Agenda plus an entry in the agent | `/agenda/configuracoes` |
| 4 | The old "Agendar" goal is gone; the agenda switch drives the prompt (see section 4b) | `lib/agent-prompt.ts` |
| 5 | Turning the agenda off sends "Agendado" contacts back to the previous column and archives it | `agenda_etapa_do_funil` (migration file) |
| 6 | Clicking an empty slot opens "Marcar horário" with day and time filled | grid |
| 7 | Cancelled bookings stay off the grid and live on the contact card | grid, card |
| 9 | Random 20 to 60 s between messages of the same company; companies in parallel | `REGRAS_DO_LEMBRETE`, `/api/agenda/lembretes` |
| 10 | A contact who never wrote still gets the reminder | no check |
| 11 | Expired trial or late payment: no reminder | `accessState` in the route |
| 12 | A failed send raises an icon in the owner's central (like open help requests) and is retried by the next run while the booking is still ahead | `lembrete_falhou_em`, `admin_lembretes_com_falha` |
| R1 | No daily cap (the volume is the number of bookings) | `tetoDiario: null` |
| H1 | Carnaval and Corpus Christi ("ponto facultativo") do NOT block (owner: "Não bloqueiam"): marked on the grid and the settings list; a business that closes uses the whole-day block | `lib/feriados.ts` (`tipo: "facultativo"`) |
| P5 | The agenda in onboarding: the SAME "Agenda" item (checkbox and short text, no "você trabalha com horário marcado?") in step 2 ("O que ele sabe"); checked, it asks only for the services; the rest comes from `AGENDA_PADRAO` and the agenda hours are the copy of the business hours. Saved on the step 2 Continuar, right after the agent (so the hours are in the database for the copy) | `components/agenda/CamposDaAgenda.tsx` (shared with the settings), `MontagemWizard` |

Still open:
| # | Question | What the code does now |
|---|---|---|
| L2 | Vercel function limit | `maxDuration = 300` assumes Fluid Compute (default on new projects); check the project settings, otherwise lower it to 60 and `ORCAMENTO_MS` to 50 s |
| B1 | The bench (`/api/playground`) reads only whether the agenda is on, not whether it has services and hours | the live turn checks all three |

Reminder text, chosen by the owner on 28/10/2026 ("Versão 1"; fixed, no AI, no "SAIR"), in
`textoDoLembrete`: "Oi, {nome}! Seu horário de {serviço} na {empresa} está reservado para você
{quando}. Pode confirmar respondendo SIM? Se precisar mudar, é só me dizer um novo dia que eu
remarco por aqui." {nome} is the contact's first name ("Oi!" without a name); {quando} is "amanhã,
quinta, 29/10, às 10h30". The "SIM" is handled by the confirmation in section 7b.

## 7. Automatic reminder (owner decision of 28/10/2026, "9h"; built, not turned on)

Replaces "24h before, inside business hours", pending P2 and the open scheduler question.
1. ONE run per day at 9h America/Sao_Paulo, the same for every company (it does not follow each
   company's opening time).
2. Scheduler: Vercel Cron, `vercel.json` `"0 12 * * *"` (UTC; 9h in São Paulo), calling
   `GET /api/agenda/lembretes`. Protected by the env var `CRON_SECRET`: Vercel sends
   `Authorization: Bearer <CRON_SECRET>` when the variable exists in the project (Vercel, Settings,
   Environment Variables, Production); without it the route answers 401 and sends nothing. The owner
   sets the value; none is written anywhere. Nothing in n8n. On the Hobby plan the trigger may fire
   up to 59 min late (9h00 to 9h59), accepted.
3. Per company with the agenda on and the reminder on, only on a day the company OPENS (business
   hours): the confirmed bookings from tomorrow up to and including the next open day
   (`janelaDoLembrete`; closed Saturday and Sunday: on Friday the run covers Saturday, Sunday and
   Monday). A booking created after the run that would cover it gets no reminder (the confirmation
   when booking is enough). Holidays do not count: the product has no holiday calendar.
4. Sending: `lib/envio-ativo.ts` over the existing Evolution layer (`sendText`), fixed text
   (`textoDoLembrete`), no AI. Idempotent: each booking is claimed (`lembrete_enviado_em` from null
   to now, conditional) before sending and released if Evolution refuses, so two runs never send
   twice. Test phones (DDD 00) and the notices number are skipped.
5. `lib/envio-ativo.ts` is the single place for active messages, designed for Follow-up to reuse
   (`enviarMensagemAtiva`, `pausaEntreEnvios`, `RegrasDoEnvioAtivo`).
6. Screen text: "Lembrete automático pelo WhatsApp, às 9h do dia anterior ao horário marcado (no
   último dia em que a loja abre antes dele)." The booking detail shows the day of the reminder,
   "enviado" once sent, or "sem lembrete".

Decided on 28/10/2026 (was R1 to R6): no daily cap; 20 to 60 s between messages of the same
company, companies in parallel; a run that does not fit in the function time stops with a margin
and calls itself (`?continuacao=1`), starting every queue with a full pause so the gap never
drops below 20 s; contacts who never wrote get it; expired trial or late payment get none; a
refused send is recorded (`lembrete_falhou_em`, icon in the central) and retried while the
booking is ahead. The route accepts `Authorization: Bearer <CRON_SECRET>`, the header Vercel Cron
sends by itself once the env var exists.

### 7b. Confirmation after the reminder (owner, 28/10/2026, "Pode mandar")

- `agendamentos.confirmado_em` (migration file only). The `### AGENDA` block marks each booking of
  the person: "lembrete enviado, aguardando confirmação" or "confirmado pelo contato", and only
  while one is waiting it tells the model: on "sim" (or equivalent) use `agenda.acao "confirmar"`
  with the booking code and answer short ("Perfeito, te espero amanhã às 10h30!"). The code
  (`decidirAgenda`, `aplicarAgenda`) records `confirmado_em`; reschedule and cancel keep their
  flow; any other message is answered normally, aware of the reminder.
- Confirmed shows on the grid card (check), in the booking detail ("Presença") and on the
  contact card ("Confirmado").
- Done (owner approved, "Pode mandar"): the reminder route inserts the sent text into
  `chat_messages` with `message_type = 'lembrete'`. The team sees it in the conversation with the
  label "Lembrete automático" (`components/thread/bolhas.ts`, `BubbleView`) and the AI has it in
  the history (`processTurn` reads `chat_messages`; nothing in n8n). `lembrete` is neither an AI
  nor a team reply: `lib/mensagem.ts` (`ehLembrete`, `respostaDaIa`), the SQL copies in the NEW
  migration `20261028193556_lembrete_nao_e_resposta.sql` (`painel_janelas`, `painel_series`,
  `painel_verbatim`, not applied), `docs/instrumentacao-uso.md` and the mass of
  `e2e/painel-agregado.serial.spec.ts` (which proves TS and SQL agree once the migration is applied).

## 7.1 Week grid redrawn (owner's review of 31/10/2026; branch `claude/agenda-grade-semana`)

The grid showed only the agenda's hours (OBS: 13h to 18h), so it ended mid-screen and the "now" line
(about 20h) sat loose under it. Now: the 24 hours, always at the same height; out-of-hours with the SAME
look as closed days (Friday after 18h at OBS looks like the weekend); the "now" line always inside the
grid; it opens scrolled to the middle of the agenda's hours, or to now when now is inside them. Works with
one or two hours a day and a closed weekday. Booking rules unchanged. Preview:
`/design/agenda?horario=obs&agora=2026-10-30T23:05:00Z` and `?horario=curto`. Waiting for the owner's
review before `main`.

## 8. Tests

Final test plan for the deploy approval (in this order):

| Step | What | Cost | State |
|---|---|---|---|
| 1 | `npm run typecheck`, `npm run lint`, `npm run checar`, `npm run build` | free | green on this branch |
| 2 | `npm run test:e2e -- --project=sem-login` and `--project=mobile` (agenda rules, holidays, periods, reminder days and text, confirmation, prompt block, grid, settings, contact card, "who replied" with `lembrete`) | free | green except the known `central-clientes` meter failure, which predates the agenda |
| 3 | Owner applies both migrations (`20261028193508_agenda_propria.sql`, `20261028193556_lembrete_nao_e_resposta.sql`) and regenerates `lib/database.types.ts` (written by hand here) | free | pending |
| 4 | `npm run test:e2e:login` (real DB, OBS tenant, includes `painel-agregado.serial` with the new `lembrete` rows); run it alone, nobody else on the test tenant | free | pending (needs step 3) |
| 5 | Manual on Loja Teste: turn the agenda on, book, reschedule, cancel and block from `/agenda`; the "Agendado" column appears and goes back when turned off | free | pending |
| 6 | `npm run test:e2e:ia` (12 real-brain traps): the prompt base changed for every tenant (agenda contract, the "Agendar" goal gone) | paid | pending, only when named |
| 7 | `npm run test:e2e:n8n` (end-to-end attendance through production n8n) before asking the owner to test attendance | paid | pending, only when named |
| 8 | Reminder: owner creates `CRON_SECRET` on Vercel, confirms the function limit (Fluid Compute, `maxDuration`), then a manual `GET /api/agenda/lembretes` with the header on Loja Teste with a booking for tomorrow | free | pending |

Not covered by any automated test: the real Evolution send and the self-chaining across runs
(steps 5 and 8 are manual).
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

