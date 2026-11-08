# Auto-reply lock for campaign conversations (menu bots)
- Date: 2026-11-07
- Status: Accepted (owner's go on 07/11/2026, "Aprovado, pode fazer"; not deployed, the owner sees it first)
- Area: agent-ai, admin, product

## Context
A campaign can land on a number answered by a menu bot ("Digite 1 para orçamento, 2 para horários, 3
para falar com um atendente"). In the prompt rehearsal of 07/11/2026 (prompt v12 candidate, 3 runs, 4
rounds of prompt changes) the agent:
- answered every bot message, so the two of them would loop and burn tokens;
- opened a help request (`pausar`, motivo `pessoa`) when IT asked the bot for an attendant: the fixed
  base rule "a pessoa pedir pra falar com alguém do time" beats the tenant text, even with "nunca é
  pausar" in the persona. In production that is a help request and a WhatsApp notice to the owner for
  every bot message;
- could not stay silent: the output contract requires at least one message.
The campaign cron also counted the bot's menu as the lead's reply ("respondeu").

## Decision
1. **Rule in one pure module, `lib/resposta-automatica.ts`.** A received message is an auto-reply when at
   least 2 of 3 signals hold (owner's criteria, 07/11/2026):
   - (a) fast: it arrives up to 5 s after the DELIVERY of our last message (campaign, AI or team);
   - (b) menu or automation pattern: 2 or more numbered options ("1 para", "1)", "1 -", "1.", 1️⃣) or one
     of the owner's words: "digite", "opção", "aguarde", "mensagem automática", "retornaremos";
   - (c) the same normalized text already arrived in the conversation, only for texts of 12 or more
     normalized characters (a person repeats "oi" or "ok"; a menu is long).
2. **Delivery, not the row time, for (a).** n8n saves the AI reply ("Salva chat_messages") BEFORE sending,
   and each "Evolution send" has `delay: 2500` plus the "1s" wait between messages. A bot answering our
   second message lands ~6 s after the row, so a plain "5 s after the row" would miss it. The window is
   row time + 2.5 s per message + 1 s between them + 5 s (`ATRASO_POR_MENSAGEM_MS`,
   `PAUSA_ENTRE_MENSAGENS_MS`; they mirror the n8n nodes and change with them). The campaign
   `enviado_em` is written when the lead is claimed, before the send (no delay), and the window opens 1 s
   before our time for clock skew between n8n and the database. The received time is n8n's arrival stamp
   (`recebidoEm`), taken before the 15 s sliding debounce, so the debounce does not distort it. If (a)
   proves unreliable in production, the alternative is to store the Evolution send acknowledgement time
   (`messageTimestamp` of "Evolution send") and measure from it; (b) plus (c) already catch a repeated
   menu without (a).
3. **Lock in `processTurn`, before RAG and model, only in campaign conversations** (`origem` from
   `origemDaCampanha`). A whole batch of auto-replies: the first time the turn returns one fixed message,
   `PEDIDO_AO_ROBO` ("Queria falar com quem cuida do atendimento aí. Pode me responder por aqui quando
   der."); once that message is in the history window, silence (empty `messages`, like the other gates).
   Never a help request, never a stage move, no tokens. A batch with any message that is not an
   auto-reply attends normally, with the history.
   Why campaign only: a false positive there sends one odd line to a prospect; a false positive in a
   tenant's normal conversation silences a real customer, which is an attendance bug. Inbound
   conversations are started by the customer, where menu bots are rare. Widening it is the owner's call.
4. **Measured in `agent_turns`**: `silenced = 'resposta_automatica'`, with `messages_sent` 1 (fixed
   message) or 0 (silence); `diagnostics.respostaAutomatica` = `pedido` | `silencio`. No migration
   (`silenced` is free text).
5. **The cron uses the same rule.** `mensagensRecebidas` (`lib/prospeccao-cron.ts`) now reads our rows too
   (`bot_message`, marked `nossa`), and `respostasDosEnvios` (`lib/prospeccao.ts`) judges each phone's
   conversation with `respostasAutomaticas` (campaign sends count as ours): an auto-reply never sets
   `respondeu_em`; a stop request (SAIR) always counts.
6. The bot instructions left the v12 prompt candidate (they became code).

## Consequences
- With (a) widened by the delivery time, a person who answers within ~11 s of a two-message AI reply AND
  writes a menu word (e.g. "aguarde um minuto") gets the fixed line once; their next message attends
  normally. Accepted for campaign conversations only.
- After 24 more bot rows the fixed message leaves the history window and could go once more.
- The menu option ("3") is no longer chosen: the first answer to a bot is the fixed message.

## Evidence
- Rehearsal of 07/11/2026 without the lock (`scripts/ensaio-do-prompt.mjs`): "Caiu em bot" failed 3/3 in
  every round (pausar on the request, replies to every repeated menu).
- With the lock (scenario timings of 2 s, `segundos` in the scenario): 3/3, fixed message then silence,
  no model call on the four bot messages.
- Unit tests: `e2e/resposta-automatica.design.spec.ts`.
