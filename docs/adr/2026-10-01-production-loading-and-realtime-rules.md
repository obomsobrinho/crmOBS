# Production loading: paginate, server-side search, row-level realtime, session-bound channels
- Date: 2026-10-01
- Status: Accepted
- Area: realtime

## Context
Owner rules for production (plan in `docs/plano-carregamento.md`): never size for the beta. A list that reads 500 rows to filter in memory does not survive production. Several realtime defects were found at once.

## Decision
- Large lists are paginated 10 at a time with infinite scroll. Search goes to the server with debounce. Realtime updates ONLY the row that changed. A hidden tab does not fetch.
- The conversation list reads `public.inbox_pagina` / `inbox_contagens` (SQL, `security invoker`), never 500 rows filtered in memory.
- RLS is rewritten with `(select auth.uid())`. A new policy follows that mold.
- EVERY realtime subscription goes through `assinarComSessao` (`lib/supabase/client.ts`). A channel assembled on first load entered BEFORE the session, as anonymous, and stayed mute forever (this is how the menu counter stopped following the database with nobody noticing).
- A new channel filters by tenant (`client_id=eq.`), never listens to the whole table.
- A table listened to by realtime MUST be in the `supabase_realtime` publication. A table outside it makes Supabase refuse the WHOLE channel, not only that listener (this is how the Pipeline had no realtime until 01/10/2026). When listening to a new table, check `pg_publication_tables`.
- `anon` has no grant on ANYTHING in `public` (a persona backup was readable with the public key on 01/10/2026). A new table is born with RLS and no grant to `anon`.

## Consequences
New list screens must reuse the paginated hooks (`lib/use-paginada.ts`) and the row-level realtime pattern, not fetch-all. Tenant-wide counters use `lib/use-contagem-ao-vivo.ts`.

## Evidence
- Menu counter silent after anonymous channel, 01/10/2026.
- Pipeline without realtime due to a table missing from the publication, until 01/10/2026.
- Persona backup table readable by `anon`, 01/10/2026.
