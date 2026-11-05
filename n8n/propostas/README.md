# n8n proposals (NOT applied to production)

Changes to the production workflows wait here for the owner's explicit OK. The live workflow changes
only after that, with `validateOnly` first and a fresh export (skill `exportar-n8n`).

## obs-atendimento-midia (2026-11-04, agent media)
- `obs-atendimento-midia.json`: the full "OBS Atendimento" export (sanitized, same placeholders as
  `n8n/obs-atendimento.json`) with the change applied, ready to diff against `n8n/obs-atendimento.json`.
- `obs-atendimento-midia.nos.json`: only the 6 new nodes and the changed connections.

What changes. Today `Loop envio` (done) goes to `Action`. In the proposal it goes:

1. `Loop envio` (done) -> `Tem mídia da IA?`. This IF checks `$('Atendente').item.json.midia.url`; without media it goes straight to `Action`, unchanged.
2. -> `Telefone real? (mídia)`. A DDD 00 phone never reaches Evolution. This node runs `executeOnce`, so the media goes once even when the loop had 2 messages.
3. -> `Tipo da mídia da IA` (video/image).
4. -> `Envia vídeo da IA` / `Envia imagem da IA`. These are the same Evolution community nodes as the manual send (`send-video`/`send-image`), with the signed URL, mime, caption (`legenda`) and file name from `/api/agent`.
5. -> `Salva mídia da IA`. It inserts into `chat_messages`: `media_url = path`, `media_type`, `message_type = 'midia_ia'`, no `bot_message`.
6. -> `Action`, unchanged after that.

The brain (`/api/agent`) returns `midia: { chave, tipo, path, mime, nomeArquivo, legenda, url } | null` next
to `output`. Without the CRM deploy the field never exists, so this n8n change is inert until then.
Apply order: migration, CRM deploy, catalog row and file, then this workflow.
