# Audio was silently broken; media nodes get error outputs
- Date: 2026-09-30
- Status: Accepted
- Area: n8n

## Context
Owner finding, 30/09/2026. `Sobe mídia recebida` replaces the item with the route response (`{path, type}`), and `Audio → Binary` read `base64` from the item: error, execution stopped BEFORE saving, audio vanished from the CRM and the AI never answered. Images did not suffer because `Image base64` re-read from `Dados`.

## Decision
- Audio got `Audio base64`, the same pattern as image (re-read from `Dados`).
- `Audio → Binary`, `Whisper`, `Image → Binary` and `Vision` have an ERROR OUTPUT to `Áudio sem transcrição` / `Imagem sem leitura`: the message continues to the AI with the notice in square brackets, never lost.
- `Tipo de mensagem` gained video and document, which had no exit and died there.

## Consequences
Nothing in a media branch may stop the execution before the message is recorded.
