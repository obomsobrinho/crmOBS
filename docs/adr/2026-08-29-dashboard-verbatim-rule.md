# Verbatim agent sentence: most recent from a conversation the AI handled alone
- Date: 2026-08-29
- Status: Accepted (supersedes "most recent AI reply" from 2026-08-27)
- Area: dashboard

## Context
The old rule "most recent AI reply" landed on "Perfeito, até amanhã!" half the time. Also, n8n writes a two-message turn in a single row joined by `" | "`, and the panel was the last place still showing the pipe on screen (seen on Loja Teste, 29/08).

## Decision
Take the most recent reply of a conversation the AI handled ALONE, with a fallback to the most recent one above `VERBATIM_MIN_CHARS` (120, chosen by the assistant, NOT by the owner). Still objective and applied always, never hand-picked. `escolherVerbatim` returns `mensagens: string[]`, not a string. Two named thresholds in `lib/painel.ts`, both from outside the product: `ESPERA_AVISO_MS` (2h, from the design tool) decides when the queue goes from neutral to amber; `VERBATIM_MIN_CHARS`.

## Consequences
Any new place that shows an agent turn must split on the `" | "` join instead of printing the raw string.
