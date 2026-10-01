# One realtime hook, one tenant channel per tab
- Date: 2026-10-02
- Status: Accepted (extends 2026-08-31-realtime-subscribe-callback-and-focus-refetch.md)
- Area: realtime

## Context
The audit (RT-01 to RT-06) found 10 channels and 12+ listeners per tab on `/inbox/[id]`, and 7 `.subscribe()` calls without a status callback. Five of the seven owners also had no focus refetch, which is exactly the class of the 31/08 stale-badge bug. `AiSummary` listened to two whole tables with no filter and ran 2 queries per event of ANY conversation of the tenant, hidden tab included. The 08-31 rule ("callback, skip the first SUBSCRIBED, refetch on focus") existed, but only an ESLint warning enforced it, and each owner had to remember it.

## Decision
1. Every subscription goes through `lib/use-canal-ao-vivo.ts` (`useCanalTenant`, `useCanalConversa`). The module owns: session before channel, status callback with the first `SUBSCRIBED` skipped and `revalidar` on later ones, focus/visibility revalidation (at most once per 10s unless the tab fell behind), hidden-tab park, cleanup. A lint rule now forbids `.channel(` outside it.
2. One channel per tenant per tab (`tenant-{clientId}`) carries `conversations`, `dados_cliente`, `handoffs`, `conversation_qualifications` (INSERT only), `conversation_notes` and `pipeline_stages`, all filtered by `client_id`. Subscribers pick their tables and filter their conversation by the payload `phone`. The channel is shared by refcount and closed 3s after the last subscriber leaves, so navigation reuses it (this also removes the old duplicate-channel-name hazard of the mobile contact panel mounting twice).
3. `chat_messages` keeps its own channel filtered by `phone` on the server: it is the highest-volume table and the server filter spares the tab the other conversations.
4. Two modes: `buscar` (default; the handler fetches, so events are held while hidden and one `revalidar` runs on return) and `aplicar` (the handler only patches state from the payload, so it runs even hidden, with zero queries). `AiSummary`, the assignee and AI switch, the handoffs of a conversation and the notes use `aplicar`; the list, the pipeline cards, the menu counters and `/pedidos` use `buscar`.

## Consequences
- A tab receives every tenant event of the six tables even on screens that use one of them; one listener set per tab replaces ten, and the volume of those tables is small next to `chat_messages`.
- `revalidar` for the open conversation rereads only that row (`ConversationView`), the conversation's handoffs, notes and the qualification banner. Reconnect and focus return now cover them, which they did not before.
- Adding a table to `ESCUTAS_DO_TENANT` that is outside the `supabase_realtime` publication makes Supabase refuse the whole shared channel: check `pg_publication_tables` first.

## Evidence
Audit `RT-01`..`RT-06`, `RELATORIO.md` R-02, R-03, R-21, R-22. `eslint app components lib` shows zero "Never subscribe without a status callback" warnings after the change.
