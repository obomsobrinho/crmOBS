---
paths:
  - "components/**/*.tsx"
  - "lib/use-*.ts"
  - "lib/*-fonte.ts"
  - "lib/inbox-lista.ts"
  - "lib/ia-bus.ts"
  - "lib/supabase/client.ts"
---
# Realtime

Core (row-level updates, status callback, hidden tab does not fetch) is in `engineering.md`. Details:

- On every `SUBSCRIBED` after the first, refetch (events were missed during the drop). SKIP the first `SUBSCRIBED` on purpose: the data just came from the server, and an e2e fails if the initial load refetches.  (why: docs/adr/2026-08-31-realtime-subscribe-callback-and-focus-refetch.md)
- Also refetch on focus return (`visibilitychange` + `focus`): covers a socket the OS killed while the machine slept.  (why: docs/adr/2026-08-31-realtime-subscribe-callback-and-focus-refetch.md)
- Every subscription goes through `useCanalTenant` or `useCanalConversa` (`lib/use-canal-ao-vivo.ts`), which wrap `assinarComSessao` (`lib/supabase/client.ts`) and own the status callback, the skipped first `SUBSCRIBED`, the focus refetch and the hidden-tab park. Never call `.channel(` or `.subscribe(` in a component (lint enforces it). A channel built before the session is anonymous and mute forever.  (why: docs/adr/2026-10-02-realtime-single-hook-one-tenant-channel.md)
- ONE channel per tenant per tab (`tenant-{clientId}`, tables listed in `ESCUTAS_DO_TENANT`): components subscribe to it and filter their own conversation by the payload `phone` (`foneDoEvento`). Only `chat_messages` has its own channel, filtered by `phone` on the server (highest volume). A new table in that list MUST be in the publication, or the whole shared channel is refused.  (why: docs/adr/2026-10-02-realtime-single-hook-one-tenant-channel.md)
- A handler patches the row from the payload (`modo: "aplicar"`, zero queries) or fetches ONE row; `modo: "buscar"` (default) is for handlers that fetch, and the hook holds their events while the tab is hidden. `revalidar` is the only place that may reread a whole screen.  (why: docs/adr/2026-10-02-realtime-single-hook-one-tenant-channel.md)
- A new channel filters by tenant (`client_id=eq.<id>`); never listen to a whole table.  (why: docs/adr/2026-10-01-production-loading-and-realtime-rules.md)
- Reuse `lib/use-paginada.ts` and `lib/use-contagem-ao-vivo.ts`; the sources are `lib/inbox-fonte.ts`, `lib/pipeline-fonte.ts`, `lib/clientes-fonte.ts`. Do not write a new fetch-everything loop.  (why: docs/adr/2026-10-01-production-loading-and-realtime-rules.md)
- A listened table MUST be in the `supabase_realtime` publication, else Supabase refuses the WHOLE channel. When adding a listener, check `pg_publication_tables`.  (why: docs/adr/2026-10-01-production-loading-and-realtime-rules.md)
- `REPLICA IDENTITY FULL` is required where UPDATE/DELETE events matter (RLS must evaluate the old row). `conversation_qualifications` is append-only and stays on the PK default; if it ever gets update/delete, set `FULL`.  (why: docs/adr/2026-08-31-realtime-subscribe-callback-and-focus-refetch.md)
- Sync trigger `sync_conversation` is DB-side: it increments `unread_count` only for non-null `user_message` of a type other than `imported`. A stale unread badge with the DB at zero means the list missed an event, not that the counter is wrong.
- WhatsApp-down state (`components/WhatsAppBanner.tsx`) is checked in the BROWSER (after load, every 60s, on focus) via `GET /api/clients/[id]/whatsapp-status`. Never call Evolution from a Server Component or layout. `estadoForcado` is preview/test only.  (why: docs/adr/2026-09-11-whatsapp-down-banner-checked-in-browser.md)
