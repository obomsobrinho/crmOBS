# Plan: Campanhas v2, the product owner's own prospecting

Status: v2, written 29/10/2026 after the owner's review of the first prototype, which he rejected as a
structure. The brief of that review is the source of truth and this plan follows it. ADR:
`docs/adr/2026-10-29-owner-prospecting-campaigns.md` (Proposed). Prototype with fake data:
`/design/campanhas`. Nothing applied to the database, nothing sent, n8n untouched.

Delivery flow (fixed by the owner): 1. plan; 2. prototype with fake data; 3. owner approves layout and
rules; 4. backend; 5. tests; 6. `/simplify` and `/code-review`; 7. `main`. **DDL only after the owner
releases it.** Never touch n8n.

Owner's go-ahead for this round (29/10/2026, literal): "capricha no layout e gere o plano para ja
mandarmos ver" and "Limpar e mandar".

## 1. What it is

Campanhas is how OBS finds companies and sends each one ONE first message on WhatsApp, at most 10 a day,
from inside Atenda. It is the owner's tool only (`ADMIN_USER_IDS`), never a tenant feature, never on the
sales page. It works inside the exception written in `CLAUDE.md` and
`docs/adr/2026-08-26-no-mass-messaging-over-qr.md` (his own prospecting, his user only, daily cap and
interval); the "dedicated number" part of that exception became a simple campaign field (section 5.1).

The replies land in the inbox of the company that owns the sending number (OBS today) and the OBS AI
answers them, with the tone and offer of the OBS account prompt. The campaign screen does not hold tone,
offer, objections or a qualified criterion.

## 2. What changed from v1 (removed by the owner on 29/10/2026)

- "Fila do dia" as a standalone screen, with per-item approval.
- The 2nd and 3rd touch (cadence 0, 3, 7 days). Now: one message per lead, no follow-up.
- Per-lead custom messages and the per-lead site angle (`anguloDaAbordagem`, Site / Atenda / Site e
  Atenda) with the site audit as the hook.
- The voice fields (name, company, "o que faz", edge) and the AI-written drafts (old phase 2).
- The agent's tone, offer, "como começar", objections and qualified criterion on the campaign screen:
  they live in the OBS account prompt (`/agente`), like for any conversation.

`lib/prospeccao.ts` was rewritten to the v2 rules; the old exports (angle, voice, touches, daily queue,
site x-ray) are gone.

## 3. Structure: two sections, a tab pair on top

Where it lives: one admin-only page (D1 decides the route). The guard is `adminDaPagina` like
`/clientes`; a non-admin is redirected and never learns it exists. Owner's review of 29/10/2026 (second
round, corrected in the third): no page title, the body uses the full width, and Leads | Campanhas is a
`painel` tab pair (each with its count) at the LEFT of the first row of every screen, the same kind of
control as "Buscas | Todos os leads"; the screen's actions sit at the right of that row. Each section is the
same shape (references: Dribbble "CRM Leads & People data table", "CRM SaaS leads table view", "CRM
Dashboard for Sales Performance"): a dashboard on top, then ONE table below. Every table has a toolbar
(search by typing plus ONE filter icon button, `BotaoDeFiltro`, the same as the Clientes central; never
a row of chips) and NUMBERED pagination of 10 (`Paginacao`, `components/ui/paginacao.tsx`: "Mostrando 11
a 20 de 137", previous, pages, next). The owner asked for visible pages here; it departs from the
"infinite scroll" line of `engineering.md` for these admin tables only (page plus a count on the server).
No sentence that explains a rule on screen (owner, third round): the rules live in the code and in this
plan, not as captions.

### 3.1 Leads (the base)

- **Dashboard of the base** (`resumoDaBase`, pure; the real one is one SQL aggregate, never rows in the
  browser), fourth round: a band of four numbers (`FaixaDeNumeros`: Na base with cities, segments and a
  sparkline of new leads per week, `leadsPorSemana`; Com celular, Contatados and Responderam each with its
  share and a thin bar), then "Por cidade" and "Por segmento" as RANKINGS (`RankingDaBase`: the 6 largest,
  each with count, share of the base as a bar, contacted and replied, and one "Outras N" line with the
  rest, so the card keeps its size with 300 cities; the stacked bar chart per city grew without limit and
  its "fora das campanhas" read as "no phone"), then "Funil da base" (a list of steps with bars and the
  share of the previous step, `FunilDaBase`), "Nota no Google" (columns per band, `FAIXAS_DE_NOTA`) and
  two donuts, "Presença online" (no site / social only / own site) and "Pontuação" (high / medium / low).
- **Table**, two views in a `painel` tab pair: **Buscas** (term and city, status, found, with mobile,
  good, contacted of those with mobile as a `Medidor` plus replies, when; the filter button by status and
  search by segment or city) and **Todos os leads** (the lead table below, over the whole base).
- **"Nova busca"** (fourth round, owner: "não está muito pobre?"; `NovaBusca.tsx`, `OpcoesDaBusca` in
  `lib/prospeccao.ts`): one or more segments (Enter adds another), city plus state (`UFS`, so homonym
  cities do not mix), how many companies per segment (50, 100, 200; the cost cap, D7), minimum Google
  rating (any, 3.5, 4, 4.5), site (all, only without, only with), leave closed places out (on by default)
  and "e-mail and social profiles from the company site" (off, costs extra at the source). The footer shows
  the maximum of companies and the minimum cost at the list price. Mapped to the actor fields
  `searchStringsArray`, `locationQuery`, `maxCrawledPlacesPerSearch`, `placeMinimumStars`, `website`,
  `skipClosedPlaces`, `scrapeContacts`, `language` (input schema read on 29/10/2026; the accepted values of
  `placeMinimumStars` and `website` are not listed there, confirm on a real run before mapping). The
  search detail shows the chosen options. It runs in the background (section 6); the owner can leave and come
  back. A row in "buscando" says so; "falhou" says why in one sentence and nothing is saved.
- **Search detail**: the same band of four numbers for that search and the lead table filtered to it.
- **Lead table** (both places): name with neighborhood and city, Google rating and review count, site
  (yes / social only / no, `siteDoLead` over `classeDaUrl`), phone (flagged "Fixo", "Inválido" or "Sem
  telefone" when it is not a valid BR mobile, `tipoDoTelefone`), score (`pontuarLead`, reasons in the
  tooltip), "Respondeu" plus a badge with every campaign the lead went through, and the actions.
- **Actions**: mark as good (toggle), discard (toggle). **Filter button**: "Mostrar só" (not contacted, marked as
  good, no own site, rating 4.5 or more; several at once, the menu stays open) and "Cidade" (one); search
  by name or phone. "Criar campanha com esta
  busca" opens the wizard with that search picked.
- **Campaign marking**: a lead that went through a campaign keeps that badge forever. It only enters
  another campaign if the owner picks it explicitly ("Nova campanha com quem não respondeu").
- **Opt-out**: a lead who asked to stop shows "Pediu para parar" and never enters a list again
  (`podeEntrarNaCampanha`).
- Production loading: numbered pages of 10 with a count; filters and search go to the server; no realtime (the search status updates when the screen polls the search row, section 6).

### 3.2 Campaigns

- **Home**: the results dashboard on top (section 4; a campaign select, "Todas as campanhas" by default,
  and the panel's period selector `SeletorDePeriodo`, Mês by default), then the **campaign table**:
  name with the sending number, status, progress (sent of total as a `Medidor`; a draft shows the step
  where it stopped), replies with the rate, a 14 day sparkline of sends, when (saved, starts, created).
  The filter button by status (with counts) and search by name. A row opens the detail (a draft reopens the wizard).
  "Nova campanha" sits at the top. There is no separate "Resultados" screen any more.
- **Creation wizard** (reference: Dribbble "Asset Group Setup 2/3"): stepper on top; each section is a
  row with a check on the left and the summary of what was chosen on the right; the row expands to
  edit; footer with "Salvo agora" and Cancelar / Voltar / Continuar. Every change autosaves the draft,
  so the owner can leave midway (Cancelar keeps the draft). Steps:
  1. **Campanha**: name; start (today, as soon as it starts, or a scheduled day at 8h); sending number
     (a select of the WhatsApp connections; owner, literal: "eu coloco qualquer um ali e segue o
     baile").
  2. **Contatos**: a search (or all) plus the cuts "only the ones I marked as good" and "only without own
     site"; always only leads not contacted, with a valid mobile, not discarded, not stopped. Shows the
     count, how many days at 10 per day (`diasParaEnviar`) and the first names. "Falta lead? Fazer uma
     nova busca" goes to Leads, which shows a banner to come back to the draft.
  3. **Mensagem**: one fixed text for everyone, no per-lead edit; 2 or 3 variants that rotate in queue
     order (`varianteDaOrdem`), which protects the number and shows which text gets more replies. One
     variable, `{empresa}`. The three suggested variants (section 9) come pre-filled and editable. Each
     variant shows the preview for the first company of the list; a variant without `{empresa}` or with
     an unknown field blocks the step (`problemasDaVariante`).
  4. **Confirmar**: summary rows (each reopens its step) plus the sending rules and the estimated last
     day; "Iniciar" or "Agendar".
- **Campaign detail**: the same results dashboard over the whole campaign ("desde o início"), then the
  leads table (company, variant, sent at, replied at, time to reply, status na fila / enviado / respondeu
  / falhou / pediu para parar), numbered pages, the filter button by status and search by name, "Pausar" /
  "Retomar", and "Nova campanha com quem não respondeu" (a new draft, step 2, with the leads that got the
  message and did not answer, picked on purpose; they again get one single first message).

## 4. Results

One block, `PainelDeResultados`, on top of the Campanhas home (all campaigns or one, in the period, with
the previous equal window for the badges) and of the campaign detail (since the start). Everything comes
from `resultadoDaCampanha` and `enviosPorDia` (pure; counts what happened, so a lead who asked to stop
also counts as replied and sent). The owner found the first version weak (no best day, hours shown as
bars of text); this one:
- **Band of four numbers** (third round: smaller, no empty space under a card, reply rate merged into
  Responderam): Enviadas and Responderam with its % (sparkline per day and badge against the previous
  window), Tempo até responder (median), Pediram para parar with its share of the replies (amber above
  zero).
- **Envios por dia** (home only; inside a campaign it is always the daily quota, owner): stacked columns
  per São Paulo day (replied in brand, no reply neutral), legend with totals.
- **Melhor mensagem**: horizontal bars of reply rate per variant, the texts behind "Ver os textos".
- **Melhor dia da semana** and **Melhor horário de envio** (8h to 17h): columns of reply rate with the
  value on top; the best one is the only column in brand color (`indiceDaMelhorTaxa`: only with two
  lines with sends and not all tied) and its name sits large in the card header ("Quarta, 28%
  responderam", "10h às 11h").
- Every chart goes through `components/ui/chart.tsx` (tooltip, legend with two series, text table).
- **The hour and day metrics need time**: 10 sends a day makes them slow, so the scheduler spreads the
  sends across the window on purpose (section 5.2). Below `AMOSTRA_MINIMA_PROVISORIA` sends (30,
  provisional, D5) a line under the numbers says it is still too little to compare.

## 5. Sending rules

### 5.1 Limits and number

- At most **10 per day per campaign** (`TETO_DIARIO`, also the table check), window **8h to 18h**
  America/Sao_Paulo (`JANELA`; days of the week are D2), random pause of **4 to 12 minutes** between
  sends (`PAUSA_MINUTOS`).
- **One message per lead.** No follow-up touches. The same lead gets a message again only through an
  explicit "Nova campanha com quem não respondeu".
- The sending number is a field. With OBS picked, a ban stops OBS's own attendance on that number; the
  owner accepted this risk on 29/10/2026 (ADR, "Accepted risk").

### 5.2 Scheduler

- A Vercel cron calls `GET /api/prospeccao/cron` every few minutes (D3: the plan the project is on must
  allow it; Vercel Hobby only runs a cron once a day). It is authenticated by the `CRON_SECRET` bearer
  Vercel sends (checked with `segredoConfere`); it lives outside `/api/admin/*` because `proxy.ts`
  answers 404 there to anyone without an admin session.
- Each run: picks running campaigns whose `proximo_envio_em <= now()` (partial index), and per campaign
  sends ONE message to the next `na_fila` lead (`ordem`), through `enviarMensagemAtiva`
  (`lib/envio-ativo.ts`, from the agenda branch, merged first), then stores `enviado_em`, `variante` and
  the next time from `proximoEnvioEm`.
- `proximoEnvioEm` (pure): the day window is cut into 10 equal slots of 1 hour; send N of the day goes
  to a random instant of slot N, never earlier than now plus the random 4 to 12 minute pause, never
  outside the window; a full day goes to the first slot of the next sending day. So 40 leads take 4 days
  by themselves and every hour of the window gets sends, which is what the hour comparison needs.
- A campaign whose queue is empty becomes "concluída". A scheduled one becomes "rodando" at
  `agendada_para`.
- Pause automatically when the number is disconnected (D6), with `pausada_motivo`.
- Sending is concurrent-safe: the run claims the lead with `update ... where status = 'na_fila'
  returning`, so two runs never send the same lead.

### 5.3 Replies and opt-out

- Replies land in the inbox of the sending company and its AI answers (n8n and `processTurn` unchanged).
- The cron also reads, per running or recently finished campaign, the FIRST inbound `chat_messages` row
  (`user_message`, same `client_id`, phone in `grafiasDeDigitos`, `lib/avisos.ts`) after `enviado_em` for leads still
  `enviado`: that marks `respondeu` and `respondeu_em` (the reply hour of the results).
- If that reply, or any later inbound one inside the read window, matches `ehPedidoParaParar`
  ("não quero", "pare", "parar", "sair", provisional list, D4), the lead becomes `parou` and
  `prospeccao_leads.parou_em` is set: out of every future list, forever.
- Nothing is written into conversation tables by the CRM; the read is service role from the cron.

## 6. Lead source: Apify

- The owner chose Apify for its US$ 5 monthly free credit. **Actor: `compass/crawler-google-places`**
  ("Google Maps Scraper", Apify Store page read on 29/10/2026; the store lists the developer as Compass
  and the listing as maintained by Apify; pay per event, "from $1.50 / 1,000 scraped places"). Its input
  has `searchStringsArray`, `locationQuery` and `maxCrawledPlacesPerSearch`; its output has `phone`,
  `website`, `placeId`, `reviewsCount` and `totalScore` (the rating). Other fields (category,
  neighborhood) to be confirmed against a real run before mapping; community actors only for experiments.
- **Swappable**: `lib/fonte-de-leads.ts` (pure interface: start a search, read the results, map an item
  to a lead) and `lib/fonte-apify.ts` (server-only implementation). Google Places or another actor
  replaces the implementation without touching the UI or the tables (`prospeccao_buscas.fonte`).
- **Async**: 1. `POST /api/admin/campanhas/buscas` creates the search row (`buscando`) and starts the run
  with a webhook for the run's end; 2. Apify calls `POST /api/prospeccao/apify` (outside `/api/admin`,
  checked by a secret in the webhook payload or header, `segredoConfere`), or the cron polls searches
  still `buscando` after a few minutes; 3. the route reads the dataset, dedupes by phone (unique index on
  `telefone`; an existing lead is linked to the new search in `prospeccao_busca_leads`), scores and
  saves; 4. marks the search `pronta` (or `falhou` with the reason).
- Cost cap per search: `maxCrawledPlacesPerSearch` fixed by D7.
- **`APIFY_TOKEN`**: the owner creates the Apify account and sets the env var in Vercel himself. Never
  asked for in chat, never `NEXT_PUBLIC`, never committed. New server-only envs to list in `data.md`
  when the backend lands: `APIFY_TOKEN`, `CRON_SECRET`, the Apify webhook secret (name to decide with
  the owner).

## 7. Data (proposed, migration file only, NOT applied)

`supabase/migrations/20261029060000_prospeccao_do_dono.sql` (rewritten for v2):
- `prospeccao_buscas`: term, city, status, source and its run id, total, error, dates.
- `prospeccao_leads`: deduplicated by phone (55 + digits, unique where not null), source place id,
  name, segment, address, site, rating, reviews, score, the owner's mark (`bom` / `descartado`),
  `parou_em`. The first search in `busca_id`; every search that found it in `prospeccao_busca_leads`.
- `prospeccao_campanhas`: `client_id` (the company of the sending connection, null only in a draft),
  name, status, `agendada_para`, the contacts filter (jsonb), the wizard step, `teto_diario` (1 to 10),
  `proximo_envio_em` (partial index for the cron), pause reason, dates.
- `prospeccao_variantes`: up to 3 texts per campaign (`ordem` 0 to 2).
- `prospeccao_campanha_leads`: campaign and lead, queue `ordem`, status, variant, `enviado_em`,
  `respondeu_em`, error. The lead's campaign badges are this table (`lead_id` index).
- RLS on, no policy, nothing for `anon`/`authenticated`; service role only. After applying: regenerate
  `lib/database.types.ts` and add `prospeccao_campanhas` to `TABELAS_DO_CLIENTE` (`lib/admin-purga.ts`).
  The other tables have no `client_id` (the base belongs to the product owner, not to a tenant).
- Every admin write leaves an `admin_acoes` row in the same transaction (admin rule), through one SQL
  function per action when the backend lands.
- The dashboards aggregate in SQL, never over fetched rows (the PostgREST 1000 row cap): one function for
  the base (`resumoDaBase` in memory is its twin: totals, per city, per site class, per score band) and
  one for the results (per variant, weekday and hour of sending in São Paulo, per day, median time to
  reply, for a window and the previous one). Score and site class are stored on the lead row so SQL can
  group by them. To be written with the backend, after the owner approves this layout.

## 8. Code map (backend phase)

- Pure: `lib/prospeccao.ts` (done: phone, site class, score, statuses, eligibility, message variants,
  stop phrases, schedule, results). Tests: unit tests for `proximoEnvioEm` (spread, window, next day),
  `ehPedidoParaParar`, `podeEntrarNaCampanha`, `resultadoDaCampanha`.
- Screens: `components/admin/campanhas/*` (done in the prototype, reading props); the real page passes
  server data and a source (`lib/campanhas-fonte.ts`) instead of the fake data.
- Routes (`rotaDoAdmin`, 404 for non-admins): `GET/POST /api/admin/campanhas/buscas` (10 per page,
  keyset, search by term or city, status filter), `GET /api/admin/campanhas/leads` (10 per page, keyset,
  search by name or phone, filters, optional search id), `PUT .../leads/[id]` (mark),
  `GET/POST/PUT /api/admin/campanhas` (10 per page, search by name, status filter; draft autosave,
  start, pause), `GET .../[id]` (detail), `GET .../[id]/leads` (10 per page), and the two dashboard
  reads (`.../resumo` for the base, `.../resultados?campanha=&periodo=`). Each table's footer total is a
  count, never rows. Outside admin: `/api/prospeccao/cron`, `/api/prospeccao/apify`.
- The prototype pages over memory through the same `usePaginada` (`usePaginadaDaMemoria`,
  `components/admin/campanhas/tabela.tsx`), so the real screens only swap the source.
- `e2e/central-clientes-lib.design.spec.ts` lists admin pages and routes: the new ones go in it.

## 9. Suggested message variants (the owner approves before use; pre-filled in the prototype)

1. "Oi, tudo bem? Sou o Franck, da OBS. Achei a {empresa} numa busca no Google. A gente monta sistemas
   sob medida que deixam o WhatsApp respondendo sozinho e tiram o trabalho repetido da rotina. Posso te
   mostrar em 2 minutos como ficaria aí?"
2. "Oi! Aqui é o Franck, da OBS. Vi a {empresa} no Google e fiquei curioso: quando um cliente chama no
   WhatsApp fora do horário, alguém responde? A gente monta um sistema que atende, organiza e agenda
   sozinho. Se fizer sentido, te mostro rapidinho."
3. "Oi, tudo bem? Sou o Franck, da OBS. A gente cria sistemas sob medida pra tirar tarefa chata da
   rotina: atendimento no WhatsApp que responde sozinho, agenda, lembrete, controle. Vale uma conversa
   rápida pra eu entender como funciona aí na {empresa} hoje?"

## 10. Layout

Atenda design system (`docs/design-system/`), dark first with the purple accent, base layer only
(`Card`, `Badge estado-*`, `Button` `chip`/`alternavel`/`nu`/`linha`, `Medidor`, `Indicador`,
`IndicadorComparado`, `CampoBusca`, `SeletorDePeriodo`, `EstadoVazio`, `AreaRolavel`, charts only through
`chart.tsx`, `BotaoDeFiltro`, `Paginacao`). Tab pair on top, full width body, dashboard then table in both sections. Empty states say the
next step ("Nenhuma busca ainda. Comece buscando um segmento e uma cidade."). Desktop first; table rows
stack below 1280px and the wizard stepper becomes "Passo 2 de 4" on phones. No dash in any text.

Prototype URLs (`/design/campanhas`, 404 in production): `?tela=leads|busca|campanhas|campanha|rascunho`,
`?cenario=vazio` for the empty states. The fake history has 14 searches, 12 campaigns and about 370 leads
with a reply pattern (better mid morning and mid afternoon, Tuesday to Thursday), so the charts and the
pagination have something to show. "Nova busca" finishes after 4 seconds with fake companies.

## 11. Risks

1. **Ban of the sending number** (high, accepted by the owner for OBS's number, ADR). Mitigations: 10 a
   day, one message per lead, spread over the window with random pauses, business hours, rotating
   variants, permanent opt-out, auto-pause on disconnect, a spare chip and reconnect steps ready.
2. **Policy and legal** (medium): the WhatsApp Business Messaging Policy (23/09/2026) asks for opt-in on
   any channel, the Official API included (appendix A.2.3). Keep it the owner's own use, never sold or
   advertised.
3. **LGPD** (medium): legitimate interest needs a written balancing test, minimal data, the exit honored
   forever and a retention limit for leads that never answered (D8). The v1 plan had a required legal
   basis field; v2 has none on screen, so the LIA lives in the owner's records (D8).
4. **No exit line in the text** (medium): the suggested variants have no "responda SAIR"; the exit is
   detected from natural replies ("não quero", "pare"). Without an explicit line, people who want out
   tend to block or report instead, the trigger that weighs most for a ban (D4).
5. **Bot talking to bot** (medium, seen in the v1 video): a lead's own AI answers and the two agents keep
   talking. Handled by the OBS agent prompt and the help request flow; watch the first campaigns.
6. **Attendance regression** (low): nothing touches `processTurn` or n8n; the only shared piece is
   `lib/envio-ativo.ts`, which belongs to the agenda branch and must be merged first.
7. **Google terms** (medium): scraping Google Maps through Apify is outside Google's terms (appendix
   A.2.1); the source module keeps a switch to Places API possible.

## 12. Owner decisions (open, each with a recommendation)

- **D1 Route.** Recommendation: `/campanhas`, admin only (`adminDaPagina`), reached by a "Campanhas"
  link in the central header, not in the tenants' menu. Alternative: a tab inside `/clientes`.
- **D2 Days of the week.** The brief fixes 8h to 18h but not the days. Recommendation: Monday to
  Saturday (small businesses work Saturday; Sunday reads as intrusive). The prototype uses every day
  until he decides.
- **D3 Cron cadence and Vercel plan.** Recommendation: every 5 minutes, which needs Vercel Pro; if the
  project is on Hobby, decide between upgrading or an external scheduler (never n8n for this, by the
  owner's rule).
- **D4 Stop phrases and exit line.** Recommendation: keep the list "não quero", "pare", "parar", "para de
  mandar", "sair", "remover", "não tenho interesse"; and consider a short exit sentence at the end of the
  variants (risk 4).
- **D5 Minimum sample** for "ainda pouco para comparar". Recommendation: 30 sends per line.
- **D6 Auto-pause.** Recommendation: pause when the number disconnects, and when more than 2 leads ask to
  stop in the same day.
- **D7 Places per search.** Recommendation: 50 per search (about US$ 0.08 to 0.25 at the listed price;
  confirm on the first real run).
- **D8 LGPD.** Recommendation: write the legitimate interest balancing test once before the first send,
  and delete leads that never answered after 12 months (the opt-out mark stays).
- **D9 Score weights and ICP segments** (`PESOS_PROVISORIOS`, `SEGMENTOS_DO_ICP`, marked provisional).
  Recommendation: keep them until the first 100 sends, then compare the reply rate by score band.

Decided on 29/10/2026: go ahead despite the opt-in policy; the sending number is a simple campaign field
(OBS's own today, ban risk accepted); at most 10 per day; one message only; Apify as the source; the v2
structure of this plan.

## Appendix A: sources and research (v1, 29/10/2026)

Kept as evidence. Its recommendations on touches, the site audit as hook, angles and the voice fields
are superseded by v2 (section 2).

### A.1 Sources read

#### A.1.1 Video (Rafael Melgaço, "Prospecção com IA agora audita o site da empresa e aborda o lead", 23/10/2026, 18 min)

The transcript could NOT be fetched (YouTube returns an empty caption body without a session token).
What follows is from the video page (description written by the author and chapter list), confirmed
on 29/10/2026 with the full description read in the owner's browser.
- Flow: connect a WhatsApp by QR ("use a disposable or warmed number, never the company's official
  one, prospecting uses a non official API"); turn on business hours and human activity simulation;
  type segment and city (example: real estate agencies in Divinópolis, MG); paste an **Apify** key;
  set "voice and vocabulary" (your name, what you do, your edge); search; each company gets a **score
  ("how much information the AI found")** and a **site audit**; prepare the approach with a published
  SDR agent, connection, funnel and entry/qualified stages; cap the sends. The search also brings
  **e-mails and social profiles**; "send protection" means business hours, human activity simulation
  and an automatic **warm up counted from the number's registration date**.
- The author's explicit warning: **never use the company's official number**, because prospecting runs
  on a non official API. The owner decided to leave the number as a simple field and use OBS's anyway
  (section 10.1).

**From the full transcript** (Tactiq, read on 29/10/2026; the video is narrated in Portuguese, the file
is an English translation):
- Each company comes with its **Google rating and reviews** ("the AI reads each review"). Every search
  has three switches: **enrich with e-mails and social profiles from the site**, **audit the site**,
  **generate a message preview**.
- The audit shows both sides: what the site HAS (WhatsApp, social profiles, title, Google description,
  tab icon) and what is MISSING (clickable phone, contact e-mail, address with map, business photos).
  The author suggests adding **objections and the answer to each**.
- The campaign: a published SDR agent (bubble size, knowledge base, a calendar to book the meeting),
  the **connection** (which WhatsApp; "multi-number soon, spreading the sends"), funnel and stages
  (entry "new", qualified), **"what to offer and how to start"**, a **qualified criterion** ("confirmed
  the need and there is interest in a diagnostic call or demo"), what the campaign sells, max per 24 h,
  interval in minutes, **the company enters the funnel only when approached** (recommended), and the
  **stop offer in the first message (recommended) or delayed to the second**.
- Tracking states: **no valid Brazilian phone** (not contacted), in queue, reached, replied, asked to
  stop, qualified. In the inbox, a **side panel with everything found about the company**, and each AI
  answer shows its **source** (prompt part or knowledge base chunk).
- His first message: name and company, "found you through a public search of companies", the gap on
  the site, "can I send you a quick diagnostic?".
- On privacy he argues the data is public and "we approach companies, not individuals". [INFERENCE]
  Not enough under LGPD for a sole proprietor's number (section 3.2): keep the LIA.
- In the demo, a lead was answered by **the lead's own AI**: the two bots talked to each other. New
  risk for us (section 10, D21).
- Numbers in the video: **5 sends per 24 h, 3 minutes apart**, "reply PARAR" exit. **50 companies in
  about 3 minutes for US$ 0.33 (about R$ 1.65)**, about 3 cents each; Apify gives US$ 5 credit per
  month; message generation also spends AI credit.
- The new piece: it opens each company's site, audits what it has and lacks (clickable phone, address,
  map) and uses the gap as the argument of the first message. Chapter "Prospectar empresas do Google
  invade privacidade?" exists; its content was not available.

#### A.1.2 Repository `melgarafael/DeskcommCRM` (MIT, read at commit eeb3b9c, 29/10/2026; no code copied)

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
- Do better: (1) **OBS sells both sites and Atenda**, so the site audit is our natural hook too, and it
  is the PRIORITY of Phase 1 (section 7, step 2). We read two things per company and let them pick the
  offer: the **site** (no site, only a social profile, offline, or missing clickable phone, WhatsApp
  button, address, map, mobile version, https) and the **attendance** (hours that end early or skip
  weekends, many reviews means many conversations, a site that already pushes wa.me). Each lead gets an
  angle, "Site", "Atenda" or "Site e Atenda", and the first message has one version per angle, citing
  the concrete gap. Their score measures how much information was found; ours measures fit and
  opportunity, with the reasons on screen. (2)
  The owner **approves the day's batch** before anything leaves (they send fully automatic after
  setup). (3) The reply lands in a product that is itself the demo: the lead talks to an Atenda AI.

### A.2 Market research (with sources; prices in USD are list prices seen on 29/10/2026)

#### A.2.1 Where the leads come from

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

#### A.2.2 LGPD

- B2B prospecting of a business phone usually rests on **legitimate interest** (LGPD art. 7, IX). The
  ANPD guide on legitimate interest (published 02/02/2024) asks for a **balancing test** (simplified
  model in its annex II) weighing purpose, necessity, the data subject's expectation and safeguards;
  public availability alone does not settle it. A sole proprietor's number is personal data.
- Safeguards that make the test pass: minimal data (company name, segment, city, business phone),
  purpose stated in the first message, easy exit honored at once and forever (suppression list),
  retention limit for leads that never answered, no sensitive data. Deskcomm makes the LIA reference a
  required field; we should too.

Sources: gov.br/anpd guide; mattosfilho.com.br and bmalaw.com.br summaries.

#### A.2.3 WhatsApp: the finding that changes the framing

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

#### A.2.4 Cadence and first message

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

#### A.2.5 Competitors (what they offer, what to take)

- **Kommo**: Salesbot plus WhatsApp broadcast with delivery, read and click report. Take: the
  per-campaign report by timestamps.
- **RD Station Marketing**: WhatsApp messages via the Official API as an add-on in all plans, pitched
  as "sem risco de bloqueio"; RD Conversas for attendance. Take nothing for cold prospecting (it
  targets opted-in bases).
- **Deskcomm**: the full flow above (search, audit, SDR agent, caps). Closest to what the owner wants.
- **Sellflux, Zappy**: not verified (searches returned nothing usable about their sending features);
  left out rather than guessed.

