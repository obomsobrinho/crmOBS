# Plan: Agenda (real booking through Google Calendar)

**Status: PROPOSED, waiting for the owner's decisions (section "Decisions for the owner").**
Written on 28/10/2026, overnight, without the owner. Nothing here is built for real: no Google
credentials, no migration, no n8n change, no production change. The only code is a UI prototype
with fake data on `/design/agenda` and `/design/agenda/configurar`.

Roadmap item: P2 #10 in `docs/proximos-passos.md` ("Agenda com Google Calendar"), and the section
"Agenda (promovida a próximo passo, saiu do 'não construir')". Draft ADR:
`docs/adr/2026-10-28-agenda-google-calendar-slots-in-prompt.md` (Proposed).

## 1. The problem in one paragraph

Today "Agendar" is a promise the product does not keep. The `action: "agendar"` path captures a day
and a time in the customer's words ("terça às 15h"), records it in `conversation_qualifications`,
moves the conversation to `aguardando_humano`, and n8n's "Notifica grupo" tells the team, who then
has to open their own calendar, check, and write back. Nothing checks if the time is free, nothing
creates an event, nothing reminds anyone. Marketing has avoided the word "agenda" for exactly this
reason (`proximos-passos.md`, "Correções de rumo": "Prometer 'agenda' para clínica e salão é a
promessa mais perigosa possível aqui"). Every direct competitor lists scheduling as a table item
(see section 3), and 4 of the 5 testers' segments (dentistry, 2 salons, engineering visits) book
time.

## 2. What already exists (reuse, no new path)

| Piece | Where | Role in the Agenda |
|---|---|---|
| Goal `agendar` | `lib/agent-prompt.ts` (`GOALS`, `Goal`), UI label "Agendar" | Stays the switch. With the Agenda connected, its meaning changes from "team confirms" to "books for real" |
| `action: "agendar"` + `preferencia_horario` | `lib/agent.ts` (`OUTPUT_SCHEMA`), `lib/agent-turn.ts` | Stays the contract n8n reads. A new field carries the chosen slot (section 6) |
| `### CALENDÁRIO` block | `lib/horarios.ts` (`calendarioBlock`) | Precedent for the core idea: "the model talks, the code does the math". Free slots join it the same way |
| Business hours | `agent_config.hours`, read only via `horarioCadastrado` / `horarioDaConfig` | Upper bound of every slot. No second hours field |
| Notice destination | `clients.notify_group_jid` (shown only with "Agendar" checked) | Where the booking notice goes. Same single destination |
| "Notifica grupo" (n8n) | `n8n/obs-atendimento.json` | Already notices `agendar`. MVP keeps it (section 6.5), so no n8n change |
| Booking is not a help request | `docs/adr/2026-09-30-schedule-does-not-open-help-request.md` | Keeps holding: a booking never opens a `handoffs` row |
| Funnel move | `lib/pipeline.ts` (`nextIaStage`: `agendar` -> `aguardando_humano`) | Decision D11: a confirmed booking may deserve another stage |
| Timezone | `lib/fuso.ts` (`FUSO`, formatters) | Every slot and event in America/Sao_Paulo |
| Test conversation DDD 00 | `telefoneImpossivel` | Never creates a real event nor a notice |
| Segment language | `lib/agent-presets.ts` | "consulta", "corte", "visita técnica" come from the preset, never the base or a fixed screen text |

## 3. Market: how WhatsApp AI attendants handle scheduling

Researched 28/10/2026. Only facts found on the vendors' own pages or help centers are stated as
facts; what the pages do not say is marked "not stated".

| Product | Calendar | Confirmation / reminder | Reschedule / cancel | Price | Source |
|---|---|---|---|---|---|
| **atenda.pt** (PT, AI receptionist) | "integra com a sua agenda e CRM", sees free slots in real time and books alone; which calendars: not stated | automatic reminder before the time | AI reschedules and cancels without staff; cancelled slots offered to a waiting list | one plan, EUR 89/month, all included | atenda.pt, atenda.pt/precos |
| **ZapResponder** (BR, floor anchor) | "Agendamentos" = scheduled messages; Google Calendar: not stated | scheduled messages "no momento certo" | not stated | Starter R$ 132/month (lists "Agendamento de reuniões" as NOT included), Premium R$ 199, Business R$ 422, quarterly billing, 7-day trial | ia.zapresponder.com.br |
| **HelenaCRM** (BR, ceiling anchor, white label) | no native agenda nor Google Calendar on the page; partners connect "agendas, ERPs e planilhas via n8n, Make ou API" | "Mensagens agendadas"; clinic example "Agenda que confirma, remarca e lembra o paciente sozinha" | via the partner's integration | not public (partner licence) | helenacrm.com |
| **Agent Zappy** | not stated (page talks about orders and follow-up) | not stated | not stated | not stated | agentzappy.com, wordpress.org/plugins/agent-zappy |
| **ChatGDS + GestãoDS** (clinic software) | own clinic agenda | confirmation and reminder messages through **Meta-approved templates** (Official API), "hours in advance" configurable, per doctor, filter by status and service | not stated in the article | not stated | intercom.help/chatgds (article 14744352) |
| **Clínica nas Nuvens** (clinic software) | own agenda | manual: "Agendas a Confirmar" list with a WhatsApp icon per patient; recommends their paid "Nuvem AI" for automatic confirmation | status change by staff; waiting list fills freed slots | not stated | intercom.help/clinicanasnuvens (article 8387018) |
| DIY stacks (n8n + Evolution + Google Calendar, sold on Hotmart/Gumroad, e.g. "Lua IA PRO" R$ 89/month) | Google Calendar | confirmation in the chat, sometimes a reminder | varies | R$ 89/month or free template | hotmart.com, gumroad.com |

What this says:

1. **Booking is table stakes; "the AI books alone in a real calendar" is the selling line** (atenda.pt
   leads with it). Our "agendar por alto" (day and time in words, team confirms) is what clinics
   already do with a receptionist; it does not beat anyone.
2. **The serious clinic tools send reminders through Official API templates**, not over QR. That
   confirms the warning already written in `proximos-passos.md`: an automatic reminder over QR is
   active messaging, and the product's own rule limits it (recent conversation only, daily cap,
   random interval, "responda SAIR").
3. **Nobody in the BR WhatsApp-CRM tier shows a clean Google Calendar integration on their page.**
   ZapResponder's "Agendamentos" is scheduled messages; Helena pushes it to integrators. A real,
   self-serve "Conectar Google Agenda" in two clicks is a differentiator in our tier, not catch-up.
4. **Waiting list** (atenda.pt, Clínica nas Nuvens) is a nice later idea, not MVP.

Adopt: AI books in a real calendar and says so; reschedule and cancel in the same chat; the
owner's calendar stays the source of truth (Google), so no own agenda.
Do better: two-click connection with no integrator; booking notice to the team with a link;
honest copy (no "nunca mais falte" promise without reminders).
Avoid: own agenda screen with drag and drop (rule "never build a full own agenda"); reminder over
QR outside the active-messaging rules; ZapResponder's confusion of "agendamento" with "scheduled
message".

Sources: [atenda.pt](https://atenda.pt), [atenda.pt/precos](https://atenda.pt/precos),
[ZapResponder](https://ia.zapresponder.com.br/), [HelenaCRM](https://helenacrm.com/),
[Agent Zappy plugin](https://wordpress.org/plugins/agent-zappy/),
[ChatGDS agenda automations](https://intercom.help/chatgds/en/articles/14744352-como-configurar-as-automacoes-da-agenda),
[Clínica nas Nuvens, agendas a confirmar](https://intercom.help/clinicanasnuvens/pt-BR/articles/8387018-agendas-a-confirmar-o-que-fazer),
[Lua IA PRO](https://hotmart.com/pt-br/marketplace/produtos/lua-ia-pro-sua-nova-secretaria-inteligente-por-r-89-mes/H101237678T),
[Google Calendar API scopes](https://developers.google.com/calendar/api/auth),
[Google Calendar API quotas](https://developers.google.com/calendar/api/guides/quota),
[Google unverified apps (100-user cap)](https://support.google.com/cloud/answer/7454865).

## 4. MVP scope (the smallest thing that turns "agendar" into a real booking)

**In:**
- One Google account and **one calendar per tenant** (the roadmap already says "um calendário por
  conta"). One "resource" (one person or one room): no per-professional calendars.
- Connect / disconnect Google in `/agente`, inside "O que ele pode fazer", under "Agendar"
  (prototype: `/design/agenda/configurar`). Owner only.
- A short list of **services with a duration** (e.g. "Avaliação, 30 min"). One default service when
  the owner lists none (decision D4).
- Slot rules: business hours (existing), minimum notice, how far ahead, buffer between bookings
  (decisions D5 to D7).
- The AI offers free slots computed by the code, the customer picks, the code books the event in
  Google, the AI confirms in the chat.
- The team is noticed on WhatsApp (existing "Notifica grupo", richer text).
- A read-only **Agenda list** in the CRM: upcoming bookings made through the CRM, 10 per page, with
  "Abrir no Google Agenda" (prototype: `/design/agenda`). Not a calendar grid.
- Booking shown on the contact's ficha (`/contatos/[id]`) and in the conversation header.

**Out of the MVP (later, in this order):**
1. Automatic reminder to the customer (D9; needs the active-messaging rules or the Official API).
2. Several calendars / professionals per tenant (salons need it; D13).
3. Google push notifications (`events.watch`) to learn instantly when the owner deletes an event in
   Google. MVP reconciles on read (section 6.6).
4. Waiting list.
5. Microsoft / Outlook calendar.

## 5. Flow, end to end

```
Customer: "queria marcar uma avaliação"
  |
  v
processTurn (lib/agent-turn.ts), tenant has Agenda connected and goal agendar
  1. freeBusy(Google) for the next N days            (cached 60 s per tenant)
  2. slotsLivres() in pure lib/agenda.ts             (hours ∩ not busy, duration, buffer, notice)
  3. ### HORÁRIOS LIVRES block after ### CALENDÁRIO  (does not touch the cached persona prefix)
  4. runAgent: one model call, same strict JSON + new field `horario` (id from the list or "")
  |
  v
AI: "Tenho quinta 30/10 às 9h, 10h30 ou 14h. Qual fica melhor?"     action none
Customer: "10h30"
  |
  v
AI output: action agendar, horario "S2", messages ["Fechado! Quinta, 30/10, às 10h30. ..."]
processTurn, BEFORE returning to n8n:
  5. validate: "S2" is in the list offered THIS turn (never trust a free-typed time)
  6. reserve: insert appointments row (unique per tenant + start, status confirmado)
  7. re-check freeBusy for that one slot, then events.insert in Google
     (event id derived from the appointment id: an n8n retry cannot create two events)
  8a. ok   -> return the AI's messages; preferencia_horario = "qui 30/10 às 10h30 (na agenda)"
  8b. fail -> delete the reservation, REPLACE the messages with a code-written text offering the
             next free slots ("Esse horário acabou de ser preenchido. Posso quinta às 14h ou sexta
             às 9h?"), action none
  |
  v
n8n sends the reply (unchanged) and "Notifica grupo" notices the team (unchanged node)
  |
  v
Event is in the owner's Google Calendar (and phone). Agenda list and contact ficha show it.
  |
  v
Reminder: NOT automatic in the MVP (D9). Google's own notification reminds the owner.
```

Reschedule and cancel (D10): the turn also receives `### AGENDAMENTOS DESTA PESSOA` (future
bookings of this phone, from `appointments`). "Preciso remarcar" -> the AI offers new slots ->
same steps 5 to 8 with `events.patch` on the existing event. "Quero cancelar" -> AI confirms once
-> `events.delete` (or status cancelled), row marked `cancelado`, team noticed.

Without the Agenda connected, nothing changes: today's `agendar` (day and time in words, team
confirms) keeps working exactly as now. This is also the fallback when Google fails (token
revoked, Google down): the turn falls back to today's behavior and the team is noticed once that
the connection dropped.

## 6. Technical design

### 6.1 The architectural choice: slots in the prompt, booking in code (recommended)

The roadmap note (26/08) says the AI needs **function calling** in `/api/agent`. There is a
cheaper and safer way that fits what the brain already does, so this is decision D1:

| | A. Slots in the prompt, booking in code (recommended) | B. Function calling (tools) |
|---|---|---|
| Model calls per turn | 1 (as today) | 2 to 3 on booking turns (list, then book, then reply) |
| Contract with n8n | same strict JSON, one new field | new loop inside `runAgent`, strict JSON only on the last call |
| Who does slot math | pure code (`lib/agenda.ts`), testable for free | the model reads raw busy times, or a tool returns slots (then it is A with extra calls) |
| Prompt cache | preserved (slots go after AGORA/CALENDÁRIO, like today) | preserved, but more uncached tokens per booking |
| Can the model book a time nobody offered? | no: code accepts only an id from this turn's list | yes, unless the tool validates (same validation as A) |
| Latency on WhatsApp | +1 freeBusy call (~200 ms, cached) | +1 to 2 model round trips (seconds) |
| Precedent | `calendarioBlock` (05/10/2026: the model failed at date math until the code did it) | none in the repo |

A has one weakness: the reply ("Fechado!") is written before the event exists. Step 8b covers it:
when the booking fails, the code discards the AI's text and writes the answer itself. B becomes
worth it only when the agent needs many different tools (orders, stock, payment), which is not on
the roadmap.

### 6.2 Google scopes (narrowest set)

Recommended: **`calendar.app.created` + `calendar.freebusy`.**
- `calendar.app.created`: "Make secondary Google calendars, and see, create, change, and delete
  events on them". The CRM creates ONE calendar named after the company (e.g. "Ótica Vision:
  agendamentos") inside the owner's Google account and writes only there. The owner sees it in the
  Google Calendar app, colored, next to their own calendars.
- `calendar.freebusy`: "View your availability in your calendars". The CRM sees only busy/free
  blocks of the owner's calendars, **never the titles or guests of their personal events**.
  This is the strongest privacy line we can say on the consent screen and in sales.

Alternative: `calendar.events` ("View and edit events on all your calendars") writes into the
owner's main calendar. Simpler mental model for the owner, but it asks for access to every
event's content, which is more than we need and harder to justify in Google's review.

Both sets are classified by Google, not by us: the console shows "sensitive" or "restricted" next
to each scope when the owner adds it (third-party guides list Calendar scopes as sensitive, which
means app verification without the paid security assessment; confirm in the console). Until the
app is verified, Google shows an "unverified app" screen and caps the project at **100 users in
total, forever** (Google help 7454865).

### 6.3 Data model (proposed, NOT applied)

```sql
-- One Google connection per tenant. Secrets live apart (agenda_tokens).
create table public.agendas (
  client_id        uuid primary key references public.clients(id) on delete cascade,
  provider         text not null default 'google',
  google_email     text,                 -- shown on screen ("Conectado como ...")
  calendar_id      text,                 -- the secondary calendar the CRM created
  calendar_tz      text,                 -- the calendar's own timezone, to warn when not FUSO
  connected_at     timestamptz,
  connected_by     uuid references auth.users(id),
  disconnected_at  timestamptz,
  last_error       text,                 -- "token revogado", shown to the owner
  last_error_at    timestamptz,
  config           jsonb not null default '{}'::jsonb  -- services, notice, horizon, buffer (lib/agenda.ts validates)
);
-- RLS on, tenant members read, only the owner (dono) writes `config`; no grant to anon.

-- Refresh token, encrypted by the app (key in a server-only env var). service_role only:
-- no RLS policy for authenticated, no grant. Never selected into a page.
create table public.agenda_tokens (
  client_id      uuid primary key references public.clients(id) on delete cascade,
  refresh_token  bytea not null,
  scopes         text[] not null,
  updated_at     timestamptz not null default now()
);

-- The CRM's record of what IT booked. Google stays the truth for availability.
create table public.appointments (
  id               bigint generated always as identity primary key,
  client_id        uuid not null references public.clients(id) on delete cascade,
  phone            text not null,          -- links to dados_cliente.telefone in the same tenant (no FK, like chat_messages)
  service_key      text,                   -- from agendas.config.services; null = default service
  service_label    text,                   -- snapshot, the service may be renamed later
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           text not null check (status in ('confirmado','cancelado','remarcado')),
  google_event_id  text,
  created_by       text not null check (created_by in ('ia','humano')),
  created_at       timestamptz not null default now(),
  cancelled_at     timestamptz,
  cancelled_by     text check (cancelled_by in ('cliente','time','google'))
);
-- The double-booking lock for a one-calendar tenant:
create unique index appointments_one_per_slot
  on public.appointments (client_id, starts_at) where status = 'confirmado';
create index appointments_upcoming on public.appointments (client_id, starts_at);
```

Notes:
- `appointments` is written only by the server (`processTurn`, `/api/agenda/*` with service_role),
  same rule as the conversation tables. The browser reads it with RLS per tenant.
- Realtime: add `appointments` to `supabase_realtime` so the Agenda list updates ONE row on insert
  or status change (`useCanalTenant`). Add it in the same migration, or the handler is silently
  dead (`realtime.md`).
- `TABELAS_DO_CLIENTE` (`lib/admin-purga.ts`) must list the three new tables, in delete order,
  before "Apagar de vez" works for a tenant that used the Agenda. Disconnect also revokes the
  token at Google.
- The purge and the LGPD export of a contact (P2 #9) include `appointments` by phone.

### 6.4 Pure module `lib/agenda.ts` (one source of truth)

No I/O. Used by `processTurn`, the bench (`dryRun`), the Agenda list and the config screen:
- `normalizeAgendaConfig(raw)`: services, default duration, minimum notice, horizon, buffer, step.
- `slotsLivres({ now, hours, busy, config, service })`: free slots, in FUSO, starting on the
  step grid, inside business hours, not overlapping busy blocks plus buffer, after the minimum
  notice, before the horizon. Expedient that crosses midnight is handled like `calendarioBlock`.
- `blocoHorariosLivres(slots)`: the `### HORÁRIOS LIVRES` text with short ids (`S1`, `S2`...),
  capped (e.g. 3 per period, 3 days) so the prompt stays small.
- `slotDoId(id, offered)`: validation of the model's choice.
- `textoSemHorario(next)`: the code-written reply of step 8b.
- `textoDoEvento(...)`: event title and description (D12 decides what goes in).

### 6.5 Notices

MVP keeps n8n's "Notifica grupo" as the only booking notice, fed by `preferencia_horario` (now
"qui 30/10 às 10h30 (na agenda)") and `summary`. Zero n8n change, no double notice. A later
round can move this notice into `processTurn` (`lib/avisos.ts`, like help requests) to add an
"Abrir" link; that needs an n8n change with the owner's explicit confirmation (`validateOnly`
first), so it is not in the MVP.

### 6.6 Keeping the CRM and Google in step (MVP)

- Availability is always read live from Google (freeBusy), so an event the owner adds by hand in
  Google is respected immediately.
- An event the owner DELETES in Google stays `confirmado` in `appointments` until someone looks:
  the Agenda list and the reschedule/cancel path fetch the event by id and mark `cancelado`
  (`cancelled_by = 'google'`) when Google says it is gone. Push notifications are phase 2.
- Token revoked (owner removed access in Google): mark `last_error`, fall back to today's
  `agendar`, notice the team once, show a banner in `/agente` ("A agenda desconectou").

### 6.7 Routes (proposed)

- `GET /api/agenda/google/start`: owner only, builds the consent URL (state signed with the
  tenant id, PKCE).
- `GET /api/agenda/google/callback`: exchanges the code, stores the encrypted refresh token,
  creates the secondary calendar, redirects to `/agente`.
- `POST /api/agenda/disconnect`: owner only, revokes at Google, clears the token.
- `PATCH /api/clients/[id]/agenda-config`: owner only, validates with `normalizeAgendaConfig`.
- `POST /api/agenda/[id]/cancel`: team cancels a booking from the CRM (status + Google delete).
All enforce on the server (page guard, route check, RLS); hiding a button is not enforcement.

## 7. What Franck must set up in Google (himself, never in chat)

Use the OBS Google account that should own the integration long term (not a personal one that
may change).

1. **Google Cloud Console** (console.cloud.google.com): create a project, e.g. "Atenda Agenda".
2. **APIs & Services > Library**: enable **Google Calendar API**.
3. **Google Auth Platform > Branding** (OAuth consent screen): User type **External**; app name
   (the product name in `lib/brand.ts`); support email; logo; **homepage URL**, **privacy policy
   URL** and **terms URL** on the production domain; **authorized domain** = the production domain.
   The privacy policy must say what Google data is used for (free/busy and the app's own calendar,
   only to book) and that it follows Google's "Limited Use" policy. (The app has no privacy policy
   page today: it must exist before verification.)
4. **Verify the domain** in Google Search Console with the same account.
5. **Data access**: add the scopes chosen in D2 (recommended `calendar.app.created` and
   `calendar.freebusy`). Note what the console says next to each (sensitive or restricted).
6. **Audience**: keep **Testing**; add test users (his Gmail and the Loja Teste account). In
   Testing, refresh tokens expire after 7 days, which is fine for development only.
7. **Clients > Create client > Web application**. Authorized redirect URIs:
   `http://localhost:3001/api/agenda/google/callback` and
   `https://<production domain>/api/agenda/google/callback`.
8. Put **Client ID** and **Client secret** in Vercel env vars and in `.env.local` himself, plus a
   new random **token encryption key**. Names to be added to `data.md` as server-only:
   `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `AGENDA_TOKEN_KEY` (proposed names).
9. **Before the first customer outside the test list**: publish the app and **submit for
   verification** (scope justification per scope, a demo video of the consent and of a booking).
   Google's own help says verification "might require several months"; others report days to 7+
   weeks. Start it as soon as the MVP works on Loja Teste, because the 100-user cap counts every
   account that ever consents and cannot be reset.

## 8. Costs

| Item | Cost | Note |
|---|---|---|
| Google Calendar API | free under quota | Defaults (projects created after 01/05/2026): 10,000 requests/min per project, 600/min per user, 1,000,000/day billing threshold. Google says charges for exceeding are "planned later in 2026" with 90 days notice. One booking turn = ~2 to 3 requests |
| Google OAuth verification (sensitive scopes) | free | Only restricted scopes need the paid security assessment |
| AI tokens | small, per turn with Agenda on | `### HORÁRIOS LIVRES` adds roughly 150 to 300 input tokens per turn (uncached, after AGORA). At `gpt-5.4-mini` input US$ 0.75 per million (`lib/custo-ia.ts`), 1,000 turns cost about US$ 0.11 to 0.23 more. Counts toward the monthly cap like any token |
| Automatic reminders (later) | QR: free but risky; Official API: Meta charges per message (utility category) since 01/10/2026 | Variable cost, never zero in migration math |
| Dev time (estimate) | MVP ~6 to 9 working days | config + OAuth 2, slots + prompt + booking 3, list + ficha 1, tests 1 to 2, review 1 |

## 9. Risks and how the design answers them

| Risk | Answer |
|---|---|
| Double booking (two customers, same slot, same second) | Unique index `appointments_one_per_slot` reserves before Google; re-check freeBusy right before `events.insert`; event id derived from the row id so an n8n retry is idempotent |
| Owner books by hand in Google at the same moment | freeBusy re-check narrows the window to milliseconds; residual risk accepted, team notice lets a human fix it |
| AI "books" a time it never offered or invents one | Code accepts only an id from this turn's list; anything else becomes action none and the code asks again |
| Timezone | All math in FUSO (`lib/fuso.ts`); events created with explicit `timeZone`; calendar timezone stored and a warning shown in config when it is not America/Sao_Paulo. Tenants in other Brazilian zones are a product-wide limitation already, not new |
| Duration per service | MVP: short service list with duration; default service when none; the AI asks which service only when the tenant listed more than one |
| Business hours | Slots never leave `horarioCadastrado`. No hours registered = Agenda cannot be turned on (config screen says why) |
| Lunch break, holidays, days off | The owner blocks them in Google (busy), which freeBusy respects. No own "exceptions" screen (that is building an agenda) |
| Token revoked / Google down | Fallback to today's `agendar`, one notice to the team, banner in `/agente` |
| Personal or health data in the event | Event text minimal by default (D12); the CRM never reads the owner's personal events (freebusy scope) |
| Prompt bloat | Slots capped per period and per day; block only when the goal is `agendar` and the Agenda is connected |
| 100-user cap before verification | Start verification right after the MVP works on Loja Teste (section 7, step 9) |
| Mixed audience | No fixed text says "consulta", "paciente" or "agendamento" assumptions: base texts say "horário"; the service names and preset carry segment words |
| Marketing over-promise | Copy says "a IA marca na sua Google Agenda". No "acabe com as faltas" until reminders exist |

## 10. Test plan

| What | How | Costs money? |
|---|---|---|
| `lib/agenda.ts` slot math (hours, midnight crossing, notice, horizon, buffer, durations, busy overlaps, "already passed today") | pure specs in the `sem-login` project, like `horarios.design.spec.ts` | no |
| Prompt block text and slot ids, `slotDoId` validation, step 8b replacement | pure specs | no |
| Agenda list and config screens | `/design/agenda*` specs in `sem-login` + `mobile` (390px) | no |
| OAuth connect / disconnect | manual on localhost with a Testing-mode Google project and a test Gmail | no |
| Booking against a real test calendar (insert, patch, delete, idempotent retry, double-booking race) | a `logado-serial`-style spec on Loja Teste with a dedicated test Google account; never the OBS calendar | no (Google is free), but needs the test account set up |
| The AI offers only listed slots, picks the id, does not book with only a period, reschedules, cancels | new cases in `npm run test:e2e:ia` (paid traps, only when named) | **yes** |
| End to end through production n8n | `npm run test:e2e:n8n` before asking the owner to test (attendance rule) | **yes** |
| Regression: tenants without the Agenda keep today's `agendar` | existing IA and n8n suites | **yes** (when named) |

## 11. Decisions for the owner

Each one is a business choice. My recommendation is marked, not decided.

**D1. Architecture: slots in the prompt and booking in code, or function calling?**
- A. Slots computed by code, one model call, code books (section 6.1). **Recommended.**
- B. Function calling, as the 26/08 note assumed.

**D2. Where the bookings go in the owner's Google account?**
- A. A separate calendar created by the CRM ("Empresa: agendamentos"), reading only free/busy of
  the others. **Recommended** (we never see personal events; easier Google review).
- B. Straight into the owner's main calendar (needs access to all events).

**D3. Does the AI confirm the booking by itself, or does the team approve each one?**
- A. AI confirms on the spot when the slot is free in Google. **Recommended** (it is the selling
  point; the slot came from the owner's own calendar).
- B. AI books as "a confirmar" and the team confirms in the CRM (the customer waits).
- C. Per tenant switch, default A.

**D4. Services and duration?**
- A. Short list of services with duration; when empty, one default duration. **Recommended.**
- B. One fixed duration per tenant (simpler, wrong for salons and dentists).

**D5. Minimum notice (earliest bookable slot)?**
- A. Configurable, default 2 hours. **Recommended.**
- B. Fixed "from tomorrow on".
- C. None (risky: a 9h booking at 8h59).

**D6. How far ahead can a customer book?**
- A. Configurable, default 14 days. **Recommended.**
- B. Fixed 7 days (matches today's CALENDÁRIO of 8 days).
- C. 30 days.

**D7. Buffer between bookings?**
- A. Configurable, default 0, options 0/10/15/30 min. **Recommended.**
- B. Fixed 15 min for everyone.

**D8. How many slots does the AI offer at once?**
- A. Up to 3, spread over the period the customer asked for. **Recommended.**
- B. The whole day's list.

**D9. Automatic reminder to the customer?**
- A. Not in the MVP; Google reminds the owner; a one-click "Enviar lembrete" in the Agenda list
  sends a prepared text through `/api/send` (a human click, inside a recent conversation).
  **Recommended for the MVP.**
- B. Automatic reminder over QR, under the active-messaging rules (only with a recent
  conversation, daily cap, random interval, "responda SAIR"), e.g. the day before at a random time
  between 9h and 11h.
- C. Automatic reminder only on the Official API (waits for the channel layer, P3 #13).

**D10. Can the customer reschedule or cancel in the chat?**
- A. AI reschedules and cancels by itself, team noticed. **Recommended** (atenda.pt does it; it
  frees the slot for someone else).
- B. AI reschedules, cancel goes to the team as a help request.
- C. Both go to the team.

**D11. Funnel stage after a confirmed booking?**
- A. New canonical stage "Agendado" in the default funnel (existing tenants get it added).
- B. Keep `aguardando_humano` as today.
- C. Stay where it is (do not move). **Recommended: A**, because "waiting for a human" is no longer
  true once the booking is real; needs a migration and `lib/pipeline.ts` change.

**D12. What goes into the Google event?**
- A. Title "Contact name · Service", description with phone and "marcado pelo WhatsApp" plus a
  link to the conversation. **Recommended.**
- B. Also the AI summary of the case (more context, but health or legal details may end up in
  Google).

**D13. Several professionals or rooms (salons with 3 hairdressers)?**
- A. Not in the MVP; one calendar per tenant; next round. **Recommended.**
- B. In the MVP (roughly doubles the slot and config work).

**D14. Which plans include the Agenda?**
- A. All plans. **Recommended** (table stakes: atenda.pt includes it in its only plan; the competitor
  floor charges R$ 132).
- B. Profissional and Avançado only (upsell).
- C. Paid add-on.

**D15. What happens to tenants who use "Agendar" without connecting Google?**
- A. Keep today's behavior (day and time in words, team confirms), with a hint in `/agente` to
  connect. **Recommended.**
- B. "Agendar" requires Google from now on.

**D16. Menu: where does "Agenda" go when it leaves "Em breve"?**
- A. Between Conversas and Contatos, visible to owner and attendants, only when connected.
  **Recommended** (attendants also need to see who is coming).
- B. Owner only.
- C. Not a menu item: list lives inside Painel.

**D17. The 26/08 note says "function calling" is the architectural change of this phase. If D1 = A,
record the change of course in `proximos-passos.md` and the ADR?** Recommended: yes.

## 12. Order of work after the decisions

1. Owner sets up Google (section 7, steps 1 to 8). Can run in parallel with 2.
2. `lib/agenda.ts` + pure specs (no Google, no money).
3. Migration (written, applied only with the owner's OK) + `/api/agenda/*` OAuth routes + config
   in `/agente`.
4. `processTurn`: freeBusy, block, booking, fallback. Bench (`dryRun`) shows the slots and "would
   book" without writing.
5. Agenda list + ficha + conversation header.
6. Paid suites (IA traps, then n8n battery), only when the owner names them.
7. Owner tests on Loja Teste, then OBS. Submit Google verification.

## Prototype

- `/design/agenda`: the Agenda list (upcoming bookings by day, status, "Abrir no Google Agenda",
  "Enviar lembrete" as in D9 A, cancel). `?vazio=1` empty state, `?desconectada=1` lost connection.
- `/design/agenda/configurar`: the scheduling block of "O que ele pode fazer" (connect Google,
  services with duration, rules, confirmation mode) and a preview of the free slots the AI would
  offer. `?conectada=0` before connecting.
All data is fake; no button calls Google.
