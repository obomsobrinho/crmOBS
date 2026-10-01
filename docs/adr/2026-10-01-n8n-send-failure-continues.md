# A failing send must not stop the rest of the execution
- Date: 2026-10-01
- Status: Accepted
- Area: n8n

## Context
`Evolution send` without `onError` stopped the execution at the first failing send: the second part of the response and the "Conversa marcada" notice never went out. The end-to-end battery exposed it (with the impossible number the send always fails, so the notice was never reached).

## Decision
`Evolution send` is `continueRegularOutput`.

## Consequences
Keep non-essential and best-effort nodes on `continueRegularOutput` so one failure does not cut the chain.
