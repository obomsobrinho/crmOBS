# Prompt cache measured; prefix order is load-bearing; warning uses the upper threshold
- Date: undated (Phase 4, prompt cache)
- Status: Accepted
- Area: agent-ai

## Context
`cached_input_tokens` answers the question that decides the margin of the Avançado plan (40% without
cache, 55% with).

## Decision
- It comes from `usage.prompt_tokens_details.cached_tokens`; `null` = the model did not report, `0` =
  the prefix did not match, and **the first turn of a conversation is always 0**.
- What makes the cache hit is the ORDER that `lib/agent.ts` already builds (persona, RAG, AGORA, operator
  orientation): only the persona is a stable prefix, so **do not reorder this** without redoing the math.
- The threshold lives in `lib/agent-prompt.ts` as a pair of constants: `CACHE_MIN_TOKENS` (1,024, the
  documented floor for GPT-5.6+) and `CACHE_SAFE_TOKENS` (2,048). **The `/agente` warning deliberately
  uses the upper one**, because `gpt-5.4-mini` falls in the "before 5.6" band, where OpenAI itself says
  the minimum ranges from 1,024 to 2,048 and caching is inconsistent slightly above 1,024. Promising
  savings that do not come is worse than warning about a risk that did not materialize.

## Consequences
In practice the guided mode never triggers the warning (the empty skeleton is already ~2,146 tokens);
what triggers it is advanced mode with a short prompt.

## Evidence
Real measurement on Loja Teste: turn 1 with 0 of 3,787; turn 2 with **2,304 of 3,870 (59.5%)**.
