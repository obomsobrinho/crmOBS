# diagnostics.personaOrigem exposes where the prompt came from
- Date: 2026-09-17
- Status: Accepted
- Area: agent-ai

## Context
Fallbacks in persona assembly are silent on purpose (an agent must never go mute). Without a signal, a regression to the frozen saved text would be invisible.

## Decision
`diagnostics.personaOrigem` takes one of `montada`, `montada_longa`, `salva`, `fallback`, `override`, `nenhuma`.
- ⚠️ `salva` in production is an ALARM: assembly failed and the tenant went back to serving the frozen text of the last Save, which is exactly the problem assembly-on-read was built to solve.
- It is NOT stored in `agent_turns` (fixed columns, would need a migration). Today it appears in the playground bench and in the response to n8n.

## Consequences
- Anyone watching production diagnostics should treat `personaOrigem = salva` as an incident.
- Persisting it requires a migration of `agent_turns`.
