# List RPCs read one index per group and stop at the limit
- Date: 2026-10-02
- Status: Accepted
- Area: data

## Context
`inbox_pagina`, `inbox_contagens`, `pipeline_coluna`, `pipeline_contagens` and
`clientes_pagina` built the tenant's whole set (a CTE `base` with a left join to
`dados_cliente`) and only then ordered, applied the cursor and cut to 10 rows (audit
R-16 / DATA-09). The order started with a computed column (the inbox group is a CASE
on `handoff_at` / `assigned_user_id`; the pipeline column is a CASE on `stage`), so no
index could serve it. Name searches applied `sem_acento(...)` to every row because the
existing trigram index (`dados_cliente_busca_trgm`) is on a different expression
(it also concatenates email and phone). Counters were counts over everything.

## Decision
- Each ordered read becomes one keyset read per group, each in the order of an index,
  with its own `limit`, and a final `union all ... order by ... limit` joins them:
  inbox = needs-you (`handoff_at is not null`), team (assigned), AI (unassigned), the
  last two with partial indexes `(client_id, last_message_at desc nulls last, id desc)`;
  pipeline column = active stage (`(client_id, stage, last_message_at desc, id desc)`) or
  default column (null / inactive stage); clientes = conversations by the conversation
  index plus contacts without a message by `(client_id, id desc)`. Names, photos and the
  summary are joined only for the returned rows.
- Searches go through candidate sets that use an index: names through
  `dados_cliente_nome_trgm`, which is on EXACTLY the expression the functions use
  (`sem_acento(coalesce(display_name,'') || ' ' || coalesce(nomewpp,''))`); messages
  through the existing trigram indexes on `sem_acento(user_message|bot_message)`.
- Counters split in two reads: the open requests (partial index, never hidden by the
  time window) and the rest inside the window (range of the index), so Hoje and 7 dias
  stop reading the tenant.
- `set plan_cache_mode = force_custom_plan` on these functions: the optional
  parameters (`p_x is null or ...`) only turn into an index condition when the plan is
  built for the concrete value. A value that is only known at run time is a plpgsql
  variable (`v_corte`), never a subquery, or the planner cannot estimate the range.
- Behavior is unchanged: signature, columns, order and filters. Verified by md5 of the
  full result, old function against new function, on 31 cases and on cursor walks
  across whole lists (minute-level timestamp ties included).

## Consequences
- Evidence (synthetic tenant: 55k contacts, 50k conversations, 500k messages, temp tables
  in a rolled back transaction): inbox first page 107 ms -> 1.4 ms, deep page 181 ms ->
  1.2 ms, name search 724 ms -> 6 ms, message search 985 ms -> 135 ms, Hoje counters
  31 ms -> 0.9 ms, pipeline column 79 to 132 ms -> 1.4 ms, clientes first page 82 ms ->
  4.7 ms; walking 25 pages of 50: inbox 8.2 s -> 63 ms, clientes tail 6.3 s -> 438 ms.
  The numbers are also in the migration header.
- Still linear per tenant, on purpose: the totals (`inbox_contagens` Tudo ~23 ms,
  `pipeline_contagens` ~37 ms, `clientes_contagens` ~71 ms) and the clientes search
  (0.5 to 0.6 s), which matches a text composed of name, email, tag names and custom
  field values. Revisit with a materialized search column when a tenant passes ~100k
  contacts.
- New indexes lock WRITES while they build (`create index` without `concurrently`):
  apply while the tables are small, or run each one outside a transaction with
  `concurrently`.
- A new list RPC must be checked the same way before it ships (see `data.md`).
