# Contact profile photos are copied to our bucket
- Date: 2026-10-01
- Status: Accepted
- Area: data

## Context
`lib/fotos.ts`. The WhatsApp photo link expires.

## Decision
The image is COPIED into the `whatsapp-media` bucket (`{client_id}/fotos/{id}-{hash}.ext`). Columns `foto_path`, `foto_origem` (host + path of the link, WITHOUT the `?` signature, which changes on every query) and `foto_em`.
- Who updates: `atualizarFotos` via `after()` in the Conversas and Clientes layouts (never n8n).
- Who serves: `/api/fotos/[...path]`.
- Who draws: `AvatarContato`.

## Consequences
- Compare `foto_origem` without the query string to decide whether the photo changed.
