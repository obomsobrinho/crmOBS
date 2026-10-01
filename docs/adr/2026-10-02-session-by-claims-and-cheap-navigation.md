# Session checked by local claims; navigation and conversation opening made cheap
- Date: 2026-10-02
- Status: Accepted
- Area: data

## Context
Audit front F8 (PERF-01, PERF-04, PERF-05, PERF-08, PERF-09, PERF-10). Measured on the dev server with the e2e owner session, per navigation: 4 Supabase Auth network calls (`/auth/v1/user`: proxy plus `getMyClient`, twice per navigation in dev), TTFB about 300 ms on the list pages and 384 ms on `/inbox/[id]`, which ran 17 Supabase requests. The project signs JWTs with ES256 (public JWKS at `/auth/v1/.well-known/jwks.json`), so the signature can be verified without the network.

## Decision
- `proxy.ts` and `getMyClient()` read the session with `supabase.auth.getClaims()`: signature and expiry verified locally against the cached JWKS. An invalid, tampered or missing token yields no claims and the user goes to `/login` (proved with a tampered and a garbage cookie). Auth calls per navigation: 4 to 0; TTFB about 300 to about 215 ms on list pages.
- Accepted trade-off (owner decision): a revoked or removed user is noticed only when the token expires. Their DATA closes immediately, because RLS checks `user_clients` on every query.
- `getClaims()` falls back to a network `getUser()` for symmetric (HS256) keys. This project uses ES256, so it does not; if the signing key ever goes back to legacy HS256 the gain disappears silently.
- Routes that WRITE something sensitive pass `revalidar: true` to `sessaoDaRota` (`lib/rota.ts`), which re-checks the session at Auth (`getUser()`): `team/invite`, `team/remove`, `clients/[id]/publish`, `clients/[id]/agent-config` (PUT), `clients/[id]/notify-target` (PUT), `billing/subscribe` (POST and DELETE). `signup` has no session. `/perfil` and `/assinatura` keep `getUser()` for the e-mail and creation date, which are not in the claims.
- Per-tenant cache (owner said yes where static per tenant and the invalidation points are clear): ONLY the member list, for pages that just name attendants (`/inbox/[id]`, `/clientes/[id]`, `/pedidos`). `membrosDoTenant` (`lib/team-servidor.ts`) uses `unstable_cache` with tag `membros-{clientId}` and a 300 s TTL as a safety net; `team/invite` and `team/remove` call `invalidarMembros` (`revalidateTag(tag, { expire: 0 })`). `/equipe` and `/assinatura` read the database directly (seat billing must be exact). `use cache` was NOT adopted: it needs `cacheComponents`, which is incompatible with the `force-dynamic` routes that run the whole app.
- NOT cached: `pipeline_stages` (the browser writes them directly under RLS, so there is no server write route to invalidate) and the `clients` row (written by about six routes plus the billing webhook). Caching them needs a write route first; listed in the report as follow-up.
- Opening a conversation: total and first message come from one RPC (`chat_resumo_conversa`), `handoff_at` rides on the `conversations` read the page already did (`AiSummary` skips its own query via `handoffAtInicial`), members come from the cache.
- Small mutations do not `router.refresh()`: renaming a contact and creating a client announce on `lib/contato-bus.ts`; the conversation header and the contact card fix their own name (`useNomeDoContato`), the clients list (no realtime) revalidates its rows through `usePaginada`. `TeamManager` dropped the refresh (it already refetched its own state). Kept on purpose: login, logout, connect WhatsApp, agent on/off, billing, montagem (tenant or auth level).
- Media: signed URLs are requested in a batch (`createSignedUrls`) and cached for 50 minutes (`lib/midia-url.ts`); images are `loading="lazy"`.
- Heavy client UI loads on demand: the Playground inside `AgentTestDrawer`, `FeedbackDialog` (NavRail) and `NovoClienteDialog` (ListaClientes) via `next/dynamic`, mounted on first open.

## Consequences
- A new route that writes something sensitive MUST pass `revalidar: true`.
- Anything that needs the user's e-mail or `created_at` still calls `getUser()`.
- The migration `20261001233334_conversa_resumo_e_membros_do_cliente.sql` creates `chat_resumo_conversa(text)` and `tenant_members_do_cliente(uuid)` (service_role only). Until it is applied, the code falls back to the old queries and logs `membros do tenant (cache)`; the fallbacks can be deleted afterwards.
- Evidence: `/inbox/[id]` went from 17 Supabase requests to 13 after the claims change alone (auth calls gone) and is expected to be 10 with the migration applied.
