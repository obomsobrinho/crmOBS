---
paths:
  - "lib/agent*.ts"
  - "lib/guardrail.ts"
  - "lib/handoffs.ts"
  - "lib/avisos.ts"
  - "lib/horarios.ts"
  - "lib/rag.ts"
  - "lib/pedidos.ts"
  - "lib/crm.ts"
  - "app/api/agent/**"
  - "app/api/playground/**"
  - "app/api/conversations/**"
  - "app/api/send/**"
  - "app/api/clients/**/agent-config/**"
  - "app/api/clients/**/notify-target/**"
  - "app/(app)/pedidos/**"
  - "components/Playground.tsx"
  - "components/AgentTestDrawer.tsx"
  - "components/Pedidos.tsx"
  - "components/MessageComposer.tsx"
  - "components/HandoffCard.tsx"
---
# Agent, prompt, handoff, notices

## Prompt assembly
- Build the persona ONLY through `compilePersona` (`lib/agent-prompt.ts`): the `agent_config` or advanced `persona` -> persona dispatch and the `LIMITS.persona` check exist once. It returns a reason (`campos`/`vazio`/`longo`), no HTTP inside; each route maps it to 400. The PUT of agent-config, the playground POST and `processTurn` all call it.  (why: docs/adr/2026-09-17-compile-persona-single-dispatch.md)
- The persona is assembled on read, each turn, by `personaDoTenant` (`lib/agent-turn.ts`). `clients.persona` is a record and fallback only. n8n does NOT read the persona.  (why: docs/adr/2026-09-17-persona-assembled-at-read.md)
- Any change to the prompt base reaches ALL tenants on the next message, unreviewed. Run `npm run test:e2e:ia` green before deploying it.  (why: docs/adr/2026-09-17-persona-assembled-at-read.md)
- `diagnostics.personaOrigem` (`montada`, `montada_longa`, `salva`, `fallback`, `override`, `nenhuma`): `salva` in production is an ALARM (assembly failed, frozen text served). It is not stored in `agent_turns`.  (why: docs/adr/2026-09-17-persona-origem-diagnostic.md)
- Three layers: base opens, customer content fenced by `--- início/fim ---`, base closes with the contract (`### OUTPUT`) as the LAST block. Base is mold and rule, customer is value: never put tenant values (name, hours) in base text. Customer rules the manner of attending (address, nickname, tone); base rules the contract.  (why: docs/adr/2026-08-22-prompt-three-layer-structure.md)
- The base tail is ONE function, `buildBaseTail()` (`lib/agent-prompt.ts`), used by both modes (`PRECEDÊNCIA`, `QUANDO CHAMAR UM HUMANO`, `CONDUÇÃO DA CONVERSA`, `ANTI-MANIPULAÇÃO`, `### OUTPUT`). `agentName`/`companyName` stay OPTIONAL in it.  (why: docs/adr/2026-08-22-base-tail-single-function.md)
- Advanced mode: the server always strips base sections (`stripBaseTail`) and reattaches the tail (`buildAdvancedPersona`); the UI WARNS what is removed (`removed`), never deletes silently.  (why: docs/adr/2026-08-22-advanced-mode-tail-always-reattached.md)
- Never reorder the prompt prefix in `lib/agent.ts` (persona, RAG, AGORA, operator guidance) without redoing the cache math. Cache thresholds: `CACHE_MIN_TOKENS`/`CACHE_SAFE_TOKENS` in `lib/agent-prompt.ts`; the `/agente` warning uses the upper one.  (why: docs/adr/undated-prompt-cache-measured-and-threshold.md)
- Date/time rules live in the base (`CONDUÇÃO`), valid in both modes; `operatorBlock` (`lib/agent.ts`) must receive the time and state the day. "Already passed or not" is computed in code (`lib/horarios.ts`), never by the model. Never say the agent does not know the date (`### AGORA`).  (why: docs/adr/2026-09-30-dates-and-times-in-base-prompt.md)
- Calendar arithmetic (weekday of "amanhã", open or closed, already closed today) is code: `calendarioBlock` (`lib/horarios.ts`) goes after AGORA every turn, fed ONLY by registered hours (`horarioCadastrado`, never `DEFAULT_HOURS`; none means dates only). Never ask the model to work it out from the hours section.  (why: docs/adr/2026-10-05-turn-calendar-computed-in-code.md)
- Periods follow each business's registered hours (`PERIODOS_DO_DIA`/`horariosDoPeriodo`, `lib/horarios.ts`: morning until 11h, afternoon 13h to 17h, evening from 18h, cut by the day's hours, today only what has not started; no registered hours means no list), stated in `### CALENDÁRIO`; a period alone is `none` and the agent offers those hours with the day. When a help trigger happens, `pausar` in that reply without collecting more data.  (why: docs/adr/2026-10-06-schedule-needs-time-and-summary-keeps-agreements.md)
- A fix found in testing that is about HOW to attend (not one tenant's content) goes in the base (`buildBaseTail`), never only in one tenant's prompt: it must reach every tenant automatically. If a tenant text could contradict it, list it in `### PRECEDÊNCIA`. Examples: a meeting is `agendar` only with day AND time (period alone means ask the time); someone asking for a person NOW is `pausar`, never a confirmation; the summary keeps what was agreed and what did not happen.  (why: docs/adr/2026-10-06-schedule-needs-time-and-summary-keeps-agreements.md)
- `LIMITS.persona` counts the WHOLE prompt (16,000, warn 13,600). When the base grows, check headroom: a tenant over the limit silently serves the saved text.  (why: docs/adr/2026-09-30-dates-and-times-in-base-prompt.md)
- Save is publish: every `PUT /agent-config` writes an `agent_publications` row (append-only record, not source of truth). Restoring loads the version into the form; it does not write.  (why: docs/adr/2026-08-22-save-is-publish-agent-publications.md)
- Prove AI safety against the real brain in `dryRun`; a guardrail rule counts as proven only once seen firing (use a sabotaged persona). Every manipulation attempt (prank, impersonating the owner, extracting data) must open a handoff (`pausar`).  (why: docs/adr/2026-08-28-ai-security-proven-with-real-brain.md, docs/adr/2026-09-11-ia-suite-paid-and-opt-in.md)
- Never state a thing as certain while it is unproven (real audio transcription was never proven with a real voice).

## processTurn and guardrail
- `processTurn` (`lib/agent-turn.ts`, server-only) is the single turn orchestrator for `/api/agent` and the bench. No turn logic in a route.  (why: docs/adr/undated-processturn-guardrail-handoff-coach.md)
- `dryRun` persists nothing. `personaOverride` is honored ONLY in `dryRun` (the guard lives in `processTurn`, not the route). A persona from outside never serves WhatsApp.  (why: docs/adr/2026-08-22-playground-tests-config-in-edit.md)
- Guardrail (`lib/guardrail.ts`, pure) checks the finished reply: blocks price, link, phone outside the sources (persona + RAG + operator guidance) and strong promises; on failure degrade to `pausar`.  (why: docs/adr/undated-processturn-guardrail-handoff-coach.md)
- `logTurn` writes one `agent_turns` row per processed turn: best-effort, never throws, never stores message content; filter `dry_run` out of operation metrics. Plan conversation limits are NOT counted from it (use `chat_messages`, 24h window).  (why: docs/adr/undated-agent-turns-metering.md)
- Agent switch: `agent_enabled` (on/off) and `agent_published_at` (first activation, NEVER cleared). Either barring means `processTurn` returns 200 with empty `messages` (never an error) before the model, outside `dryRun`; n8n still records the customer message.  (why: docs/adr/2026-08-28-agent-switch-two-columns.md)

## Handoff and help requests
- Handoff NEVER pauses and NEVER mutes the AI: it answers one sentence saying what it will check (`agent_config.handoffNotice`), sets `handoff_at` and keeps attending. Pause means only: a human took over, or someone flipped the switch.  (why: docs/adr/2026-08-20-handoff-does-not-pause-or-mute-ai.md)
- AI and a person never attend the same conversation. Assigning pauses the AI; turning the AI on drops the assignee on ALL three paths (header switch, orient/coach, `/api/conversations/resolve`). Releasing does NOT turn the AI on. Display rule: `quemAtende` (`lib/crm.ts`).  (why: docs/adr/2026-09-19-ai-and-person-never-attend-same-conversation.md)
- Every help request is a `handoffs` row; a conversation may have several open, resolved oldest first. ALWAYS close through `fecharPedido` (`lib/handoffs.ts`): closes ONE and recomputes `handoff_at`. Doors: `/orientar`, `/resolve`, `/api/send` with `pedidoId`. `handoff_at` is cleared only by service_role routes.  (why: docs/adr/2026-09-27-handoff-queue-and-handoffs-table.md)
- Only `action = pausar` (and the guardrail degrading to it) opens a request. `agendar` never does (the meeting notice is n8n "Notifica grupo").  (why: docs/adr/2026-09-30-schedule-does-not-open-help-request.md)
- `processTurn` opens requests and closes none; consuming an instruction never closes one. The `retomada` turn NEVER opens one, also in `dryRun`.  (why: docs/adr/2026-09-27-orientar-resolves-request-immediately.md, docs/adr/2026-09-29-help-request-lives-in-the-test-conversation.md)
- `POST /api/conversations/orientar` closes the request (`ia`), turns the AI on, drops the assignee and runs a `retomada` turn (history ends with `DEIXA_RETOMADA`, `lib/agent.ts`). The reply goes through n8n "CRM Envio IA" (`N8N_IA_SEND_WEBHOOK_URL`), never manual send (it records `manual` and pauses the AI). Failure falls back to `pending_instruction`.  (why: docs/adr/2026-09-27-orientar-resolves-request-immediately.md)
- Resolved requests enter the prompt via `pedidosResolvidos` as `### PEDIDOS DE AJUDA JÁ RESOLVIDOS` (2 most recent, with day and hour). Never as a `system` note mid-history; never the word "orientação" in the line.  (why: docs/adr/2026-09-27-resolved-requests-enter-the-prompt.md)
- Every help request stores a reason (`handoffs.motivo`) from ONE list, `lib/motivos.ts`; `motivoDoPedido` turns the model choice into the stored value (`seguranca` only when the guardrail blocked, anything else outside the list is `null`). The list, the output schema enum and the DB `check` change together. The prompt lists only the keys (descriptions live in the schema).  (why: docs/adr/2026-10-06-help-request-reason.md)
- Whether a request is new is the AI call (`pedido_novo` + `### PEDIDOS DE AJUDA EM ABERTO`), with the code safety net `mesmoAssunto` (no shared subject word means it enters the queue). Err toward the duplicate; never remove the net.  (why: docs/adr/2026-09-27-handoff-queue-and-handoffs-table.md)

## Notices (WhatsApp)
- `notify_group_jid` is the single destination of ALL notices: a group `@g.us` chosen from a WhatsApp list, or a number `<digits>@s.whatsapp.net`; never the agent own number (route answers 400). Rules in `lib/avisos.ts`. Each notice type has exactly one sender.  (why: docs/adr/2026-09-29-notify-destination-single-target.md)
- The help-request notice leaves `processTurn` only for a NEW request with `action = pausar` (`entraNaFila`), via `after()` from `next/server`, best-effort (`diagnostics.avisoAgendado`); text is `textoDoAviso`. Never notify from both `processTurn` and n8n for the same event.  (why: docs/adr/2026-09-29-whatsapp-notices-from-processturn.md)
- A phone with DDD 00 never generates a notice (`telefoneImpossivel`); never remove the guard. "Abrir" link: `https://{VERCEL_PROJECT_PRODUCTION_URL}/pedidos?abrir={id}`; off Vercel the line is dropped.  (why: docs/adr/2026-09-29-whatsapp-notices-from-processturn.md)
- The notices number is never a conversation: `ehNumeroDeAvisos` on every list/count, `grafiasDoNumeroDeAvisos` in SQL counters, `chaveTelefone` to compare phones (ninth digit).  (why: docs/adr/2026-09-29-numero-de-avisos-is-never-a-conversation.md)

## Bench and Pedidos screens
- Bench = `components/Playground.tsx` (shared by the `/agente` drawer `AgentTestDrawer.tsx` and `/montagem`). It tests the config IN EDIT. `POST /api/playground` takes the RAW config (`mode` + `config` or `persona`) and the server compiles it; never accept a browser-compiled persona; incomplete config returns 400 with the fields. The `/playground` route stays 404.  (why: docs/adr/2026-08-22-playground-tests-config-in-edit.md)
- Bench: one bubble per item of `messages`, but `content` stays the JOIN. Audio is transcribed by `POST /api/playground/transcrever` (owner-only, `whisper-1`, no `language`) and the TEXT goes to the agent, never raw audio. `diagnostico={false}` hides diagnostics only in the assembly.  (why: docs/adr/2026-09-26-playground-as-conversation.md)
- Bench help request reuses the real `MessageComposer` with the `pedido` prop; never a second request UI. The queue decision is `diagnostics.pedidoNaFila`, computed on the server; the bench sends `pedidosAbertos`.  (why: docs/adr/2026-09-29-help-request-lives-in-the-test-conversation.md)
- With an open request `MessageComposer` shows it on top and opens on "Orientar a IA" (amber); the selector toggles only orient/Responder; "Resolvido" beside it. `HandoffCard` draws only the closed (gray) line. No "Eu respondo", no "Voltar ao pedido".  (why: docs/adr/2026-09-27-handoff-queue-and-handoffs-table.md)
- `/pedidos` detail is a request SHEET, never a chat. Tabs Abertos (oldest first) and Resolvidos (30 days, newest first). Orient and Resolvido call `/orientar` and `/resolve`; no new endpoint. Rule in `lib/pedidos.ts`. Login never redirects back to the requested link.  (why: docs/adr/2026-09-30-pedidos-detail-is-a-request-sheet-not-a-chat.md)
- `/pedidos` reads ONLY through `lib/pedidos-fonte.ts` (server page and browser): 10 per tab with infinite scroll, server search with debounce, counts from `pedidos_contagens`, and a `handoffs` event fetches ONE conversation queue or one request, never the lists. Order and search live in SQL and in `lib/pedidos.ts`; keep them equal.  (why: docs/adr/2026-10-02-pedidos-paginated-single-source.md)
- The `msg1 | msg2` storage (n8n joins a multi-message turn with `" | "` in one row) is a known debt, deferred on purpose because it is hot flow. Split on `" | "` when displaying; do not change the storage without the owner.
