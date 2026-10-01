# Prompt base is three layers and the order is the defense
- Date: 2026-08-22
- Status: Accepted
- Area: agent-ai

## Context
Context in `docs/proximos-passos.md`. Whatever the customer writes in their own prompt must not be able to break the agent contract.

## Decision
Three layers: (1) base that OPENS (identity, context, tone, sources and honesty); (2) the customer's content fenced by `--- início/fim ---`; (3) base that CLOSES (precedence, when to call a human, anti-manipulation, `### OUTPUT`).
- The contract is the LAST block because recency protects it from what the customer writes by accident.
- Base is mold and rule, customer is value: customer name and hours are customer data, never base text (otherwise there would be one base per customer).
- Declared precedence: the customer rules the manner of attending (form of address, nickname, tone); the base rules the contract.

## Consequences
- Never put tenant-specific values in base text.
- Never move the contract (`### OUTPUT`) out of the last block.
- The prompt prefix order in `lib/agent.ts` (persona, RAG, AGORA, operator guidance) must not change: it makes prompt cache work (see `undated-prompt-cache-measured-and-threshold.md`).
