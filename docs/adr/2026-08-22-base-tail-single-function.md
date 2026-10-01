# The base tail is one function used by both modes
- Date: 2026-08-22
- Status: Accepted
- Area: agent-ai

## Context
Guided and advanced prompt modes both need the invariant closing part of the prompt. Duplicating it makes advanced tenants miss improvements.

## Decision
`buildBaseTail()` in `lib/agent-prompt.ts` produces `PRECEDÊNCIA` + `QUANDO CHAMAR UM HUMANO` + `CONDUÇÃO DA CONVERSA` + `ANTI-MANIPULAÇÃO` + `### OUTPUT`. `buildPersona` ends by calling it, and so does `buildAdvancedPersona`.
- `agentName` / `companyName` are OPTIONAL in it on purpose: an advanced tenant may have no `agent_config` (the OBM has none), and a tail that depended on tenant data would not be invariant. Without names the text is generic.

## Consequences
- Never add tenant-dependent data as a required input of the tail.
- `CONDUÇÃO` was added 2026-09-29, see `2026-09-29-conducao-section-and-persona-limit-14000.md`.
