# The notices number is never a conversation
- Date: 2026-09-29
- Status: Accepted
- Area: agent-ai

## Context
The notice destination can be a plain WhatsApp number. If that number writes to the agent, the agent would answer its own notices and the number would pollute lists and counts.

## Decision
- `processTurn` returns a silent turn for that number (`diagnostics.numeroDeAvisos`, `agent_turns.silenced = 'numero_de_avisos'`).
- `ehNumeroDeAvisos` (`lib/avisos.ts`) removes it from EVERY list and count: Conversas, Pipeline, menu counter, Painel, Assinatura, Pedidos.
- The comparison tolerates the ninth digit (`chaveTelefone`). Where the exclusion happens in the database (HEAD counters of the menu) it uses `grafiasDoNumeroDeAvisos`.

## Consequences
- Any new list, count or metric over conversations must apply `ehNumeroDeAvisos` (or the SQL equivalent), otherwise the notices number shows up as a lead.
