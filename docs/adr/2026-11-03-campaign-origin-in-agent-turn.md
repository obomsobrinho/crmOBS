# Campaign origin in the agent turn; API sends never pause the AI
- Date: 2026-11-03
- Status: Accepted (owner's go on 03/11/2026, before the first real campaign of 04/11/2026)
- Area: agent-ai, n8n, product

## Context
Before the first real campaign two problems were found by reading code and the n8n export:
1. In `obs-atendimento`, every `fromMe` message goes `Direção` (outcoming) -> `Finalizado?` ->
   `Pausar IA (Franck digitou)`. If the campaign send (Evolution `sendText`, `lib/envio-ativo.ts`) came
   back as a `fromMe` webhook, the lead would reply into a paused AI.
2. The agent did not know a contact came from a campaign nor what was sent: the cron sends straight
   through Evolution and writes nothing to `chat_messages`, and `processTurn` read nothing from the
   `prospeccao_*` tables.

## Decision
1. **No n8n change.** The live workflow (n8n API, read 03/11/2026) has the same path as the export, but
   a message sent through the Evolution API never reaches the webhook as `messages.upsert`, so the pause
   node only runs for messages typed on a phone or WhatsApp Web. Evidence, from the n8n executions:
   - the agenda reminder of 02/11/2026 12:56:13 UTC (the same `enviarMensagemAtiva` the campaign uses)
     produced no execution at all: none between 11:46 and 13:30 UTC; its contact is still `ativa`;
   - the AI replies of 02/11 19:32 (OBS) and 03/11 13:15 (another tenant) produced no execution after
     the send, and that tenant got three AI replies in a row without a pause;
   - the `fromMe` executions that do exist carry text typed by a person (`messages.upsert`,
     `direcao: outcoming`).
   A message id registry for n8n to skip would add a lookup to every outgoing event for an event that
   does not happen. If Evolution ever starts echoing API sends, this decision is reopened (the symptom:
   an AI that answers once per conversation).
2. **`### ORIGEM DESTE CONTATO`** (`blocoDeOrigem`, `SECAO_ORIGEM`, `lib/prospeccao.ts`): when the phone
   (any ninth digit spelling) received a campaign message from THIS company, `processTurn` adds a facts
   only section after AGORA/CALENDÁRIO/AGENDA: the company started the conversation, date and time in São
   Paulo, the exact text, and the stop request date when there is one. No tone or conduct: that is the
   persona's job, and the persona can cite the section by name.
3. **The sent text enters the history** as an assistant line in its chronological place
   (`comEnvioDaCampanha`, `lib/mensagem.ts`), not as a `chat_messages` row. A row would need a new
   `message_type`, the three `painel_*` SQL copies of "who replied" and would make every unanswered send
   a conversation in the inbox and the panel, the day before the launch. The inbox showing the send is a
   separate decision for the owner.
4. The text is rebuilt, not stored: `textoParaLead(variant, lead name)`, the same function the cron
   sends with; variants only change while the campaign is a draft (`origemDaCampanha`,
   `lib/campanhas-origem.ts`, read only, best-effort: a failed read drops the section, never the turn).
5. **Prompt rehearsal** (`scripts/ensaio-do-prompt.mjs`): a candidate persona plus a JSON of scenarios
   run through `processTurn` in `dryRun` with the real model, the real tenant config and agenda, and a
   service client whose writes are no-ops (`scripts/ensaio/servico-somente-leitura.ts`), so neither
   `agent_turns` nor the month AI usage moves; the Evolution and n8n env vars are removed before loading.

## Consequences
- Campaign leads answer into an active AI that sees what was sent; the new OBS persona can rely on the
  section name.
- The origin read starts from the unique phone index: one read on a turn whose phone is no lead (almost
  every turn of every tenant), two for a lead (the send with its campaign variants embedded), in the
  same `Promise.all` as the history.
- Measured on 03/11/2026: the current OBS persona compiles to 15,526 of the 16,000 `LIMITS.persona`
  characters; the origin section is a separate per-turn block and does not count toward it.

## Addendum, 2026-11-07: where the contact came from
The default variants of 07/11/2026 no longer mention Google, and the persona answered "where did you get my
number?" by reading the sent text ("cita Google" or not), so a Google lead would hear "a list". The section
now carries the fact: `Origem do contato: busca no Google.` / `planilha.` / `não registrada.`, from the lead
list source (`prospeccao_buscas.fonte`: `compass/crawler-google-places` or `planilha`, mapped by
`origemDoContato` in `lib/campanhas-origem.ts`; an unknown source is "não registrada", never a guess). The
persona says how to word it. Rehearsal: Google 3/3 and spreadsheet 3/3; "não registrada" still made the model
say "a list" in 3/3, which is unreachable today (`busca_id` is NOT NULL and only those two sources exist).
