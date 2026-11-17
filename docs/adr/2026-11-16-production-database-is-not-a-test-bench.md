# The production database is not a test bench; what grows has a cleanup, a job works only when there is work

Date: 2026-11-16. Status: Accepted (owner, decisions of 14/11 and 16/11/2026).

## Context

On 14/11/2026 the Supabase dashboard warned that the project (Free plan, Nano) was about to deplete its Disk IO budget. The survey found one root cause behind most of the waste: production was also the test bench.

- `chat_messages` had 293,805 inserts on record for about 835 real messages. About 93 thousand were inserted and deleted by the logged e2e suites; about 200 thousand were inserted and rolled back (the load tests of the list RPCs, which the list rule asked to run "in a rolled back transaction"). A rolled back insert still leaves dead entries in every index.
- Result: 129 MB of database, about 100 MB of it index bloat (78 MB of indexes on `chat_messages` for 721 rows, 23 MB on `conversations` for 65 rows), and about 820 KB of WAL per message insert. Attendance itself spent the IO budget. This is the cause of the 14.8 s reads of 10/11.
- 770 of 872 `agent_turns` rows were dry runs, 58 of 98 auth sessions belonged to the test user.
- `cron.job_run_details` was never cleaned (4,279 rows, 150 ms insert and 122 ms update per tick).
- The Campanhas job called the server 288 times a day with or without work.
- `pg_graphql` rebuilt its schema on every DDL and nobody uses GraphQL.
- Two tables of another project (`uqc_config`, `uqc_votos`) had been created by hand, writable by any signed-in user.
- One day of logged suites (14/11 afternoon and night) grew the `chat_messages` indexes from 520 kB to 2.1 MB and the `conversations` ones from 136 kB to 968 kB, and the database stalled at 17h on 14/11 during the suites.

## Decision

1. **Tests leave production.** The logged suites, the load tests and the AI bench move to a second Supabase project (the Free plan allows two) with the same migrations. Production keeps only the n8n battery (small, DDD 00). Pending: the owner creates the project. Until then the logged suites run outside attendance hours (D13) and are followed by the bloat check below.
2. **A table that grows is born with a retention and a cleanup.** Applied on 16/11: the pg_cron history keeps 7 days (job `limpar_historico_do_cron`, 03h15 São Paulo). Decided, not built yet: WhatsApp media is kept 60 days, fixed (the message stays, the file goes; the Free plan holds 1 GB and one active tenant stored 148 MB in three weeks). Messages, contacts and conversations are the product and have no expiry.
3. **A job works only when there is work.** The `prospeccao_tick_5m` job calls the route only when a campaign is running or scheduled, a send is under observation (14 days), a search is still running, or it is the daily cleanup window. The condition repeats the route's logic (`features/campanhas/server/cron.ts`); the two must stay equal.
4. **Nothing unused stays on.** `pg_graphql` dropped, the `uqc` tables dropped, `sem_acento` no longer executable by `anon` or PUBLIC.
5. **Bloat is checked, not assumed.** After any logged suite on production, and weekly, compare `pg_indexes_size` with `pg_table_size` on `chat_messages` and `conversations`; above 5 times, `REINDEX TABLE CONCURRENTLY`. Reindexed on 14/11 13h23 (129 MB to 28 MB) and on 16/11 (26 MB; indexes back to 528 kB and 136 kB).

## Not done, and why

- **`REPLICA IDENTITY FULL` to default on the published tables** (the Realtime WAL decoding is the largest CPU consumer, 13,550 s of `realtime.list_changes`): held back. Channels subscribe with a tenant filter, and whether a filtered UPDATE or DELETE still reaches the screen without the old row in the WAL was never tested. It touches attendance, so it needs a test on one table first.
- **Cleanup of dry run `agent_turns`**: dropped. The central's usage functions (`admin_cliente_uso*`, `admin_cliente_picos`, `admin_empresas_pagina`) read that table, the bench's tokens are real cost, and the table is 464 kB.
- **Backups**: the Free plan has none. The owner chose to do the daily dump on his VPS last.

## Consequences

- `pg_stat_statements` was reset on 16/11/2026 11h15 São Paulo: B9 and every cost reading start from there.
- A diagnosis on production uses only SELECT, and no temporary table (each DDL reloads the PostgREST schema cache, 734 ms on average).
- The list RPC rule no longer sends the synthetic load test to production.
