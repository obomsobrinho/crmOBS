# Advanced mode: free text with the base tail always glued back
- Date: 2026-08-22
- Status: Accepted
- Area: agent-ai

## Context
Tenants in advanced mode wrote their own prompt and never received base improvements. That is exactly what happened with the handoff rule and forced the rules to be pasted by hand into the OBM persona.

## Decision
The tenant writes whatever they want and the server ALWAYS reattaches the tail: `buildAdvancedPersona` runs `stripBaseTail` (removes any base section from the tenant's text, to avoid duplication) and concatenates `buildBaseTail`. The route returns `removed` and the screen WARNS what will be removed instead of deleting silently.

## Consequences
- OBM persona was recompiled (2026-08-22, authorized by the owner): 10,494 -> 11,452 chars, `md5 0efa85000852f92b75140562127b3544`, version recorded in `agent_publications` (`published_by` null because it was a migration, not a click on Save). Backup in `public._persona_backup_20260822`.
- Two pieces of it were MOVED before recompiling, or they would have died in the strip: the paragraph "IMPORTANTE: os exemplos acima..." (lived inside its `### OUTPUT`; it stops the model from answering in loose text imitating the examples) and the summary calibration ("segmento, dor identificada e contexto relevante"). Both went to the end of `### EXEMPLOS`, where "acima" is still true.
- It lost on purpose the name in `ANTI-MANIPULAÇÃO` (the tail is generic without `agent_config`) and "com o time" in the handoff notice: injecting names by hand would produce a persona the route cannot reproduce, and the next save through the UI would drop them. Its `### IDENTIDADE` already says who Tony is. It gained the 3 fixed escalation triggers it lacked.

## Evidence
Smoke test with the real brain (running its text through `personaOverride` on Loja Teste to avoid writing to OBM): introduces itself as "Tony, da OBS", returns 2 messages in the array, refuses to give a price and offers the call, guardrail passed.
