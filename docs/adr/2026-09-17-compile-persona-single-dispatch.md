# compilePersona is the single "mode -> persona" dispatch
- Date: 2026-09-17
- Status: Accepted
- Area: agent-ai

## Context
The mode-to-persona dispatch had been copied by hand in three places. Saving and reading must produce the SAME text; diverging copies mean the agent serves something Save never produced.

## Decision
`compilePersona` (`lib/agent-prompt.ts`) exists ONCE. All THREE paths call it: the `PUT` of agent-config, the `POST` of the playground and `processTurn`.
- `LIMITS.persona` lives inside it for the same reason.
- No HTTP inside it: it returns the reason (`campos` / `vazio` / `longo`) and each route translates that into its own 400.

## Consequences
- Never reimplement the dispatch or the length limit in a route.
- A new route that needs the persona calls `compilePersona`.
