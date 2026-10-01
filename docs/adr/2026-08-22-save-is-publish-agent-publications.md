# Saving is publishing; agent_publications is an append-only record
- Date: 2026-08-22
- Status: Accepted (premise "n8n reads persona live" corrected by 2026-09-17-persona-assembled-at-read.md; the conclusion holds because the agent serves from `clients`)
- Area: agent-ai

## Context
The agent config is read live, so there is no safe draft state.

## Decision
There is no draft and no Publish button. Each save of `PUT /agent-config` writes a row to `agent_publications` (append-only log: `config`, compiled `persona`, `prompt_mode`, `published_by`, `published_at`).
- The log is NOT the source of truth (the agent serves from `clients`); it is a record for restoring a version and for answering "what was the agent saying on Tuesday?" by crossing with `agent_turns`.
- Restoring does not write: it loads the version into the form and the person saves.
- Read by tenant members (RLS), write only by service_role.

## Consequences
- Testing without touching the live agent is the job of the playground bench, which tests the config IN EDITION (see `2026-08-22-playground-tests-config-in-edit.md`).
