# Owner prospecting (Campanhas v2): lead base by search, one message per lead, 10 a day spread over 8h to 18h
- Date: 2026-10-29
- Status: Proposed. v2 after the owner's review of the first prototype on 29/10/2026 (structure
  rejected). Decided: go ahead despite the opt-in policy, the sending number is a simple campaign field
  (OBS's today, ban risk accepted), at most 10 per day per campaign, one message only, Apify as the lead
  source, the two-tab structure below. Still open: D1 to D9 in `docs/plano-campanhas.md`.
- Area: product, admin

## Context
The owner wants to bring companies to Atenda by approaching about 10 leads a day from inside Atenda, as a
feature only for OBS. `docs/adr/2026-08-26-no-mass-messaging-over-qr.md` carries the exception
(29/09/2026): his own prospecting in the central, his user only, daily cap and interval.

The v1 plan (same day) had a daily queue approved item by item, three touches (days 0, 3, 7), a site
audit used as the hook with a per-lead angle (Site / Atenda), voice fields, objections and a qualified
criterion on the campaign screen, and AI drafts in phase 2. The owner reviewed the `/design/campanhas`
prototype and rejected that structure: he wants a lead base built by searches, campaigns made in a
step-by-step wizard, one fixed message (with rotating variants) per lead, and the results by variant and
by hour. Tone and offer belong to the OBS account prompt, not to the campaign.

Evidence kept from v1 (sources in the plan, appendix A):
- WhatsApp Business Messaging Policy (updated 23/09/2026) requires the recipient's opt-in on any channel;
  the Official API does not make a cold first message legal.
- QR: Baileys issue 2707 (error 463 "Reachout Timelock") is a temporary ban for starting chats with
  numbers that never wrote, which is this use case. No warm up makes a number immune.
- The Deskcomm author (video of 23/10/2026) warns never to use the company's official number.
- Apify: `compass/crawler-google-places` ("Google Maps Scraper", store page read on 29/10/2026, listed as
  maintained by Apify), pay per event from US$ 1.50 per 1,000 places; US$ 5 free credit per month. The
  v1 video: 50 companies for US$ 0.33.

Owner's words (29/10/2026): "vamos usar o da obs mesmo, a campanha vou rodar com no maximo 10 contatos por
dia"; on the number: "eu coloco qualquer um ali e segue o baile"; on this round: "capricha no layout e gere
o plano para ja mandarmos ver".

## Decision (proposed)
- **Two sections, admin only, a menu on the left** (second review, same day: no page title, full width,
  dashboard on top and one paginated table below in each section). Leads: the dashboard of the base
  (numbers, leads per city, funnel, online presence, score) and a table of searches or of all leads
  (rating, reviews, site yes / social only / no, phone flagged when not a valid BR mobile, score, campaign
  badges, mark as good and discard, search by typing and filters); a search opens its own lead table.
  Campanhas: the results dashboard (numbers, sends per day, best message, best weekday, best hour, with a
  campaign and period filter) and the campaign table; a four-step wizard (Campanha, Contatos, Mensagem,
  Confirmar) with autosave; the campaign detail (the same dashboard since the start, the leads table,
  Pausar, "Nova campanha com quem não respondeu").
- **One message per lead, no follow-up.** One fixed text for everyone, 1 to 3 variants rotating in queue
  order, one variable `{empresa}`. A lead that went through a campaign is marked with it forever and only
  enters another one when the owner picks it explicitly. A lead who asked to stop never enters a list
  again.
- **Pace**: at most 10 per day per campaign (`TETO_DIARIO`, also a table check), 8h to 18h
  America/Sao_Paulo, random pause of 4 to 12 minutes. A Vercel cron sends one message per due campaign
  per run through `enviarMensagemAtiva` (`lib/envio-ativo.ts`) and sets the next time with
  `proximoEnvioEm`, which spreads the sends over the window (one random instant per 1 hour slot) so the
  reply rate by hour can be measured.
- **Replies**: land in the inbox of the sending company and its AI answers (n8n and `processTurn`
  unchanged). The cron reads the first inbound message after the send to mark "respondeu" and its hour;
  "não quero" / "pare" (provisional list) marks "pediu para parar".
- **Source behind a module** (`lib/fonte-de-leads.ts` + server-only `lib/fonte-apify.ts`), async with an
  Apify webhook or polling; dedupe by phone. `APIFY_TOKEN` is set by the owner in Vercel.
- **Rules in one pure module**: `lib/prospeccao.ts` (phone, site class, score, statuses, eligibility,
  variants, stop phrases, schedule, results), used by the screens, the routes and the cron.
- Data: `prospeccao_buscas`, `prospeccao_leads` (unique phone), `prospeccao_busca_leads`,
  `prospeccao_campanhas`, `prospeccao_variantes`, `prospeccao_campanha_leads`; RLS on, service role only;
  migration drafted, applied only when the owner releases DDL.

## Accepted risk
A ban of the picked number, OBS's main number today (owner's decision, 29/10/2026), against the agent's
recommendation and the explicit advice of the Deskcomm author. It stops OBS's own attendance on that
number until a new one is connected, silences OBS's notices and breaks the suites that run on the OBS
tenant (`test:e2e:n8n`, login suites) until then; no third party can unban. Mitigations: 10 a day, one
message per lead, spread over the window with random pauses, business hours, rotating variants,
permanent opt-out, auto-pause on disconnect, a spare chip and reconnect steps ready. v2 drops two v1
mitigations by the owner's choice: the per-item approval of each text and the explicit "responda SAIR"
line (risk 4 and D4 in the plan).

## Consequences
- Tenant rules do not change: active messaging for tenants stays "recent conversation only"; the
  tenants' menu never shows Campanhas.
- With OBS picked, prospect conversations share the OBS inbox, funnel, panel numbers and AI usage.
- Two routes live outside `/api/admin/*` (cron and Apify webhook), each guarded by its own secret,
  because `proxy.ts` answers 404 there to anyone without an admin session.
- `prospeccao_campanhas` goes into `TABELAS_DO_CLIENTE`; the lead base has no `client_id` (it belongs to
  the product owner).
- Depends on the agenda branch (`lib/envio-ativo.ts`) being merged first.
- Docs to correct when accepted: the prospecting exception in `CLAUDE.md` and in the 26/08 ADR (a
  campaign field for the sending number instead of "dedicated number"), `docs/proximos-passos.md`
  ("Não construir" item on campaigns) and `docs/estrategia-2026-07.md` (1,000 free service messages per
  number per month is now on Meta's page).

## Alternatives considered
- v1 structure (daily queue approved item by item, three touches, per-lead angle from a site audit, voice
  fields, AI drafts): rejected by the owner on 29/10/2026.
- Dedicated chip in a separate company: recommended by the agent; declined by the owner (the field still
  allows it: connect a spare chip as another company and pick it).
- Fully automatic cold WhatsApp with an SDR agent (Deskcomm): not needed for 10 a day.
- Official API marketing templates: paid, Meta setup, and still against the opt-in policy for cold
  contacts.
- Google Places API as the source: 1,000 free Enterprise calls a month, but its terms forbid storing
  anything other than the place id; kept as a swap behind the source module.

## Implementation notes (backend, 30/10/2026)
- The screens read from ONE interface, `FonteDeCampanhas` (`components/admin/campanhas/tipos.ts`): the
  real page through `/api/admin/campanhas/*` (`lib/campanhas-fonte.ts`), the preview from memory
  (`app/design/campanhas/fonte-de-mentira.ts`). Pages of 10 with a count and the search run on the
  server; no list of leads or campaigns ever reaches the browser whole.
- The dashboards come from SQL in long format, folded by pure twins (`resultadoDasLinhas`,
  `serieDasLinhas`, `resumoDasLinhas` in `lib/prospeccao.ts`); `e2e/campanhas-lib.design.spec.ts` proves
  the fold equals the in-memory math for every fake campaign.
- Evidence of the review of the overnight phase 2: (1) the Apify ad hoc webhook was sent inside the POST
  body, which Apify treats as the actor input, so the run's end would never reach the CRM; it goes in
  the `webhooks` query parameter (base64), with the secret in a `headersTemplate` header, never in the
  URL. (2) The cron's fallback concluded a search from the dataset without checking the run status, so a
  run still in progress would be saved half done; both paths now ask the source (`lerExecucao`). (3) The
  pg_cron migration copied the bearer into `cron.job`; the job now reads Vault on every run. (4) A send
  "pulado" returned the lead to the queue, so the cron would claim the same lead forever.
- The actor's accepted values for `placeMinimumStars` and `website` are still unconfirmed; the same
  filters run on our side (`filtrarPelasOpcoes`), so the base never gets what the owner left out.
- Map inside a dialog (31/10/2026): the Nova busca modal grew a Leaflet map; the Radix dialog's scroll lock
  cancelled the wheel over the map (the map did not zoom on the wheel either), so after picking the city
  the form looked frozen under the mouse. Measured in Playwright: over the fields the modal scrolled 300 px,
  over the map 0; the same map outside a dialog let the page scroll. Nova busca became a page and the wheel
  over the map zooms it (`ui.md`).
- Real phase of the lead details (31/10/2026, owner's approval of the prototype): eight additive nullable
  columns on `prospeccao_leads` (`lat`, `lng`, `reivindicado`, `horarios`, `distribuicao_notas`, `fotos`,
  `categorias`, `instagram`; migration `20261031021139_prospeccao_leads_detalhes.sql`). null means "not
  known", never "no": a lead from before stays null. A new search that finds a lead already in the base
  takes the new score TOGETHER with its inputs (rating, reviews, site, claimed profile, hours), so the
  number never belongs to one day and the data to another (found by /code-review: score 75 next to the
  old 3.9 rating); the other source fields only fill in (an empty value never erases one) and an
  unchanged row is not rewritten; the owner's mark and the opt-out never change there, so an old lead keeps its old score until a search finds it again, and the
  table badge shows the STORED score (the one that orders the table). The real `openingHours` with
  `language: pt-BR` is `{ day: "segunda-feira", hours: "07:30 to 12:30, 13:30 to 19:00" }` and
  "Fechado" (search of 30/10/2026). "Só desta categoria" goes to the actor as `categoryFilterWords` (paid,
  US$ 0.001 per place, counted in the cost line) only when the owner marks it, and is checked on our side
  too; rating, site and reviews stay free, on our side. The SQL was run on a local Postgres 16 with the
  real migrations before review (new lead, existing lead, filter, page of a lead, pins).
