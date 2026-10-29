# Owner prospecting (Campanhas): approved daily batch over a dedicated QR number, in a separate tenant
- Date: 2026-10-29
- Status: Proposed (owner has not decided; open decisions D1 to D17 in `docs/plano-campanhas.md`)
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

## Decision (proposed)
- Main lane: the owner approves each day's batch; a scheduler sends at most one approved message per
  tick inside a business hours window, with a random pause, through `lib/envio-ativo.ts`. Up to 3
  touches (days 0, 3, 7); any reply, SAIR, block or failure stops the sequence. Exit line in the first
  message, deterministic. Global suppression list; a phone is approached once in its life.
- Conversations live in a separate tenant ("OBS Prospecção") with the dedicated chip and an SDR prompt,
  so no multi-number support is needed and a ban costs only that tenant's connection.
- Screen at `/campanhas`, admin only (same guard family as `/clientes`), API under
  `/api/admin/campanhas/*`, service role only, actions logged in `admin_acoes`.
- The reply is detected by reading `chat_messages`, never by changing `processTurn` or n8n.
- Phase 0 with zero code: the owner starts this week with the separate tenant and manual
  "criar contato e iniciar conversa".

## Consequences
- The tenant rules do not change: active messaging for tenants stays "recent conversation only"; the
  tenants' menu never shows Campanhas.
- New tables (`prospeccao_campanhas`, `prospeccao_leads`, `prospeccao_envios`, `prospeccao_exclusoes`)
  with RLS on and no user grants; outgoing touches recorded with `message_type = 'prospeccao'`, which
  must stay out of "who replied" (`lib/mensagem.ts` and its SQL copies), like `lembrete`.
- Depends on the agenda branch (`lib/envio-ativo.ts`) being merged first.
- Docs to correct when accepted: `docs/proximos-passos.md` ("Não construir" item on campaigns) and
  `docs/estrategia-2026-07.md` (1,000 free service messages per number per month is now on Meta's page).

## Alternatives considered
- Fully automatic cold WhatsApp (Deskcomm): rejected for now; 10 a day does not need it and approval is
  the quality control.
- Official API marketing templates: rejected for cold prospecting; paid, Meta setup, and still against
  the opt-in policy, with the penalty on the business portfolio.
- Lead starts the chat (e-mail, Instagram, visit with a wa.me link): compliant and kept as a parallel
  lane in phase 2.
