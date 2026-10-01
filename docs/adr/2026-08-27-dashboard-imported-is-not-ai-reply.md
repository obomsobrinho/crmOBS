# Dashboard counts only what happened after the AI entered; `imported` is not an AI reply
- Date: 2026-08-27
- Status: Accepted
- Area: dashboard

## Context
`lib/valor.ts` and `lib/metrics.ts` both said "`message_type <> 'manual'`", and `imported` passed. Replies the OWNER typed by hand in WhatsApp before the AI existed counted as AI work.

## Decision
The rule of "who replied" lives in `lib/mensagem.ts` (pure module) and applies to `lib/valor.ts` and `lib/metrics.ts`. The dashboard counts only what happened after the AI entered; imported stays in the inbox, outside the numbers.

## Consequences
Never re-implement the rule inline in SQL or TS. SQL must use the same rule as `lib/mensagem.ts` (see `docs/instrumentacao-beta.md`).

## Evidence
On OBM, 84 of 94 rows were imported. The screen said "46 of 47 conversations without team intervention" when the real number was 2.
