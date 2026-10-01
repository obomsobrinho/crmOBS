# Persona is assembled at read time, every turn
- Date: 2026-09-17
- Status: Accepted
- Area: agent-ai

## Context
The old rule (and a stale code comment) said n8n reads `persona` live. That is false since the cutover: n8n only sends `client_id`, phone, instance and message; our `processTurn` fetches everything from Supabase. The text used to be glued and stored on Save, so improvements to the base only reached tenants who saved again. OBS (OBM tenant) went days with the old anti-manipulation rule after the new one existed in code.

## Decision
The persona is BUILT ON READ, each turn, by `personaDoTenant` (`lib/agent-turn.ts`), which calls `compilePersona` (`lib/agent-prompt.ts`): `buildPersona(agent_config)` in guided mode, `buildAdvancedPersona(persona)` in advanced mode (strips the old tail and glues today's, so it is idempotent).
- `clients.persona` is still written on Save and in `agent_publications`, but it is now a RECORD and the FALLBACK: if assembly fails, the worst case is the old behavior, never a mute agent.

## Consequences
- ⚠️ The price is real: a change to the base reaches production for ALL tenants on the next message, with no review. The agreed gate with the owner is `npm run test:e2e:ia` green before deploying any change that touches the base.
- Prompt cache is not hurt: the string is identical while config and base do not change, and the prefix order stays the one in `lib/agent.ts`.
- Related: `2026-09-17-compile-persona-single-dispatch.md`, `2026-09-17-persona-origem-diagnostic.md`.
