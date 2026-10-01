# Test bench inside /agente tests the configuration in edit, compiled by the server
- Date: 2026-08-22
- Status: Accepted (later made a conversation: 2026-09-26-playground-as-conversation.md)
- Area: agent-ai

## Context
Saving is publishing, so testing before it meant touching the agent serving real customers.

## Decision
- `components/AgentTestDrawer.tsx` opens `Playground` in a `sheet` (`tamanho="largo"`). It tests the configuration IN EDIT, not the saved one.
- The body of `POST /api/playground` carries the RAW configuration (`mode` plus `config` or `persona`) and the SERVER compiles it (`validateConfig` + `buildPersona`, or `buildAdvancedPersona` in advanced), so the invariant base tail is always re-attached. A final persona coming from the browser could arrive without `### OUTPUT` and the test would lie.
- `processTurn` takes `personaOverride` and ONLY honors it in `dryRun`. The guard lives in the module, not the route, because a persona from outside must never serve WhatsApp.
- Incomplete config returns **400** with the missing fields.
- A panel and not two columns, on purpose: two columns would redo the `/agente` layout approved on 2026-08-22.

## Consequences
- ⚠️ The `/playground` screen no longer exists (404) and left the menu; the endpoint and the preview `/design/playground` remain.
