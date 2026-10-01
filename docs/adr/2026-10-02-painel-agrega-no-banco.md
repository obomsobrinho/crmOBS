# The panel and the subscription page aggregate in SQL, never over fetched rows
- Date: 2026-10-02
- Status: Accepted (supersedes the "slice in memory from 20,000 rows" part of `2026-08-27-dashboard-imported-is-not-ai-reply.md` and of `lib/painel.ts`; the single definition of "AI reply" is unchanged)
- Area: dashboard, data

## Context
`/painel` and the cancel step of `/assinatura` computed "what the AI did" from up to 20,000 rows of `chat_messages` plus 5,000 of `conversation_qualifications`, filtered and counted in memory. The owner confirmed the project's PostgREST "Max rows" is 1000. Every `.limit(20000)` and every `rpc` returning a set of rows was therefore silently cut at 1000: for any tenant above 1,000 messages the numbers were wrong, and the truncation guard (`length >= 20000`) could never fire. The "desde o inicio" sentence (the anti-churn argument) under-counted without any signal. There was also no index serving `client_id = X order by created_at desc`.

## Decision
- The numbers do not depend on fetching rows. `painel_janelas` returns ONE row of scalars per requested window (accumulated = window 0), `painel_series` returns one small jsonb (per date, per hour of the last 2 days, per weekday x minute-of-day, per weekday x hour). Both are bounded by time and calendar, never by message volume, and a jsonb is one row so Max rows cannot cut it.
- Windows are PARAMETERS (`lib/periodo.ts` stays the only definition of "week", "month"); the SQL cuts the rows at the window limits themselves (`width_bucket` over the cut points) and aggregates once per (phone, segment), so no limit is rounded and the first reply of a conversation INSIDE a window is exact.
- Classification stays in TS: business hours and weekend/holiday (`lib/valor.ts`, holidays are NOT in SQL), median, mean and the under-1-minute threshold (SQL returns n, sum, and the two central order statistics; the threshold is a parameter, `UM_MINUTO`). `lib/painel-agregado.ts` turns the aggregates into the same `ValorResumo` / `DashboardMetrics` / bars as before.
- "Who replied" now exists in SQL as well, declared in the header of `lib/mensagem.ts`: imported = excluded; AI reply = has `bot_message` and `message_type is distinct from 'manual'`; human = has `bot_message` and `is not distinct from 'manual'`; has text = `coalesce(col, '') <> ''` (no `btrim`). `is not distinct from` (not `=`) matters: `message_type` NULL is an AI reply, and `bool_or` over NULL would drop the conversation from "sem intervencao".
- Both pages share one loader (`lib/painel-dados.ts`); `/assinatura` asks only for the accumulated window, only for the owner, and a failure there must not block the payment page. `/painel` lets a database error throw instead of rendering zeros.
- Only `agent_config->hours` is read (JSON path), not the whole jsonb.
- Indexes `(client_id, created_at desc)` on `chat_messages` and `conversation_qualifications`, and a partial one for replies, migration `20261002200000`.
- `painel_verbatim` no longer scans the tenant's human rows: a correlated `not exists` evaluated while walking candidates in `created_at desc` order. Its one declared difference (non-empty after `btrim`) mirrors `escolherVerbatim`'s `trim()`.

## Consequences
- The truncation guard and the "previous period null when truncated" behaviour are gone: previous-period badges are always computed.
- Any new SQL copy of "who replied" must be declared in `lib/mensagem.ts` and covered by `e2e/painel-agregado.serial.spec.ts`.
- The accumulated window scans the tenant's rows once per visit inside the database (index-served, no transfer). If one tenant grows to millions of rows, the next step is a daily roll-up fed by the `sync_conversation` trigger family, but windows with arbitrary edges (rolling "last 7 days") still need the row-level pass for exactness.

## Evidence
- Owner confirmed Max rows = 1000 (01/10/2026).
- Parity proven two ways: `e2e/painel-agregado.design.spec.ts` (TS over rows == TS over aggregates, 14 windows x 3 business-hour variants, hour chart sum == headline) and, before applying, the function bodies were run against a 1,700-row generated fixture with 13 windows, and all 14 window rows and 6 series matched the TS reference byte for byte. That run found the NULL `message_type` defect above (3 conversations miscounted in "sem intervencao").
- `e2e/painel-agregado.serial.spec.ts` repeats it against the real tables after the migration (more than 1,000 rows, read back paginated).
