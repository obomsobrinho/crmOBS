# Product guardrails: no mass messaging over QR, no own agenda, no automation builder
- Date: 2026-08-26
- Status: Accepted (with explicit owner exceptions below)
- Area: product

## Context
The project sits on a QR (Baileys) connection, where mass sending is the documented ban scenario. Research and competitor data: `docs/estrategia-2026-07.md` (its old prescriptive conclusions, vertical in clinics, sell now, single plan, "it is not a CRM", are superseded; `docs/proximos-passos.md` wins on conflict).

## Decision
- NEVER build mass sending on top of the QR connection. NEVER write marketing that advertises mass sending, "do not pay the Meta API" or ban protection (an e2e locks the risk notice wording).
- NEVER build a complete own agenda nor a visual automation builder (becomes a product that requires consulting). Agenda left the "do not build" list on 26/08/2026: it is the first development AFTER the beta, but INTEGRATING Google Calendar; the expensive part is not the screen but giving the agent a tool (function calling in `/api/agent`, which does not exist today).
- Active messaging stopped being a total prohibition on 26/08/2026 (conscious owner decision, risk weighed): appointment reminders and birthday messages WILL be built and the menu promises "Follow-up". Still valid: only for contacts with a recent conversation, never cold or imported lists; daily cap and random interval, never bursts; easy exit ("responda SAIR"); born channel agnostic (the strongest argument to migrate to the Official API).
- SINGLE EXCEPTION (29/09/2026, conscious owner decision): the owner's own PROSPECTING inside `/admin`, to find customers for the CRM. Only his user, never a tenant feature, on a dedicated number (never the one serving customers), with daily cap and interval. It does not reopen the rule for customers nor bring Campanhas back. Details in the "Plano vigente" of `docs/proximos-passos.md`.
- Positioning anchors are ZapResponder (price floor) and HelenaCRM (ceiling), NOT Kommo/RD Station/Blip/Zenvia. This does not mean the field has two competitors: the full list is in `docs/estrategia-2026-07.md` (R$ 87 to R$ 1,000 band). Never answer "the competitors are ZapResponder and Helena" without opening that list.

## Consequences
- On 01/10/2026 Meta starts charging service messages on the Official API: any migration math needs variable cost, not zero.
