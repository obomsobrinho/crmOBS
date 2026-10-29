# Plan: Campanhas, the product owner's own prospecting

Status: DRAFT for the owner's review (written 29/10/2026, overnight, nothing decided). Every choice
below that changes product behavior is listed in section 12 ("Owner decisions") with a
recommendation; none of them was taken by the agent. ADR: `docs/adr/2026-10-29-owner-prospecting-campaigns.md` (Proposed).

## 1. Problem

Week priority of the owner: bring companies to Atenda by finding leads with a company search tool,
choosing the best ones and approaching about 10 per day. His decision (21 and 22/10/2026): this
prospecting runs inside Atenda itself, as **Campanhas**, a feature **only for OBS** (dedicated
number, daily cap, interval). Never a tenant feature, never on the sales page.

What exists today:
- The exception is already written: `CLAUDE.md` and `docs/adr/2026-08-26-no-mass-messaging-over-qr.md`
  allow "the owner's OWN prospecting inside `/admin`, his user only, dedicated number, daily cap and
  interval (not built yet; never a tenant feature)". The plan works inside that exception.
- The rule it collides with: active messaging only to contacts with a recent conversation, never cold
  lists. Prospecting is cold by definition. The exception covers the owner; it does not change the
  tenant rule, and the menu rule "Campanhas is out" stays true for tenants.
- Pieces to reuse: `lib/envio-ativo.ts` (branch `claude/agenda-plano-0fc545`, not in `main` yet:
  `enviarMensagemAtiva`, `RegrasDoEnvioAtivo`, `sortearPausa`), the message type pattern of the agenda
  reminder (`chat_messages.message_type = 'lembrete'`, kept out of "who replied"), the contact born
  from the CRM (`docs/adr/2026-10-01-contacts-also-born-from-the-crm.md`), the cold contact alert,
  the whole inbox, AI and funnel.

## 2. Sources read

### 2.1 Video (Rafael Melgaço, "Prospecção com IA agora audita o site da empresa e aborda o lead", 23/10/2026, 18 min)

The transcript could NOT be fetched (YouTube returns an empty caption body without a session token).
What follows is from the video page: description written by the author and chapter list.
- Flow: connect a WhatsApp by QR ("use a disposable or warmed number, never the company's official
  one, prospecting uses a non official API"); turn on business hours and human activity simulation;
  type segment and city (example: real estate agencies in Divinópolis, MG); paste an **Apify** key;
  set "voice and vocabulary" (your name, what you do, your edge); search; each company gets a **score
  ("how much information the AI found")** and a **site audit**; prepare the approach with a published
  SDR agent, connection, funnel and entry/qualified stages; cap the sends.
- Numbers in the video: **5 sends per 24 h, 3 minutes apart**, "reply PARAR" exit. **50 companies in
  about 3 minutes for US$ 0.33 (about R$ 1.65)**, about 3 cents each; Apify gives US$ 5 credit per
  month; message generation also spends AI credit.
- The new piece: it opens each company's site, audits what it has and lacks (clickable phone, address,
  map) and uses the gap as the argument of the first message. Chapter "Prospectar empresas do Google
  invade privacidade?" exists; its content was not available.

### 2.2 Repository `melgarafael/DeskcommCRM` (MIT, read at commit eeb3b9c, 29/10/2026; no code copied)

- **Model**: `prospecting_campaigns` (search jsonb, config jsonb, status draft/running/paused/completed,
  search status, Apify run id, `cost_usd`, `next_send_at`, ONE running campaign per organization by
  partial unique index) and `prospecting_candidates` (place id, phone, data jsonb, status
  new/queued/sending/sent/skipped/failed, links to contact, lead and conversation; **unique phone per
  organization**, so a number is never approached twice). Service role only, no grants to users.
- **Config** (zod, strict): agent, connection, pipeline, entry and qualified stages, instruction and
  qualification text (10 to 2000 chars), offers, **daily limit 1 to 50 (default 10)**, **interval 5 to
  1440 minutes (default 15)**, **legal basis reference required** (3 to 500 chars), when the company
  enters the CRM (at start or at send), where the exit goes (first or second message). Only the pace
  can be edited after start (`adjust_pace`).
- **Pace** (`ritmo-da-esteira-fria.ts`): the cold lane is 4x slower than their reply lane; warm up caps
  of the house (20/50/100/200/none by number age 0/4/8/15/31 days) divided by 4 give **5/13/25/50/none**;
  fails closed (unknown config = 1 per day); random jitter only ever delays. Send window 7h to 22h by
  default, own weekdays for prospecting.
- **Exit** (`rodape-de-saida.ts`): deterministic footer "Se não quiser mais receber mensagens, responda
  PARAR.", never written by the model, and it throws if the opt-out detector stops recognizing the word.
  Their reasoning matches ours: without an offered exit, the exit people use is "report spam", which
  the system never sees.
- **Site audit** (`site-classify.ts`, `estrategia-site.ts`): pure, no model; classes (aggregator, no
  site, ok, bad, invalid SSL, offline); measured on their VPS: 8 of 20 "websites" were Instagram,
  linktree or wa.me. Strategy per lead = audit x offer x niche, objections shown to the human, never
  in the prompt.
- **Errors**: a failure is scoped to the campaign (pause) or to the candidate (skip and go on); a
  short channel reconnection postpones instead of pausing (they lost a sending day to that, issue 3073).
- **Bulk campaigns** (separate module): recipients with eligibility, suppression list, legal basis
  `consent` or `legitimate_interest` with required LIA reference, metrics counted by timestamps
  (`sent_at`, `delivered_at`, `read_at`, `replied_at`, `opted_out_at`), not by status.

**What to adopt and do better** (not a scoreboard):
- Adopt: unique phone across all campaigns, required legal basis, deterministic exit footer, cold pace
  that fails closed, jitter that only delays, campaign versus candidate failure scope, metrics by
  timestamp, pause and resume, edit only the pace after start.
- Do better: (1) their audit sells **websites**; ours should read what matters to Atenda: **how the
  company attends on WhatsApp** (opening hours that end early or skip weekends, many reviews means
  many conversations, reviews that complain about no answer, a site that already pushes wa.me). (2)
  The owner **approves the day's batch** before anything leaves (they send fully automatic after
  setup). (3) The reply lands in a product that is itself the demo: the lead talks to an Atenda AI.

## 3. Market research (with sources; prices in USD are list prices seen on 29/10/2026)

### 3.1 Where the leads come from

| Source | Data | Cost | API | Legal notes |
|---|---|---|---|---|
| **Google Places API (New)**, official | name, address, phone, site, rating, review count, opening hours, place id | Text Search Pro US$ 32 per 1,000 calls, **5,000 free calls per month**; Enterprise (needed for phone and hours) US$ 35 per 1,000, **1,000 free per month**; up to 20 places per call | yes | Policies: "You must not pre-fetch, cache, or store Places API content beyond the allowed exceptions"; **place id may be stored indefinitely**. Results without a Google map must show the Google logo. Storing a lead list from it is the gray zone (section 12, D3) |
| **Apify** `compass/crawler-google-places` (what Deskcomm uses) | same fields plus emails and socials from the site | from about US$ 1.50 to 4 per 1,000 places; video: US$ 0.33 for 50; US$ 5 free credit per month | yes | Scraping Google Maps is outside Google's terms; storage is unrestricted in practice |
| **Outscraper** (Google Maps) | same | 500 records free, then about US$ 3 per 1,000 | yes | Same as Apify |
| **Receita Federal open data (CNPJ)**, Casa dos Dados, CNPJá | CNAE, opening date, size, address, registered phone and e-mail | open data is free; Casa dos Dados paid API reported at R$ 662.40 per month minimum (user comment, not verified) | varies | Public registry; the registered phone is often the accountant's, so it is weak for WhatsApp |
| **Speedio, Econodata** (BR B2B bases) | firmographics, validated contacts | Speedio from about R$ 719 to 1,149 per month, 12 month lock in reported; Econodata about R$ 590 to 890 (third party numbers, quote needed) | yes | Built for B2B sales teams; overkill for 10 per day |
| Apollo and similar | decision makers, e-mail | n/a | yes | [INFERENCE] weak coverage for small local Brazilian businesses (barber, clinic, optician), the Atenda ICP |

[INFERENCE] For 10 approaches a day, picking 1 in 3 found companies, the owner needs about 600
candidates a month: about 30 Places calls, inside the free tier. Lead cost is not the constraint; data
quality (a mobile number that has WhatsApp) and the terms are.

Sources: Google pricing and policies (developers.google.com/maps/billing-and-pricing/pricing,
developers.google.com/maps/documentation/places/web-service/policies), Apify actor page
(apify.com/compass/crawler-google-places), Outscraper reviews (salesforge.ai, syncgtm.com),
b2bstack.com.br (Speedio, Econodata), projetoacbr.com.br forum (Casa dos Dados comment).

### 3.2 LGPD

- B2B prospecting of a business phone usually rests on **legitimate interest** (LGPD art. 7, IX). The
  ANPD guide on legitimate interest (published 02/02/2024) asks for a **balancing test** (simplified
  model in its annex II) weighing purpose, necessity, the data subject's expectation and safeguards;
  public availability alone does not settle it. A sole proprietor's number is personal data.
- Safeguards that make the test pass: minimal data (company name, segment, city, business phone),
  purpose stated in the first message, easy exit honored at once and forever (suppression list),
  retention limit for leads that never answered, no sensitive data. Deskcomm makes the LIA reference a
  required field; we should too.

Sources: gov.br/anpd guide; mattosfilho.com.br and bmalaw.com.br summaries.

### 3.3 WhatsApp: the finding that changes the framing

- **WhatsApp Business Messaging Policy (updated 23/09/2026)**: "You may only contact people on WhatsApp
  if: (a) they have given you their mobile phone number ... and (b) you have received opt-in
  permission". This applies to **every** channel, the Official API included.
- Consequence: the line in `docs/proximos-passos.md` ("Campanhas ... Só volta com API Oficial, onde é
  legal e paga") is **wrong for cold prospecting**. The Official API makes reminders and follow-ups to
  people who opted in legal; it does not make a first message to a stranger legal. On the API the
  penalty is template quality rating and messaging limits for the business portfolio (new portfolios
  start at 250 business initiated conversations per 24 h, tracked per portfolio since 10/2025,
  360dialog docs), which could also hurt OBS's future official numbers.
- Official API price for Brazil: marketing about US$ 0.0625 per message (Meta rate card, BRL table now
  published as CSV/PDF; third party BRL quotes R$ 0.38 to 0.39). Brazil was not changed in the
  01/07 and 01/10/2026 updates. **Also confirmed on Meta's page: 1,000 free service messages per
  number per month from 01/10/2026** (`docs/estrategia-2026-07.md` still lists this as a hypothesis).
- QR risk (already documented in `docs/estrategia-2026-07.md` section 5): Baileys issue 2707, error 463
  "Reachout Timelock", temporary ban when starting conversations with people who never contacted the
  number, is **exactly this use case**. Warm up practice from vendors (no official numbers exist):
  start with 5 to 30 per day, grow 10 to 15% every day or two, never double, concentrate sends in an
  8 hour window, reply rate matters more than volume; "a warmed chip that starts sending unsolicited
  messages to a cold list is restricted the same way as a new chip" (chatsac.com). No routine makes a
  number immune.

Sources: whatsappbusiness.com/pt-br/policy, developers.facebook.com/documentation/business-messaging/whatsapp/pricing,
docs.360dialog.com (messaging limits), whapi.cloud, socialhub.pro, chatsac.com (warm up),
github.com/WhiskeySockets/Baileys/issues/2707.

### 3.4 Cadence and first message

No reliable benchmark isolates WhatsApp cold reply rates for small businesses (vendor blogs claim 40
to 50%, without method). The only consistent findings: short, personal, one question, no pitch in the
first message; informal or empathetic tone beat formal (ABES study: 17% formal, 21% informal, 22%
empathetic reply). [INFERENCE] measure our own rate on small batches with 2 or 3 variants instead of
trusting a number.

First message principles for this ICP (owner of a clinic, salon, optician, law office):
1. Who I am and why this company, in one line, with a fact about THEM (hours, reviews, city).
2. One question that is easy to answer yes or no.
3. No link, no price, no attachment in the first touch (links in a first cold message read as spam).
4. The exit line, always.

Example variants (placeholders, the owner writes the real ones; `{nome}`, `{segmento}`, `{fato}` are
filled per lead):
- A: "Oi, tudo bem? Sou o Franck, da OBS, aqui de {cidade}. Vi que a {nome} fecha às {hora} e no
  domingo. Quem chama no WhatsApp fora desse horário fica sem resposta hoje? Se não quiser receber
  mais mensagens, responda SAIR."
- B: "Oi! Sou o Franck, da OBS. Vi as {avaliacoes} avaliações da {nome} no Google, parabéns. Vocês
  conseguem responder todo mundo no WhatsApp na hora, ou às vezes fica gente esperando? Se não
  quiser receber mais mensagens, responda SAIR."

Cadence (recommended, D6): touch 1 on day 0; touch 2 on day 3 if no reply (one useful fact, for
example "testei aqui: um agente responde em segundos, até às 23h; quer ver como seria com a {nome}?");
touch 3 on day 7, a short goodbye ("vou parar por aqui, se um dia fizer sentido é só chamar"). Any
reply, any SAIR, a block or a failure stops the sequence. Never more than 3 touches.

### 3.5 Competitors (what they offer, what to take)

- **Kommo**: Salesbot plus WhatsApp broadcast with delivery, read and click report. Take: the
  per-campaign report by timestamps.
- **RD Station Marketing**: WhatsApp messages via the Official API as an add-on in all plans, pitched
  as "sem risco de bloqueio"; RD Conversas for attendance. Take nothing for cold prospecting (it
  targets opted-in bases).
- **Deskcomm**: the full flow above (search, audit, SDR agent, caps). Closest to what the owner wants.
- **Sellflux, Zappy**: not verified (searches returned nothing usable about their sending features);
  left out rather than guessed.

## 4. Options

| | A. Deskcomm way: fully automatic cold WhatsApp over QR | B. Official API marketing template | C. Warm first: lead starts the chat (e-mail, Instagram, visit, ad with wa.me link) | D. **Approved daily batch over a dedicated QR number** (A with the owner approving every message) |
|---|---|---|---|---|
| Policy | violates opt-in | **also violates opt-in** | compliant | violates opt-in, lowest exposure |
| Ban or penalty | dedicated number lost | portfolio quality and limits, can hit future official numbers | none | dedicated number lost, lower odds (low volume, human pace, personal text) |
| Cost per month at 10/day | chip + leads (cents) | about US$ 0.0625 x 400 = US$ 25 + Business Manager setup | owner's time | chip + leads (cents) |
| Setup | days of code | business verification, template approval | none | days of code |
| Reply quality | depends on the AI text | template, no personalization freedom | best (they chose to talk) | best of the cold options (owner reads each text) |
| Owner time | almost none | low | high | 5 to 10 minutes a day |

## 5. Recommendation

**D as the main lane, C as a cheap parallel lane, and start this week with zero code.**

1. **Phase 0, this week, no code** (decision D16): create a second company "OBS Prospecção" through the
   normal signup with a **dedicated chip**, mark it Vitalício in the central, write an SDR prompt in
   advanced mode (the AI answers whoever replies, qualifies and offers the 7 day trial), and approach
   10 per day by hand with "criar contato e iniciar conversa" in `/contatos` (it exists, with the cold
   contact alert). Pick companies on Google Maps by hand. This proves the text and the reply rate
   before any code, and the owner prospects tomorrow instead of in two weeks.
2. **Phase 1, the Campanhas module** in the owner's central (sections 6 to 9): search, score, save the
   chosen leads, daily queue that the owner approves, paced sender, 3 touch cadence, exit and
   suppression, results.
3. **Phase 2**: per-lead AI draft from the "attendance x-ray" (section 7), auto-pause rules, conversion
   linking, the C lane as tasks (send an e-mail or Instagram DM with a wa.me link).

Why not A: the cost of a wrong text is a burned number and an annoyed local business owner who may
become a customer later; 10 per day does not need full automation, and the approval screen doubles as
quality control. Why not B: it costs money, needs Meta setup and is not more legal for this use.

## 6. Where it lives

- **Conversations live in a separate tenant** ("OBS Prospecção", D2). No multi-number support exists
  (and "múltiplos números por conta" is in "Não construir"); a separate tenant gets the dedicated
  instance, its own agent prompt, inbox, funnel and notices for free, and keeps prospecting out of the
  OBS attendance numbers and panel. If the number is banned, only that tenant loses its connection.
- **The Campanhas screen lives in the owner's central**: route `/campanhas` (admin only, same guard as
  `/clientes`: `adminDaPagina`, non-admin redirected to `/contatos` and never told it exists; API under
  `/api/admin/campanhas/*` with `rotaDoAdmin`, 404 for anyone else). Menu item "Campanhas" with
  `adminOnly`, like "Clientes" (D12). The tenants' menu never shows it; "Campanhas is out" stays true
  for them.
- Reads and writes through `service_role` on the server (`lib/admin.ts` pattern); every owner action
  that changes a campaign goes with its `admin_acoes` row in one SQL function, like the other central
  actions.

## 7. Flow

1. **Search** (owner types segment and city; optional filters: has mobile, minimum reviews). The server
   calls the provider (D3) and returns one page of up to 20 results. Nothing is stored yet. Each row
   shows name, segment, neighborhood, rating and reviews, hours, phone type, and the score with its
   reasons.
2. **Score** (pure `lib/prospeccao.ts`, `pontuarLead(sinais)`, same function on screen and server,
   0 to 100 with the list of reasons; weights are D17, the defaults are placeholders):
   - required: a **mobile** number (BR mobile = 11 digits with the 9 after the DDD) and not in the
     suppression list, not an existing Atenda customer, not already approached;
   - signals: segment in the ICP list; many reviews (busy business, many conversations); hours that end
     early, closed on Sunday or Saturday afternoon (the AI covers that); site or profile that pushes
     wa.me (they already sell on WhatsApp); reviews that mention slow answers (phase 2, needs review
     text).
3. **Choose**: the owner ticks the best ones and saves them; only chosen leads are stored, with
   minimal fields and the source id (data minimization, D3).
4. **Daily queue**: every working day the system proposes up to the cap (D7): due follow-up touches
   first, then new leads by score. Each item shows the final text (template with fields filled in phase
   1; AI draft in phase 2). The owner edits, skips or approves; **only approved items are sent**.
   Unapproved items do not roll over automatically into a burst the next day.
5. **Send**: a scheduler tick (D15) inside the window (D7) sends **at most one** approved message when
   `proximo_envio_em <= now`, then sets the next slot with a random pause (jitter only delays). Sending
   goes through `enviarMensagemAtiva` (`lib/envio-ativo.ts`) with a new `REGRAS_DA_PROSPECCAO`
   (cap and interval), on the prospecting tenant's instance. Before each send it re-checks: not in
   suppression, no reply arrived, instance connected, account not blocked. The send creates the
   contact in `dados_cliente` of the prospecting tenant and records the outgoing text in
   `chat_messages` with `message_type = 'prospeccao'` through service role, the same way the agenda
   reminder does, so the conversation shows it and the AI reads it when the lead answers.
6. **Reply**: nothing new in n8n. The prospecting tenant's instance webhook already lands the inbound
   in the inbox and calls `/api/agent`; the SDR prompt answers. The campaign learns about the reply by
   reading `chat_messages` (indexed `(client_id, phone, created_at)`) for a `user_message` after the
   last touch, before each send and when the results screen loads. No change in `processTurn`, so the
   attendance path is untouched.
7. **Exit**: an inbound whose whole text is SAIR (normalized, accents and case) puts the phone in the
   suppression list forever and stops the sequence; the SDR prompt acknowledges it in one line. A
   failed send (number without WhatsApp) marks the lead and never retries the same touch.
8. **Funnel**: the prospecting tenant's pipeline (for example Abordado, Respondeu, Testando, Cadastrou,
   Perdido; names are the owner's). The AI qualification moves the card as today. "Converted" = the
   company signed up (D13).

## 8. Data model (proposed, migration file only, NOT applied)

All tables: RLS on, no grant to `anon` or `authenticated`, `service_role` only (the browser talks to
`/api/admin/campanhas/*`). Names follow the central (Portuguese columns).

- `prospeccao_campanhas`: `id`, `nome`, `client_id` (the prospecting tenant, FK `clients`), `segmento`,
  `cidade`, `textos` jsonb (one text per touch, with variants), `cadencia` jsonb (days between touches),
  `teto_diario` int (1 to 50), `intervalo_min_s` and `intervalo_max_s`, `janela` jsonb (weekdays, start
  and end hour in São Paulo), `base_legal_ref` text NOT NULL, `status` (`rascunho`, `ativa`, `pausada`,
  `encerrada`), `pausada_motivo`, `proximo_envio_em`, `criada_por`, `criada_em`, `atualizada_em`.
  At most one `ativa` per prospecting tenant (partial unique index), like Deskcomm.
- `prospeccao_leads`: `id`, `campanha_id`, `fonte` (`google_places`, `apify`, `cnpj`, `manual`),
  `fonte_id`, `nome`, `telefone` (digits), `segmento`, `cidade`, `bairro`, `site`, `nota`, `avaliacoes`,
  `horario` jsonb, `sinais` jsonb, `pontuacao` int, `status` (`escolhido`, `na_fila`, `abordado`,
  `respondeu`, `convertido`, `descartado`, `saiu`, `falhou`), `toque` int, `proximo_toque_em`,
  `contato_id` (bigint, `dados_cliente.id` after the first send), timestamps. **Unique `telefone`
  across all campaigns**: a number is approached once in its life.
- `prospeccao_envios` (append only): `id`, `lead_id`, `toque`, `texto`, `aprovado_em`, `aprovado_por`,
  `enviado_em`, `resultado` (`enviado`, `recusado`, `pulado`), `erro`. Metrics count timestamps, not
  status (Deskcomm lesson: a lead that replied was also sent).
- `prospeccao_exclusoes`: `telefone` PK, `motivo` (`saiu`, `cliente`, `manual`, `falhou`), `em`. Read
  before every send and every search result.
- Retention (D10): leads that never answered are deleted N days after the last touch; exclusions are
  kept (they are the promise not to write again).

## 9. Results screen (metrics)

Per campaign and total, by period (`lib/periodo.ts` chips): approached, replied (rate), left with SAIR
(rate, the ban signal), failed (no WhatsApp), qualified by the AI, converted (signed up), and cost
(leads source plus AI tokens of the prospecting tenant, `agent_turns`). Health card: number connected,
sends today against the cap, next slot, last pause and why.

Auto-pause (D9, thresholds are the owner's): instance disconnected or banned (`lib/whatsapp-estado.ts`);
SAIR or failures above a rate in the last N sends; reply rate zero after N touches.

## 10. Risks

1. **Number ban** (high): dedicated chip only, warm up, cap, pace, window, personal text, exit. The
   residual risk is accepted by the owner's 29/09 decision; a ban costs the chip and its history only.
2. **Policy and legal** (medium): cold contact breaks the WhatsApp opt-in policy on any channel; the
   Meta page on unofficial clients also documents legal action against those who "assist" abuse. Keep
   it the owner's own use, never sell or advertise it, never mention it on the sales page.
3. **LGPD** (medium): LIA written before the first send, minimal data, exit honored forever, retention.
4. **Brand** (medium): a pushy message to a local business that is a future customer. Approval of each
   text and the 3 touch ceiling are the mitigation.
5. **Google terms** (medium if Places API is stored, D3).
6. **Attendance regression** (low): the plan does not touch `processTurn` or n8n; the only shared
   piece is `lib/envio-ativo.ts`, which belongs to the agenda branch and must be merged first.

## 11. Delivery plan

- Phase 0 (owner, no code): section 5.1.
- Phase 1: migration file, `lib/prospeccao.ts` (pure: score, phone type, queue order, exit text,
  metrics), provider adapter behind an interface (mock in previews), `/campanhas` screens, admin API
  routes, scheduler route, results. Prototype with fake data at `/design/campanhas` (this branch).
- Phase 2: AI draft per lead, auto-pause, conversion link, C lane tasks.
- Gate (owner's flow): plan, development, owner approves layout and rules, tests (`fechar-entrega`;
  nothing paid without being named), `/simplify` and `/code-review`, then `main`.

## 12. Owner decisions (each with a recommendation; nothing decided)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Accept that cold prospecting breaks the WhatsApp opt-in policy on ANY channel and go ahead on a dedicated QR number at low volume | Yes, within the 29/09 exception; amend the `CLAUDE.md` line to say "prospecting" explicitly and keep it his user only |
| D2 | Where the conversations live | Separate tenant "OBS Prospecção" with the dedicated chip, Vitalício |
| D3 | Lead source | Google Places API (official, free at this volume), persisting only chosen leads with the place id; legal reading of the storage terms before Phase 1 code. Alternative: Apify (what Deskcomm uses, cheaper per lead, scraping) |
| D4 | Approval | The owner approves the day's batch; nothing leaves unapproved |
| D5 | First message text | Phase 1: 2 or 3 variants written by him with fields; Phase 2: AI draft from the x-ray, still approved |
| D6 | Cadence | 3 touches on days 0, 3 and 7; stop on any reply, SAIR, block or failure |
| D7 | Cap, pace and window | Week 1: 5 per day; then 10 if SAIR stays low; random 4 to 12 minutes; Monday to Friday, 9h to 17h São Paulo. No numbers here are measured; they are a starting point |
| D8 | Exit | "Se não quiser receber mais mensagens, responda SAIR." in the FIRST message, deterministic, never written by the AI |
| D9 | Auto-pause thresholds | Pause on disconnect; pause when 2 SAIR or 3 failures happen in one day (placeholder numbers for him to set) |
| D10 | LGPD | Write the LIA (ANPD annex II model) before the first send; required field; delete silent leads after 90 days (placeholder) |
| D11 | "Auditoria de atendimento" bait (writing to their WhatsApp as a customer) | Keep it manual and honest, never automated inside Campanhas |
| D12 | Screen and menu | Admin only route `/campanhas`, menu item visible only to him |
| D13 | Converted | Phase 1: he marks it; Phase 2: match the signup phone or e-mail with the lead |
| D14 | Docs correction | Fix "Só volta com API Oficial, onde é legal" in `proximos-passos.md` and the ADR (opt-in applies to the API too); move the 1,000 free service messages from hypothesis to fact in `estrategia-2026-07.md` |
| D15 | Scheduler | Vercel Cron every 10 minutes in the window if the Vercel plan allows it (to verify; the agenda uses one daily cron); otherwise the tick runs from an n8n schedule calling the route (needs his OK, n8n is production) |
| D16 | Start this week with Phase 0, no code | Yes |
| D17 | Score weights and ICP segment list | His list; the prototype uses placeholder weights, marked as such |
