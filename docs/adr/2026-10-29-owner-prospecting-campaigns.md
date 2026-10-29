# Owner prospecting (Campanhas): approved daily batch on OBS's own number, at most 10 a day
- Date: 2026-10-29
- Status: Proposed. Decided by the owner on 29/10/2026: go ahead despite the opt-in policy, OBS's own
  number and account, cap of 10 per day. Still open: D3 to D6 and D8 to D20 in `docs/plano-campanhas.md`.
- Area: product, admin

## Context
The owner wants to bring companies to Atenda by approaching about 10 leads a day, from inside Atenda,
as a feature only for OBS. `docs/adr/2026-08-26-no-mass-messaging-over-qr.md` already carries the
exception (29/09/2026): his own prospecting in the central, his user only, dedicated number, daily cap
and interval. Nothing is built.

Evidence gathered on 29/10/2026 (sources in the plan, section 3):
- WhatsApp Business Messaging Policy (updated 23/09/2026) requires the recipient's opt-in to be
  contacted, on any channel. The Official API does not make a cold first message legal; the earlier
  line "Campanhas only comes back with the Official API, where it is legal" is wrong for cold contacts.
- Official API marketing in Brazil costs about US$ 0.0625 per message; new business portfolios start
  at 250 business initiated conversations per 24 h.
- QR: Baileys issue 2707 (error 463 "Reachout Timelock") is a temporary ban for starting chats with
  numbers that never wrote, which is this use case. No warm up makes a number immune.
- Deskcomm (MIT, read at eeb3b9c) ships the same feature fully automatic after setup: Apify search,
  site audit, SDR agent, 1 to 50 per day, 5 minute minimum interval, cold caps 5/13/25/50 by number
  age, deterministic "responda PARAR" footer, required legal basis reference, unique phone per org.
  Their video used 5 sends per 24 h, 3 minutes apart, and 50 companies for US$ 0.33.
- Google Places API: up to 1,000 free Enterprise Text Search calls a month covers about 600 candidates;
  its policies forbid storing content other than the place id.

Owner's decision (29/10/2026, literal): "vamos usar o da obs mesmo, a campanha vou rodar com no maximo
10 contatos por dia". The agent had recommended a dedicated chip in a separate company; the owner chose
OBS's own number and account.

## Decision (proposed, with the owner's three decisions)
- Main lane: the owner approves each day's batch; a scheduler sends at most one approved message per
  tick inside a business hours window, with a random pause, through `lib/envio-ativo.ts`. **At most 10
  approaches per day** (first messages and follow-ups together), enforced in `lib/prospeccao.ts`
  (`TETO_MAXIMO_DIARIO`) and by the table check. Up to 3 touches (days 0, 3, 7); any reply, SAIR, block
  or failure stops the sequence. Exit line in the first message, deterministic. Global suppression
  list; a phone is approached once in its life.
- **Site audit is the hook and the priority of Phase 1** (OBS sells sites and Atenda): each lead gets a
  deterministic x-ray of its site (no site, only a social profile, offline, or which of clickable phone,
  WhatsApp button, address, map, mobile version and https are missing; the server opens the page once,
  with guards) and of its attendance (short hours, reviews, selling on WhatsApp). `anguloDaAbordagem`
  picks "Site", "Atenda" or "Site e Atenda" among the campaign's offers, and the first message has one
  version per angle citing the concrete gap; no fact means the owner writes it by hand. The owner's
  "voice" (name, company, what he does, edge) feeds the texts and, in Phase 2, the AI draft.
- **Sent from OBS's own number; conversations live in the OBS tenant**, answered by the OBS agent
  prompt, which must learn to handle prospect replies before the first send.
- Screen at `/campanhas`, admin only (same guard family as `/clientes`), API under
  `/api/admin/campanhas/*`, service role only, actions logged in `admin_acoes`.
- The reply is detected by reading `chat_messages`, never by changing `processTurn` or n8n.
- Phase 0 with zero code: the owner starts this week from OBS's `/contatos` ("criar contato e iniciar
  conversa"), up to 10 a day.

## Accepted risk
A ban of OBS's main number (owner's decision, 29/10/2026), against the agent's recommendation and
the explicit advice of the Deskcomm author in the video ("never the company's official number", since
prospecting runs on a non official API). It stops OBS's own attendance on that number
until a new one is connected, silences OBS's notices and breaks the suites that run on the OBS tenant
(`test:e2e:n8n`, login suites) until then; no third party can unban. Remaining mitigations: the cap of
10, one message at a time with a random pause, business hours only, every text approved, exit line and
permanent suppression, sequence ends on any reply, 3 touches at most, mobile numbers only, auto-pause
on disconnect and on a SAIR threshold, a spare chip and written reconnect steps ready (plan, 10.1).

## Consequences
- The tenant rules do not change: active messaging for tenants stays "recent conversation only"; the
  tenants' menu never shows Campanhas.
- Prospect conversations share the OBS inbox, funnel, panel numbers and AI usage; they are told apart
  by `message_type = 'prospeccao'`, which must stay out of "who replied" (`lib/mensagem.ts` and its SQL
  copies), like `lembrete`.
- New tables (`prospeccao_campanhas`, `prospeccao_leads`, `prospeccao_envios`, `prospeccao_exclusoes`)
  with RLS on and no user grants; `prospeccao_campanhas` goes into `TABELAS_DO_CLIENTE`.
- Depends on the agenda branch (`lib/envio-ativo.ts`) being merged first.
- Docs to correct when accepted: the prospecting exception in `CLAUDE.md` and in the 26/08 ADR (OBS's
  own number and cap 10 instead of "dedicated number"), `docs/proximos-passos.md` ("Não construir" item
  on campaigns) and `docs/estrategia-2026-07.md` (1,000 free service messages per number per month is
  now on Meta's page).

## Alternatives considered
- Dedicated chip in a separate company ("OBS Prospecção"): recommended by the agent to keep a ban away
  from the main number; declined by the owner on 29/10/2026.
- Fully automatic cold WhatsApp (Deskcomm): rejected for now; 10 a day does not need it and approval is
  the quality control.
- Official API marketing templates: rejected for cold prospecting; paid, Meta setup, and still against
  the opt-in policy, with the penalty on the business portfolio.
- Lead starts the chat (e-mail, Instagram, visit with a wa.me link): compliant and kept as a parallel
  lane in phase 2.
