# conversations browser writes are limited by per-column grants
- Date: 2026-08-22
- Status: Accepted (open point recorded below)
- Area: security

## Context
Browser (role `authenticated`, RLS applied) writes `dados_cliente.atendimento_ia` and some `conversations` columns. Before, the UPDATE grant was table-level and the policy only checked the tenant, so any member could write any column from the browser. Migration `mt_conversations_column_grants`.

## Decision
The UPDATE grant became per COLUMN, only on the 8 the browser writes: `unread_count`, `assigned_user_id`, `stage`, `stage_source`, `stage_changed_at` and the three `pending_instruction*`. "Released columns" is now the DATABASE, not a convention.
- `handoff_at` is left out on purpose (opened in `/api/agent`, closed by service_role routes): clearing it from the browser hid the conversation from the "Precisa de você" filter.
- `status` is also out because nobody writes it.

## Consequences
- ⚠️ What a grant does NOT solve: separating owner from atendente by column, since both are the SAME database role (`authenticated`). So `stage_source` and `pending_instruction` remain open to any tenant member, and `pending_instruction` enters the system prompt as trusted team guidance. Tightening needs a trigger or moving the write to a service_role route: PENDING DECISION of the product owner.
- A new browser-written column needs an explicit column grant.

## Evidence
Proven by impersonation: `update unread_count` as `authenticated` passes; `update handoff_at` answers `42501 permission denied`.
