# Pipeline stage model and AI stage moves
- Date: undated (Phase 3)
- Status: Accepted
- Area: data

## Context
Phase 3 added the Kanban funnel.

## Decision
`pipeline_stages` is one funnel per tenant (`key` stable slug, `name`, `position`, `is_canonical`, `is_default`, `archived`, `color`); RLS: read by member, CRUD only by `dono`. `conversations.stage` references `(client_id, key)` by FK. `conversations.stage_source` (`human`/`ia`) records who moved it, and the AI NEVER overwrites `human`. The AI moves the card in `/api/agent` via `nextIaStage` (`lib/pipeline.ts`): it only advances canonical stages, safe no-op otherwise.

## Consequences
More than one funnel per tenant does not exist. Dashboard (`/painel`) was rebuilt on 27/08/2026, see the dashboard ADRs.
