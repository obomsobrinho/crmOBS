# Sliding wait in the n8n debounce
- Date: 2026-10-01
- Status: Accepted
- Area: n8n

## Context
"Duas respostas para o mesmo lote". The debounce waited 15s from the FIRST message and released; audio still being transcribed entered later and opened a second turn.

## Decision
`Marca chegada` (Redis `chegou:{tel}`, right at entry) and `Marca pronto` + `Marca última` (`pronto:{tel}` and `ultima:{tel}`, after saving) count what arrived and what is ready. After the 15s, `Ainda chegando?` repeats `Espera 4s` while a message is missing from ready or the last one is under 5s old, with a cap of 8 loops (~47s). `Lock counter` went to 120s TTL, otherwise the lock expired mid long wait. The mark nodes are `continueRegularOutput`: a Redis failure never takes attendance down.
Also: `Notifica grupo` became "📅 Conversa marcada", with `executeOnce` (it fired once per response part) and real line breaks (the `\n` showed up literally).

## Consequences
WARNING: the Redis `set` requires an explicit `keyType: "string"` (the automatic one errored and stopped ALL attendance for ~3 min in production).
