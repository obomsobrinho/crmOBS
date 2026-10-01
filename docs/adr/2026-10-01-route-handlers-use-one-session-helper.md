# Route handlers resolve the session through one helper
- Date: 2026-10-01
- Status: Accepted
- Area: api

## Context
19 route handlers copied the same 401 / tenant 403 / owner 403 block by hand (14 of them `role !== "dono"`). The copies drifted: two paid or sensitive routes (`connect-whatsapp`, `team/invite`) never got the blocked-account gate, and `/api/send` signed any Storage path from the body.

## Decision
- `sessaoDaRota` in `lib/rota.ts` is the ONE place that resolves session, tenant, role and access state. It returns `{ mine }` or a ready `NextResponse` (`{ erro }`), in a fixed order: 401, tenant 403 (`id`), owner 403 (`dono`, the text is per route), blocked 402 (`ativa`).
- Status codes and messages of the migrated routes did not change. New checks: `connect-whatsapp` and `team/invite` answer 402 for a blocked account. An `atendente` may still connect WhatsApp (owner decision).
- Shared secrets (`x-lookup-secret`, `asaas-access-token`) are compared with `segredoConfere` (`lib/segredo.ts`, timing safe).
- `/api/send` only signs paths under `{client_id}/` in the `whatsapp-media` bucket (400 otherwise).
- `conversations.pending_instruction*` is written by `/api/conversations/instrucao` (POST sets, DELETE cancels, any member), no longer by the browser.

## Consequences
- A new route handler with a user session MUST call `sessaoDaRota`. Routes guarded by a secret do not.
- Every Storage path that arrives in a body and is signed with service_role must be checked against the caller's tenant prefix.
