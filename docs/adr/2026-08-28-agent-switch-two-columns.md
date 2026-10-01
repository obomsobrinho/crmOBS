# Agent switch is two columns, and a muted agent returns 200
- Date: 2026-08-28
- Status: Accepted
- Area: onboarding

## Context
`agent_enabled` is the on/off; `agent_published_at` is the FIRST activation and is never cleared (clearing it on disable would throw the whole account back into `/montagem`).

## Decision
If `agent_published_at` is null OR `agent_enabled` is false, `processTurn` returns 200 with empty `messages` (NOT an error) before calling the model. The AI stays mute, spends no tokens, and the customer's message is STILL recorded by n8n for a human to answer. Applies only outside `dryRun`. `PUT /api/clients/[id]/publish` receives `{ enabled: boolean }`, is owner-only, and the prerequisites apply ONLY on the first activation (409 with what is missing).

## Consequences
A 200 with empty messages is what lets n8n keep recording instead of failing.
