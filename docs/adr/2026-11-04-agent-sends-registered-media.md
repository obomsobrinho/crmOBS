# The agent sends a registered video or image, chosen by its description, once per conversation
- Date: 2026-11-04
- Status: Proposed (branch `claude/agente-midia`; the n8n change waits for the owner's OK)
- Area: agent-ai, n8n, data

## Context
The owner wants Tony to send a short narrated video when a lead asks how Atenda works ("O importante é
você conseguir mandar o vídeo no momento exato. E saber o que o vídeo se trata"). Until now the agent
output had only text plus `action` none/agendar/pausar. The manual send path already sends media
(`/api/send` signs a whatsapp-media path, n8n "CRM Envio manual" `Envia vídeo`), and the conversation
already plays video (`MediaView`).

## Decision
- **Catalog per tenant:** new table `agent_midias`, with columns `chave`, `tipo` (video/image), `path`,
  `mime`, `descricao`, `quando_enviar` and `legenda`.
  - The file lives in `whatsapp-media` under `{client_id}/biblioteca/`.
  - RLS read for the tenant, writes service_role only. There is no screen in v1.
  - The model decides from `descricao` and `quando_enviar`, written by whoever uploads the file. It never
    sees the file, so it never describes what is not written.
- **Prompt:** `### MÍDIAS PARA ENVIAR` (`blocoDeMidias`, `lib/midias.ts`), after `### ORIGEM`.
  - It sits outside the persona and outside the cache prefix, and works for any tenant.
  - It lists only the media still available in the conversation.
- **Output contract:** optional field `midia`. It exists in the schema only when the tenant has available
  media, with an enum of those keys plus "". Tenants without media keep exactly the old schema.
  `action` is unchanged.
- **Code, not the prompt, decides (`escolherMidia`):**
  - The key must be in the catalog.
  - Each media goes at most once per conversation. Production checks the `midia_ia` rows of
    `chat_messages`; the dry run uses the keys passed in.
  - Nothing is sent when the guardrail blocks or on a retomada turn (its reply goes through "CRM Envio IA",
    which sends no media).
  - `processTurn` signs a 1 hour URL and returns `midia` next to `output`.
- **n8n sends, after the text loop:** `Tem mídia da IA?`, then `Telefone real? (mídia)` (once), then send
  video or image, then `Salva mídia da IA`.
  - The saved row has `message_type = 'midia_ia'` and no `bot_message`.
  - The proposal is in `n8n/propostas/` and is NOT applied.
- **Metrics:** the media row is not an AI reply (`respostaDaIa` needs `bot_message`), so no SQL copy
  changes. The sentence that announces the video is the reply.
- **History:** a `midia_ia` row becomes an assistant line, "[Vídeo enviado pela empresa: chave. descrição]",
  so the agent knows it was sent.
- **Conversation screen:** an outgoing AI bubble with the media (`rowsToBubbles`). It is not in the
  contact's Arquivos tab, which lists received types.

## Consequences
- **Inbox preview:** after a media row, the inbox list preview is empty (`sync_conversation` uses
  `user_message` or `bot_message`). It is the same as a manual media send without caption.
- **Purge:** `agent_midias` is in `TABELAS_DO_CLIENTE`.
- **Types:** `lib/database.types.ts` got the table by hand on the branch, because the migration is not
  applied. Regenerate after applying.
- **Order:** the WhatsApp order is text first, then the media, guaranteed by n8n.
- **Evidence (dry run, `scripts/ensaio-do-prompt.mjs --midias`):**
  - "como funciona isso na prática?" sent `como_funciona`, with the reply announcing the video.
  - Asking again later did not resend it (the block disappears once sent).
  - "quanto custa?" sent nothing.
- Real send (04/11/2026, owner's personal number, with his OK): Evolution `POST /message/sendMedia` with the flat body (`mediatype: "video"`, `mimetype`, `caption`, `media` = signed whatsapp-media URL, `fileName`) answered 201 and the video arrived and played on WhatsApp.
