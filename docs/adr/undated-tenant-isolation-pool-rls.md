# Multi-tenancy: shared tables + client_id + RLS, with fixed roles
- Date: undated
- Status: Accepted
- Area: security

## Context
Several companies (tenants) use the same system, each sees only its own, and an AI agent attends each one's WhatsApp.

## Decision
"Pool" pattern: shared tables + `client_id` + RLS. A login reads only rows of its tenant(s) via `client_id in (select client_id from user_clients where user_id = auth.uid())`.
- CRM = role `authenticated` (RLS applied). n8n = `service_role` (bypasses RLS). `anon` has no access to anything.
- `user_clients` is the N:N link between `auth.users` and `clients`, with `role` (`dono` / `atendente`). The CRM sees only its OWN row (policy `user_id = auth.uid()`); to list colleagues and name the attendant of each conversation it uses the SECURITY DEFINER function `public.tenant_members()` (returns `user_id`, `email`, `role`; resolves `auth.users`).
- Inviting/removing members is NOT a direct write: it goes through a `service_role` route handler in `app/api/team/*` (owner only; invite via `auth.admin.inviteUserByEmail`, the invitee sets the password in `/auth/confirm` -> `/definir-senha`).
- `pipeline_stages` management (create/rename/reorder/archive) is a direct browser write BUT owner only (RLS checks `role='dono'`); moving a card (update of `conversations.stage`) is open to any member.

## Consequences
- See `2026-08-22-conversations-column-grants.md` for the column-level limits.
- RLS policy shape for new policies: see `2026-10-01-production-loading-and-realtime-rules.md`.
