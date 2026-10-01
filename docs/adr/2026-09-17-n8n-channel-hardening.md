# n8n channel hardening: groups refused, dedupe, error fallback
- Date: 2026-09-17
- Status: Accepted
- Area: n8n

## Context
Window with the owner. Three defects of the pipe closed at once.

## Decision
1. Groups are refused in node `Rotas` (new condition: phone does not contain `@g.us`; before, the only condition was existing, so a group JID passed and the AI answered inside groups).
2. Dedupe by `key.id`, with new `messageId` in node `Dados` and nodes `Dedupe (Redis)` (`incr` on `dedupe:{messageId}`, TTL 300s) and `Primeira entrega?` between `Rotas` and `Get Lead`. WARNING: the condition is an OR: an EMPTY `messageId` PASSES, otherwise every message without id would collide on the same key and only the first every 5 minutes would be answered.
3. Fallback on the error output of `Atendente`: `Salva user (IA falhou)` writes the customer message to `chat_messages`, `Fallback ao cliente` replies "Recebi sua mensagem, já te respondo por aqui." and `Avisa falha no grupo` calls the team.

## Consequences
WARNING: what item 3 fixes is not only silence, it is LOSS. `Salva chat_messages` comes AFTER `Atendente`, so without the error output the customer message was recorded nowhere when the brain failed, and nobody knew someone had written.
