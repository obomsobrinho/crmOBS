# "Before and after" using imported history is blocked by data
- Date: 2026-08-27
- Status: Accepted (blocked, not postponed). History import was later removed (23/09/2026).
- Area: dashboard

## Context
The idea was to compare operation before/after the AI using the imported WhatsApp history.

## Decision
Do not build it. Probe of Evolution on 27/08: `findMessages` returns `total: 1` per conversation with and without pagination, and the whole OBM instance store has 171 messages. Paginating the import does not solve it. Only a NEW link (full initial sync) was left to measure before discarding for good.

## Consequences
The `/connect` import route was deleted on 23/09/2026 and new instances are born with `syncFullHistory: false`.

## Evidence
`total: 1` per conversation, 171 messages in the OBM store, 27/08/2026.
