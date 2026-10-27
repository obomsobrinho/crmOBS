# Received media goes to Storage by signed upload URL, not through the Vercel body

Date: 2026-10-27. Status: Accepted.

## Context
`/api/inbound-media` received the whole file as base64 in the JSON body from n8n (`Sobe mídia recebida`) and uploaded it to `whatsapp-media`. A Vercel Function request body is capped at 4.5 MB, and base64 adds about 33%, so any file above roughly 3.3 MB was refused. The node runs with `onError: continueRegularOutput` and the route always answers 200 with `path: null`, so the loss was silent: the message was saved without `media_url`.

Evidence on 2026-10-27: the largest file ever stored in `whatsapp-media/{client}/in/` was a 2.75 MB PDF. WhatsApp videos go up to 16 MB (a 30 s clip is commonly 3 to 8 MB), and scanned PDFs often exceed 3.3 MB. The owner asked that customer videos be saved (the contact's Arquivos > Vídeos tab) and that the AI only be told a video arrived.

## Decision
- `/api/inbound-media` has two modes, read only by `lerPedidoDeMidia` (`lib/midia-recebida.ts`, pure): the old base64 body (kept so production never breaks between the app deploy and the n8n change) and `assinar: true` with metadata only, which returns `{ path, type, signedUploadUrl }` from `createSignedUploadUrl`. The path rule (`{client_id}/in/{uuid}.{ext}`, `caminhoDaMidia`) stays in the app.
- n8n sends only metadata to the route, rebuilds the binary from `Dados.base64` and PUTs it straight to the signed URL (`Envia arquivo`). `media_url`/`media_type` are written only when the PUT answered with `Key`; a failed upload never blocks the reply.
- The AI gets the caption plus `[Vídeo enviado]` for a video (no content understanding).
- Deploy order: app first, then n8n.

## Consequences
- Files up to the n8n webhook limit are stored. Above it (default `N8N_PAYLOAD_SIZE_MAX` 16 MB, so a video over about 12 MB once base64 is in the Evolution webhook) the webhook itself is refused and the whole message is lost; raising that limit or fetching media from Evolution instead of the webhook base64 is a separate decision.
- Big PDFs and scans are fixed by the same change.

## Evidence
`e2e/midia-recebida.design.spec.ts` (both modes, pure) and `e2e/midia-recebida.auth.spec.ts` (real Storage: 401 without secret, text gives null, base64 upload, signed URL plus a 6 MB PUT answering `Key = whatsapp-media/{path}`, files removed after).
