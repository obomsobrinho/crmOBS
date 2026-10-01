# AI safety is proven against the real brain, with a sabotaged persona for guardrail cases
- Date: 2026-08-28
- Status: Accepted
- Area: agent-ai

## Context
Before the beta, claims about "the AI does not invent" needed proof, not intent.

## Decision
Run 12 trap conversations in `dryRun` against the real brain on Loja Teste. Cases 11 and 12 use a deliberately sabotaged persona, because in 10 honest cases the guardrail (`lib/guardrail.ts`) never needed to fire, and a rule never seen firing is not proven.

## Evidence
- 12 trap conversations, none got through; the two guardrail rules (price/link/phone outside sources, strong promise) were seen firing. Case by case results, full AI replies and limitations: `docs/proximos-passos.md`.
- Became the repeatable suite in `2026-09-11-ia-suite-paid-and-opt-in.md`.
