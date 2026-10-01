# agent_enabled is the switch; agent_published_at is the first activation and is never cleared
- Date: undated
- Status: Accepted (see also 2026-08-28-agent-switch-two-columns.md)
- Area: onboarding

## Context
A single column would mix "on/off" with "has ever been set up".

## Decision
`clients.agent_enabled` (boolean) is the on/off switch. `agent_published_at` is the FIRST activation and is NEVER cleared. Zeroing it when turning off would throw the whole account back into the `/montagem` assistant just because someone turned the AI off for an hour. It is also the signal that separates MONTAGEM from EDIÇÃO. `processTurn` goes mute if either one blocks.
- Vocabulary: "Agente ativo" and "Desativado", NEVER "pausado". "Pausada" is the AI of ONE conversation when a human takes over; using the same word in both places makes the person look at the inbox without knowing which of the two stopped.
- Agent config is edited in `/agente` and, the first time, in `/montagem`. Owner only in both: the page redirects an atendente and the `PUT` answers 403. Writes only through service_role (the RLS of `clients` gives no UPDATE to `authenticated`).

## Consequences
- UI copy must use "Agente ativo" / "Desativado" for the agent switch.
