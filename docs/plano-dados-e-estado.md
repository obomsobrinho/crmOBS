# Plan: data and state, one pattern for the whole app

Status: **Decisions closed by the owner on 11/11/2026** (section 9). Written 10/11/2026. **External review done on 11/11/2026** (owner's vault, `assets/atenda/revisao-spec-2026-11-11/`); its findings 1 to 22 are applied below, with the owner's choices of the same day. **Step 0 delivered on 13/11/2026** (results in its section and in `docs/handoff.md`; the Supabase dashboard check (a) is left with the owner). **Step 1 delivered on 14/11/2026** (its section). **Step 2 partly delivered on 14/11/2026** (its section says what is left for the owner). The current step and the migrated areas are tracked in the "State" block of `.claude/rules/dados-estado-desempenho.md`.

**Performance is the first goal of this plan.** The budget in section 3 is the acceptance criterion of every step and stays a rule after the plan ends. This document is the single roadmap for data, state and performance; the documentation map is in section 6.

Inputs:
- The owner's complaints of 10/11/2026: every screen change shows loading; refresh inside a lead list goes back to the general list; deleting a lead then another answers "Este lead já saiu da lista.".
- The slowness diagnosis of the same day: the production build measured locally against the production Supabase, plus Supabase logs and `pg_stat_statements`.
- The architecture proposal `arquitetura-atenda-2026-11-10.html` and its review `revisao-arquitetura-atenda-2026-11-10.html` (owner's vault, `assets/atenda/`). Every item the review marked "to check" was checked in the repository and in the database; the answers are inline.

Relation to `docs/plano-carregamento.md`: that plan is **kept and referenced, not replaced**.
- Its six owner rules stay binding: paginate by 10 with infinite scroll, server search with debounce, realtime touches only the changed row, a hidden tab does not fetch, Conversas opens on "today" plus open help requests, messages load only when the conversation opens.
- Its database work (keyset list RPCs, trigram search, `(select auth.uid())` in RLS) is the foundation this plan builds on.
- What this spec supersedes is its browser layer: the generic `lib/use-paginada.ts` and the per-screen fetch hooks are replaced, area by area, by the query layer below.

Out of scope for the whole plan:
- **Design** (Light theme weight on the other screens, component audit, accessibility, critique, copy). The owner decided on 10/11/2026 that the design front starts only after this whole plan is executed. The component audit is NOT a prerequisite of the Base. The track it will follow is fixed in section 7; the only design work inside this plan is the single pattern for the new screen states (7.1), defined in the Base.
- Bulk selection with batch actions in the Leads tab (noted for later).
- Cache Components / `experimental.staleTimes` / `unstable_instant` (Next 16). Re-evaluated after Step 3, with measurements (2.3 says why `prefetch={true}` comes first).
- Buying a bigger Supabase compute. Step 0 measures; the purchase is the owner's call with the numbers.

## 1. What is wrong today (measured)

| Symptom | Cause in the code | Number |
|---|---|---|
| Every click shows a loading screen | Every page and layout is `force-dynamic` and awaits all reads before returning anything; the only per-screen skeletons are `inbox/[id]` and `clientes/[id]`, the rest falls back to the generic `app/(app)/loading.tsx` | Click to new screen 0.2 to 4.7 s on the local production build; up to 14.8 s for one read in production at 12h15 BRT, 10/11 |
| Server waterfalls | Pipeline, Pedidos and Agenda await 3 rounds in series; Painel 2 | each round = one Supabase round trip |
| Campanhas re-reads on every tab switch and on the way back | `useLeitura` keeps data in component state; unmount drops it. It also re-reads in the browser what the server just sent | 2 to 5 reads per click (0.07 to 0.36 s warm, 1 to 5.8 s in a spike) |
| Refresh loses the open list and filters | `tela` and every filter are `useState`; no component reads the URL (`useSearchParams` is used nowhere) | all screens |
| Delete then delete again: "já saiu da lista" | after a delete `useLeitura` keeps the OLD page on screen until the re-read returns; the deleted row stays clickable; the total is stale | the stale window = one re-read |
| Five ways to read, four ways to update after a write | `useLeitura`, `usePaginada`, `useCarga`, `lembrar` (admin), per-screen hooks; local patch, `versao` bump, `contato-bus`, `router.refresh` | none written down as a rule |
| Three error shapes from the API | `{ error }` (148 places), `{ ok: false, erro }` (14), `{ ok: false, error }` (1); no browser handling of 401; no `error.tsx` anywhere | |
| Inputs checked by hand | the 62 routes check bodies with `typeof`; 34 files read `process.env` directly with no schema; webhooks from n8n, Asaas, Apify and the crons are parsed by hand | |
| No production performance numbers | no Web Vitals, no `Server-Timing`, no navigation timing | the 14.8 s was found in Supabase logs, by hand |

## 2. The pattern

### 2.1 Three places for state, no mixing

| State | Lives in | Examples |
|---|---|---|
| Server data | TanStack Query cache (browser) | lists, pages, counters, a lead, a campaign |
| Navigation | URL, through nuqs | tab, open list, filters, search, page, open item |
| Interaction | `useState` in the component (or react-hook-form inside a form, 2.12) | dialog open, field being typed, focus, hover |

No global store and no Context for database data. Context is allowed only to inject the data SOURCE (real or fake for `/design`), never data, with one exception: the session (tenant id, role, access kind and the other scalars of `getMyClient`), read once by the `(app)` layout and handed to the screens (2.3, decision of 14/11/2026).

### 2.2 Read and write path, by operation type (D1)

Tenant screens read directly from the browser through RLS; API routes carry sensitive and business writes. Admin areas (Campanhas, `/clientes`) read through API routes because they read with `service_role` and RLS does not cover them.

```
READ (tenant screen)     component -> area hook -> useQuery(queryFn = area source) -> supabase-js (browser, user JWT) -> PostgREST -> RLS -> RPC/table
READ (admin area)        component -> area hook -> useQuery -> fetch /api/admin/... -> rotaDoAdmin -> Zod -> service (service_role) -> Postgres
COMMON WRITE             component -> useMutation (optimistic) -> supabase-js on a GRANTED column only (data.md) -> RLS
SENSITIVE / BUSINESS     component -> useMutation (optimistic) -> fetch /api/... -> sessaoDaRota or rotaDoAdmin (revalidar) -> Zod -> service -> Postgres
MACHINE CALLERS          n8n, Asaas, Apify, pg_cron, Vercel Cron -> /api/... -> secret check -> Zod -> service -> Postgres
BACK CHANNEL             Postgres -> Realtime -> useCanalTenant / useCanalConversa -> cache bridge (2.7) -> setQueryData or invalidate
```

Why not every read through a route (measured on 10/11, local production build, warm database): reads through an API route took 66 to 360 ms (median about 130 ms) against 53 to 101 ms for direct browser reads, and every read would become a Vercel invocation.

### 2.3 First paint: the click never waits for data

Where the request waits today (checked):
- `proxy.ts` runs on every request (documents, RSC and prefetches): `auth.getClaims()`, local JWT check, no network except when the token expired (then one call to `/auth/v1/token`, measured 351 to 572 ms, once per hour per user).
- `app/(app)/layout.tsx` awaits `getMyClient()` and then `agendaAtivaDoTenant()`.
  - `getMyClient()` is getClaims plus `clients` and `user_clients` in parallel: one round.
  - `agendaAtivaDoTenant()` is a second round, inline in the JSX.
  - `estadoDoConsumoDoTenant` is inside `<Suspense fallback={null}>` and does NOT block.
  - On a client navigation inside the `(app)` group the layout is not re-rendered (Next partial rendering), so these rounds cost only on a hard load and on prefetches.
- Every page awaits the session again (`requireActiveTenant`, `getMyClient` or `adminDaPagina`, memoized per request) and then its data.
- `app/(app)/contatos/layout.tsx` and `app/(app)/inbox/layout.tsx` await their first list page. A `loading.tsx` inside those folders sits BELOW their layout, so it cannot show before the list read; today the generic `(app)/loading.tsx` covers them.

The pattern:
1. **Every route has its own `loading.tsx`** that draws the screen's static frame (title, tabs, filters, buttons, empty blocks) with no data and no session.
   - In production `<Link>` prefetches every dynamic route up to its loading boundary, so this frame paints at the click.
   - The session gate keeps running in the page on the server while the frame is visible. The frame holds nothing sensitive, and a redirect still happens before any data appears.
2. **Pages and segment layouts do not await data.** They await only the gate (session, tenant, access) and render the client screen, which reads through `useQuery`. Segment layouts that read lists (`contatos`, `inbox`) stop reading.
3. **Data blocks use `useQuery` and show their own skeleton while `isPending`.**
   - No Suspense for data: `useSuspenseQuery` in a client component also runs during SSR in the App Router, without the browser session.
   - No server prefetch and no `HydrationBoundary` in the initial scope; re-evaluated only for Conversas, in Step 4, with numbers.
4. Server reads that stay (the gate, an `?abrir=` lookup) run in parallel, never in series.
5. **A screen already visited opens without waiting for the server** (review finding 1). The frame alone is not enough: Next drops a dynamic page on every navigation (`staleTimes.dynamic` defaults to 0; `next.config.ts` sets nothing, and the NavRail links use the default prefetch, which stops at `loading.tsx`). So the screen component mounts only after the gate answers, and the gate reads Supabase (652 ms p50, 7 s p90 on 10/11), even when its data is in the TanStack cache.
   - **Mechanism (owner, 14/11/2026, replaces the `prefetch={true}` of 11/11): no database on the click, and prefetch on intent.** A migrated page does not read the database at all on the server: `proxy.ts` already checks the login token locally, the `(app)` layout reads the session once (`getMyClient`, on a hard load only) and hands it to the screens through the one session context (2.1), and a client guard redirects (blocked to `/assinatura`, attendant out of owner-only screens, deactivated to `/conta-desativada`) from that context. The real lock is RLS plus the write routes (`sessaoDaRota({ ativa: true })`). With no database behind the page, prefetching it costs nothing on the database, and it is done on intent only: hovering or touching a menu item prefetches that route (and the first page of its main query, 2.4), never every visible link. Consequence accepted by the owner: a company blocked during use keeps seeing screens until a reload or focus return, and cannot write anything.
   - Alternative, re-evaluated only after Step 3: `experimental.staleTimes.dynamic`. It is global, so it would also cache the unmigrated pages that still bring data from the server.
   - A link outside the screen is not prefetched (the "Mais" menu items on the phone): those open with the frame, then the cached data.
   - Step 0 confirms the behavior before the Base is written: "A, B, back to A" with the navigation RSC delayed 3 s.
   - **Blocked account (owner, 14/11/2026):** the delay is accepted, and the write routes become the lock: the 9 of the 10 routes below that write without `ativa` get it in Step 1; `team/remove` stays open (removing a member lowers what a blocked company pays) and `billing/subscribe` stays open (it is where it pays). What was checked in the code on 13/11/2026:
     - 14 write routes refuse a blocked account at once through `sessaoDaRota({ ativa: true })` (`lib/rota.ts`, 402): agenda (agendamentos, agendamentos/[id], bloqueios, config), `clients/[id]/{agent-rules,connect-whatsapp,disconnect-whatsapp}`, `contacts`, `conversations/{instrucao,orientar,resolve}`, `playground`, `send`, `team/invite`.
     - 10 writing routes use `sessaoDaRota` without `ativa`: `clients/[id]/{agent-config,publish,notify-target,notify-target/teste,knowledge,knowledge/process,knowledge/upload-url,whatsapp-media/upload-url}`, `playground/transcrever`, `team/remove`. `billing/subscribe` has no `ativa` and must not (a blocked account pays there). Whether each of the 10 is intentional is not judged here.
     - Direct browser writes on granted columns are blocked for a blocked account only if RLS or the grants say so (review, D1 note): not checked in the database.

Trade-off accepted: on a first visit the data starts after hydration (measured about 350 ms after the RSC response on the local build), instead of arriving in the HTML. In exchange the click never waits, and every later visit opens from the cache.

### 2.4 Query client configuration

| Option | Value | Why |
|---|---|---|
| `staleTime` | 30 s for lists and counters; 5 min for configuration (stages, team, plans) | realtime keeps lists current; configuration rarely changes |
| `gcTime` | 30 min | agreed with the review: memory is cheap and more screens open from the cache. A tab with Conversas open all day stays bounded because only visited keys are kept |
| `refetchOnWindowFocus` | `false` for areas with realtime; `true` for areas without it (Campanhas, the `/clientes` central) | `useCanalTenant`/`useCanalConversa` already revalidate on focus return (`realtime.md`); both on would read twice, so their focus callback invalidates the area keys instead. An area with no channel has no hook doing that, so the query does it |
| `refetchOnReconnect` | `false` | agreed with the review, same reason: the realtime hooks refetch on every `SUBSCRIBED` after the first |
| `retry` | queries: 1, only on a network error or a 5xx, never on 401, 403 or 404; mutations: 0 | a repeated write can duplicate; the error goes to the screen. Repeating a 401, 403 or 404 only delays the answer |
| `placeholderData` | `keepPreviousData` on every list | changing a filter, a search or a page keeps the previous result on screen until the new one arrives; without it every key stroke in a search creates a new key and the list blinks into a skeleton |
| Prefetch on intent | hovering or touching a menu item prefetches the first page of that screen's main query | the first visit gains 100 to 300 ms (review finding 17) |
| Persist the cache on the device | no | tenants' customer data (LGPD) on possibly shared devices |
| Client lifetime (browser) | the `QueryClient` comes from a provider whose React `key` is the user id plus tenant id (one login works in one company only, owner 14/11/2026, so in practice it changes with the user) | when the identity changes the cache is a new one, with no `clear()` anyone has to remember. Today there are two `signOut` points (`LogoutButton`, `NavRail`) and no `onAuthStateChange`, so signing out and in as someone else in another tab would not clear this one; a new user or tenant mounts a new client. Keys still do not carry the tenant id, because a client never outlives its identity |
| Client lifetime (server) | a new client per request, never a module-level shared one | a shared server client would mix users |

### 2.5 Query keys: one format

`[area, entity, kind, params?]`, built only through one key factory per area, never written inline.

```ts
// features/campanhas/api/chaves.ts
export const chavesDeLeads = {
  tudo: ["campanhas", "leads"] as const,
  listas: () => [...chavesDeLeads.tudo, "lista"] as const,
  lista: (p: ParamsDaLista) => [...chavesDeLeads.listas(), p] as const,
  detalhe: (id: string) => [...chavesDeLeads.tudo, "detalhe", id] as const,
  escrita: (acao: "tirar" | "marcar") => [...chavesDeLeads.tudo, acao] as const, // mutation keys
};
```

Invalidation is always by prefix (`chavesDeLeads.listas()` refreshes every list and keeps the details).

Mutation keys have three levels, `[area, entity, action]` (`["campanhas", "leads", "tirar"]`), built by the same factory. The "last pending write" check (2.6) looks at `[area, entity]`, never at the full key and never at `[area]`: removing a lead and marking a lead touch the same lists with different actions, and checking only the action would let one write's invalidation erase the other's optimistic change (review finding 8).

### 2.6 Writes: optimistic, safe under rapid clicks

Every mutation follows the same script:
- change the cache at the click;
- if the server refuses: show the reason and let the final invalidation bring the row back (review finding 9). Never restore a snapshot of the whole list, which would erase the other pending mutations;
- invalidate only when it is the last pending mutation of its `[area, entity]`;
- totals change together with the rows.

The source always THROWS on failure, a typed `ErroDaApi` with the HTTP status, the `codigo` and the sentence (2.9), so a 401 reaches the global handler and every failure goes through `onError` only. A result that is the same end state as success is success INSIDE the source: on a delete, `nao_encontrado` means the row is already gone, and the source returns normally.

```ts
// features/campanhas/api/leads.ts (illustrative; helpers tested in Step 1)
// fonte.removerLead throws ErroDaApi on failure and resolves on "nao_encontrado"

export function useTirarLead(buscaId: string | null) {
  const qc = useQueryClient();
  const fonte = useFonteDeCampanhas();
  return useMutation({
    mutationKey: chavesDeLeads.escrita("tirar"), // ["campanhas", "leads", "tirar"]
    mutationFn: (id: string) => fonte.removerLead(id, buscaId),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: chavesDeLeads.listas() });
      qc.setQueriesData({ queryKey: chavesDeLeads.listas() }, tirarDaPagina(id)); // removes the row, total - 1
    },
    onError: (erro) => avisarRecusa(erro), // the reason in place, or the global notice if the screen is gone
    onSettled: () => {
      // the current mutation still counts here: 1 means "I am the last write on leads"
      if (qc.isMutating({ mutationKey: chavesDeLeads.tudo }) === 1) {
        invalidarComAtraso(qc, chavesDeLeads.listas()); // the same debounced invalidator the realtime uses (2.7)
      }
    },
  });
}
```

- The reason is shown in place, with the shared error component (2.9). If the person already left the screen there is no place: the error goes to one global notice (a toast from the app layout).
- The final invalidation goes through the same debounced invalidator as the realtime bridge (500 ms), so the echo of our own write and the write's invalidation become one read (2.7).
- **Exception, the inverse operation**: putting back exactly the refused row without waiting for the re-read is allowed only where the wait is a measured problem. Then the context (which keys held the row and where) is stored per key, because the same row lives in several cached lists (filters, pages) and is absent from others; reinserting it in every key would put it where it never was and add to totals nothing was taken from.
- The `isMutating(...) === 1` check inside `onSettled` is the concurrent-optimistic-update pattern recommended by the TanStack maintainers. A Vitest unit test proves it in Step 1 before Campanhas uses it, including two different writes (remove and mark) on the same list.
- One cache helper, `tirarDaPagina`, plus the patch by id; both work on the two list shapes, `{ itens, total }` and `{ pages: [...] }`, and are pure functions (tested).

### 2.7 Realtime into the cache, by event type

`lib/use-canal-ao-vivo.ts` stays the only place that opens channels. What changes is what the callbacks do: they write to the cache through one bridge per area instead of touching component state.

**Where the bridges live** (review finding 5): registered ONCE, in the `(app)` layout, on the tenant channel that already exists once per tab. Not in the screens: today the 11 channel consumers are all screen components, and a bridge registered by a screen would lose the events that arrive while the person is on another screen, leaving the cache "fresh" for 30 s with a stale list. For a key whose screen is not mounted, invalidation only marks it stale (no read); coming back reads it again.

**When the bridge file is born** (review findings 2 and 21): Step 1 does NOT touch `lib/use-canal-ao-vivo.ts`. The bridge is a new file (`lib/realtime/`), written and wired in the first step that has a realtime consumer, Step 3a (Pedidos). Campanhas (Step 2) has no channel.

| Event | Rule |
|---|---|
| UPDATE | Patch the row in every cached key that holds it (`setQueriesData` by id), comparing the `new` row with the cached row; never depend on `old`. If a sort or filter column changed (e.g. `last_message_at`, `stage`), apply the list's INSERT rule below for the lists it now enters and remove it from the lists it leaves. |
| INSERT | Per list, in the table below. Default for the tenant lists: today's behavior (fetch ONE row and place it, or patch from the payload). Invalidation only for counters and for lists without a placement rule. Invalidation is debounced (500 ms, the value `inbox-fonte` already uses) so a burst becomes one read. |
| DELETE | **Hypothesis to confirm in Step 0** (below). Remove that id from the cache if present; a DELETE of an id that is not in the cache is ignored (a bulk cleanup must not trigger a re-read in every open tab). Never decide which tenant a row belongs to from a DELETE, whatever the test shows. |
| Echo of our own write | Harmless by construction, no suppression (review finding 6): applying by id is idempotent, and the write's final invalidation goes through the same debounced invalidator, so echo and write become one read. Holding an area's events while a write is pending would hold customer messages during a slow send in Conversas, and the echo usually arrives after the write has finished anyway. |
| Reconnect (`SUBSCRIBED` after the first) and focus return | Invalidate the area's keys (replaces today's per-screen refetch). The first `SUBSCRIBED` is still skipped. |

INSERT per list (review finding 4). In an infinite list, invalidating re-reads every loaded page in sequence (15 scrolled pages of Contatos = 15 reads per new contact), which breaks the owner's rule "realtime touches only the changed row":

| List | INSERT does | Why |
|---|---|---|
| Conversas list (Step 4) | fetch the row and place it with `encaixar` (`lib/inbox-lista.ts`), as today | pure placement rule exists |
| Open conversation messages (Step 4) | append the new message from the event payload, skipping an id already present; never invalidates the message list | a message must show at once; ids make the append idempotent |
| Contatos (Step 3b) | today's behavior of `lib/clientes-fonte.ts` and its screen | default |
| Pipeline columns (Step 3b) | today's behavior of `lib/pipeline-fonte.ts`; a stage change by the AI moves the row between the cached columns, no column re-read | default |
| Pedidos (Step 3a) | today's behavior of the Pedidos screen | default |
| Notes, tags (with their screen) | patch from the payload, as today | default |
| Counters (NavRail, Pedidos tabs, Painel blocks) | debounced invalidation | an aggregate has no row to place |
| Campanhas (Step 2) | no realtime today; if one is added, debounced invalidation | no placement rule |

Each step confirms its list's row against the code before migrating it; "today's behavior" is the reference, and Step 3's criterion "RPC call counts not higher than today" locks it.

**DELETE, to confirm in Step 0** (review finding 3). The spec of 10/11 said, "checked in the docs", that DELETE events are not filterable and that under RLS `old` carries only the primary key. The Supabase Postgres Changes page read on 11/11/2026 says DELETE can be filtered when the table has `REPLICA IDENTITY FULL`, and confirms RLS is not applied to DELETE; the sentence about "only the primary key" was not found. Code that depends on it today: `components/ContactNotes.tsx` (line 100) reads `ev.antigo` on DELETE and filters by `conversation_id`. If the 10/11 reading were right, that is already broken; if the 11/11 reading is right, the `realtime.md` change of 11/11 replaced a true sentence with a false one, so it was reverted with a note. Step 0 runs the test on the real project (item 4 there) and the final rule is written from its result.

**Result (13/11/2026, Step 0):** with two tabs of the OBS tenant on the test conversation (DDD 00), a note created in tab A reached tab B (INSERT, full `record`); deleting it in A sent tab B a DELETE whose `old_record` was `{"id": 4}`, only the primary key, although `conversation_notes` is `REPLICA IDENTITY FULL`. The 10/11 reading holds for `old`. Consequence today: `ContactNotes.tsx` reads `conversation_id` from that `old`, gets nothing, and never removes a note deleted in another tab (seen on screen). The DELETE event did arrive on the channel filtered by `client_id`, a column it does not carry, so a tenant filter cannot be what selects it; whether it also reaches another tenant's channel was not tested (no second tenant login), and the rule stays "never decide the tenant from a DELETE" either way. `realtime.md` and `dados-estado-desempenho.md` were rewritten from this result.

`REPLICA IDENTITY FULL` keeps the old values on UPDATE. Today 7 published tables are FULL and `conversation_qualifications` is default (append-only).

### 2.8 URL state (D3: nuqs)

Tab, open list or item, filters, search, sort and page live in the URL, read and written through nuqs with one parser per parameter.
- Opening a list or an item pushes a history entry; typing a filter or a search replaces it (debounced, the same 300 ms).
- The server page reads the same parameters, through the same parsers, to choose redirects and the frame. The route's `loading.tsx` does NOT receive the URL parameters, so the frame draws only what does not depend on them (no active tab, no filter chips), or it jumps when the page arrives.
- Always the shallow mode (nuqs's default). In the other mode every filter change becomes a server request.
- Every parameter has a nuqs parser, and nothing behind it: nuqs parsers already fall back to the default on an invalid value, so a hand-edited URL never crashes a screen. No Zod in the URL layer (review finding 19, D4 adjusted): it would put Zod in the JS of every route for no gain.
- URL state lands with each screen, in the step that migrates it (review finding 15): the query key depends on the filters, so doing it later means touching the screen twice.
- nuqs's support for Next 16.2 and its compressed size are checked at install (Step 1) before it is added; if either fails, the fallback is a small own helper on `useSearchParams` plus `window.history.replaceState`/`pushState` (which Next 16 syncs with the router), and the owner is told.

### 2.9 Validation, errors, session expiry (D4, adjusted on 11/11/2026)

**Validation.** Every input the server receives crosses a Zod schema before it is used, and the TypeScript type comes from the schema. URL parameters are the exception (nuqs parsers only, 2.8), and the n8n webhooks validate without refusing:

| Input | Where the schema lives | When |
|---|---|---|
| API route bodies and query strings | `schemas.ts` of the area (next to the area's files until it moves, 2.13), applied by a helper inside `sessaoDaRota`/`rotaDoAdmin` | area routes in their step; every remaining route in a final sweep (Step 5) |
| Webhooks from n8n (`/api/agent`, `/api/inbound-media`, `/api/clients/by-instance/[instanceName]`) | the Conversas area's `schemas.ts` | Step 4, with the n8n battery before and after. **Validate and log, never refuse** (review finding 18), except a missing field without which the handler cannot work at all; that refusal raises a notice to the owner, not only a log (the channel is settled in Step 4). The schema tolerates extra fields. The caller is the owner's own flow behind a secret, so refusing buys almost nothing, and a future n8n change would stop attendance silently |
| Asaas webhook (`/api/billing/webhook`) | the Assinatura area's `schemas.ts` | Step 1 in shadow mode, enforced in Step 3a if the shadow week had zero mismatches |
| Apify webhook and the crons (`/api/prospeccao/apify`, `/api/prospeccao/cron`, `/api/agenda/lembretes`) | the owning area's `schemas.ts` | Step 2 (Campanhas) and Step 3b (Agenda), shadow mode first |
| URL parameters | the nuqs parsers (2.8), no Zod | with each screen |
| Forms | the same schema through the react-hook-form resolver (2.12) | new or complex forms |
| Environment variables | one `lib/env.ts`: server variables and `NEXT_PUBLIC_*` in two schemas, optional ones marked optional with the degradation `data.md` already describes (e.g. without `APIFY_TOKEN` "Nova busca" answers 503) | Step 5: validated once against the Vercel variable list, enforced the same day the owner confirms the list. No shadow week (review finding 20): environment variables do not change with traffic |

**Shadow mode** for Asaas, Apify and the crons: the schema parses and logs every mismatch without rejecting, for at least one week of real traffic. Only after zero mismatches (or after the schema is fixed to match what the callers really send) does it start to reject. A webhook that starts refusing real payloads would break billing silently.

**One error shape** for every API route: HTTP status plus `{ error: string, codigo?: string }`.
- `error` is the sentence the screen shows (Portuguese); `codigo` is the machine reason (`nao_encontrado`, `ativa`, ...).
- It keeps the shape 148 places already use; the 15 occurrences of `{ ok: false, erro }` and `{ ok: false, error }` converge to it area by area.
- Webhook answers keep whatever status and body their caller expects (n8n and Asaas read them); the shape applies to routes the app calls.

In the browser, the area source turns any failure into a thrown `ErroDaApi` (status, `codigo`, sentence); it never returns an error as a value (2.6).

**Session expired**: one global handler on the query client (queries and mutations); no screen handles 401 by itself.
- First, renew the session once (through supabase-js) and repeat the call. A 401 guarantees nothing was written, so repeating does not duplicate.
- Only if it fails again: send to `/login`. **Without a return to the URL** (found in Step 1): docs/adr/2026-09-30-pedidos-detail-is-a-request-sheet-not-a-chat.md records the owner's decision that login does not return to the requested link, for security. The review's "keep the URL to come back" contradicts it; the owner confirmed on 14/11/2026 that login does not return to the link (D14).
- A reply being typed in Conversas is kept as a draft (per conversation, in the browser) before the redirect, and restored when the person comes back.

**Errors per block**: a query error renders the block's error state with "Tentar de novo" (one shared component), never a blank screen. A render crash is caught by `app/(app)/error.tsx` (none exists today).

### 2.10 Observability in production (D7 reversed by the owner on 14/11/2026: no own beacon)

The own beacon (browser marks written to a table in the same database) is dropped: one write per navigation on the database that already stalls, for numbers the lab tests and the Supabase logs already give. What stays:
- **Lab**: the budget tests of 3.2 (B1 to B4, B8, B10) on the production build, every delivery.
- **Production, database side**: the Supabase edge logs (B9), free and already there; one saved query (p50, p90, p99 of `/rest/v1/*` upstream time per working hour) in `docs/instrumentacao-uso.md`, read weekly into `docs/handoff.md`.
- **Production, browser side (B5 to B7)**: not measured by us. If the owner wants it, an external tool (Vercel Speed Insights) is the way, his call.

### 2.11 Source injection and `/design`

The `queryFn` calls the area SOURCE (today `lib/*-fonte.ts`, after the move `features/<area>/api/fonte.ts`), taken from a provider. `/design` mounts the same provider with the fake source (`fonte-de-mentira`), so the design e2e suite keeps running without a database. A source never imports the query client; a hook never imports `supabase-js` directly.

### 2.12 Forms (D5: ready in the Base, used when needed; the Base delivers only `components/ui/form.tsx` and one example page, nothing else)

The app has few forms today and they work; none is migrated. The pattern is ready from the Base so a new or complex form (the owner expects verticalized segments to bring them) starts on it:
- react-hook-form plus `@hookform/resolvers` with the area's Zod schema, and the shadcn `Form` component added to `components/ui/form.tsx` on top of the existing `input`, `select`, `checkbox`, `textarea` and `switch`.
- "Complex" means more than a couple of fields, cross-field validation, or a field array. A one-field form (a search, a rename) stays a controlled input.
- The submit is a `useMutation` (2.6), so the same optimistic and error rules apply.
- Bundle: the library loads only on routes that render a form; its size is measured at install (B8).

### 2.13 Folders: vertical slice (D6)

Each business area owns one folder; `app/` keeps only thin routes; `lib/` keeps only infrastructure.

```
app/                         routes only: page.tsx, layout.tsx, loading.tsx, route.ts (thin: gate, schema, call the area)
features/
  <area>/                    campanhas, contatos, conversas, pipeline, painel, agenda, pedidos, agente, conhecimento, equipe, assinatura, central
    components/              the area's screens and blocks
    hooks/                   the area hooks (useLeads, useTirarLead): the only door from a component to data
    api/                     key factory (chaves.ts), queryOptions, mutations, the source (fonte.ts) and its fake (fonte-de-mentira.ts)
    server/                  services used by routes and pages (today's *-servidor.ts), server-only
    schemas.ts               Zod: route bodies, webhooks, URL parsers, forms
    regras.ts                pure business rules (no I/O), with their Vitest tests next to them
components/
  ui/                        base layer (shadcn and our variants), unchanged rules
  shared/                    used by several areas: NavRail, banners, avatars
lib/                         infrastructure only: supabase/, query/, realtime/, env.ts, format.ts, fuso.ts, utils.ts
```

- Pure rule modules that several areas share and that the rules files cite by path (`lib/billing.ts`, `lib/mensagem.ts`, `lib/periodo.ts`, `lib/avisos.ts`, `lib/horarios.ts`, ...) stay where they are until a delivery updates every citation in `.claude/rules` and `CLAUDE.md` in the same commit (`npm run checar` fails on a cited path that moved).
- **An area moves when it is touched** (review finding 21): in the step that migrates it, in a commit with only `git mv` and import updates, before or after the behavior commit, never mixed. No empty skeleton for the 12 areas and no bulk move of areas that do not change behavior (agente, conhecimento, equipe, assinatura): that would touch paths cited by rules and ADRs, with risk and no gain for the user. Those move the day a delivery changes them.
- The six subfolders are for areas that need them. A small area (equipe, perfil, assinatura) can be one flat folder until it grows.
- Until an area's move commit, a new file of that area goes next to the area's current files (`components/`, `lib/`). After it, in `features/<area>/`. A new area that does not exist yet starts in `features/<area>/`.
- Lint on a new file loose in `lib/` or at the root of `components/` applies only to migrated areas (it cannot tell an unmigrated area's file apart otherwise): it is written as a per-area check when the area moves, not as a global warning in Step 1.

## 3. Performance budget

Every number below says where it came from:
- "Measured" means measured on 10/11/2026: the production build run locally (`next build` + `next start`) against the production Supabase with the owner's session, Playwright timing scripts, and the Supabase logs.
- "External" means a published threshold, named.
- Nothing else.

### 3.1 The budget

| # | Metric | Baseline | Budget | Source of the budget |
|---|---|---|---|---|
| B1 | Click to the screen's frame, client navigation, with the navigation response delayed 3 s | no per-screen frame on most routes; the generic skeleton or the old screen stays until the server answers (0.2 to 4.7 s measured; 14.8 s for one read in production) | ≤ 300 ms | external: Nielsen's response limits (0.1 s feels instant, 1 s keeps the flow); 300 ms leaves room for the test machine over the 0.1 s target |
| B2 | Blocking requests when opening a screen seen in the last 5 min (prefetch on intent plus the cache, 2.3), counting the navigation (RSC) request as well as the data reads | 1 server render plus 0 to 5 reads (Campanhas: 5 on the way back) | 0 | the owner's rule ("the click is instant, only dynamic data loads") |
| B3 | Duplicate reads of the same data in one visit | Campanhas reads on the server and again in the browser: 5 duplicates per entry | 0 | the same rule; a duplicate is pure waste |
| B4 | Optimistic write visible before the API answers, with the API delayed 1 s | the row stays until the re-read (seconds in a spike) | the row is gone before the API responds (asserted, not timed: Playwright polls at intervals of the order of 100 ms, so a 100 ms stopwatch would flake) | external: Nielsen 0.1 s is the intent |
| B5 | Production, click to frame, p75 per route per day | not measured (no tool today) | ≤ 300 ms | B1 in the field |
| B6 | Production, click to first data, p75 per route per day | not measured; the Supabase edge saw 652 ms p50 and 7 s p90 for the session read alone on 10/11 | ≤ 1 s | external: Nielsen 1 s |
| B7 | Production hard load: LCP, INP, CLS at p75 | not measured in the field. Local TTFB 0.19 to 0.34 s on Agenda, Agente, Campanhas, Nova busca, Clientes, Equipe and Perfil; 1.4 to 4.8 s on Painel, Conversas, Contatos, Pipeline and Pedidos (cold database, server reads before the HTML). FCP lands about 80 ms after TTFB, so the server decides first paint | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 | external: Google Core Web Vitals "good" thresholds (web.dev) |
| B8 | JS on a hard load, compressed, per route | login 227 kB; tenant routes 277 to 321 kB (Painel 285, Conversas 302, Contatos 295, Pipeline 309, Pedidos 316, Agenda 312, Agente 321, Equipe 297, Perfil 277, Clientes 300); Campanhas 465 kB, Nova busca 446 kB | login ≤ 240 kB; any tenant route ≤ 340 kB; Campanhas and Nova busca ≤ 480 kB, the owner's exception (D15, 14/11/2026: the results charts stay in the first view; Step 2 loaded the rest on demand, 472 kB); a route growing more than 10 kB in one delivery says why in its handoff line | measured baseline plus the Base's known cost (TanStack Query 10.8 kB measured) and a small margin. Zod, nuqs and react-hook-form are measured at install, and the ceilings are confirmed or adjusted with the owner then |
| B9 | Supabase REST latency at the edge (upstream time), per working hour | p50 96 to 396 ms, p90 about 0.9 to 2.8 s, p99 1.4 to 9 s (24 h to 10/11); best warm hour p50 6 ms, p90 83 ms (6,029 requests) | p90 ≤ 300 ms, p99 ≤ 1 s | measured: the warm hour shows the database can do it; the gap is what Step 0 attributes |
| B10 | Server rounds before a page can render | Pipeline, Pedidos, Agenda 3; Painel 2 | Step 0: ≤ 2; from Step 3: the gate only (1) | measured |

### 3.2 How each number is measured and locked

| # | Measured by | Locked by |
|---|---|---|
| B1 | Playwright against `next build` + `next start`: `page.route` delays RSC navigation requests (those without the `next-router-prefetch` header) by 3 s, which delays the session gate too; the test waits for the link's prefetch to finish, then clicks the menu item and asserts the frame's heading is visible. Menu items outside the screen (the phone's "Mais") are not prefetched and are tested apart | a new e2e project on the production build (`frame`), with an allow-list of routes that grows per step; run by `fechar-entrega` |
| B2, B3 | the same harness counts requests between the click and the data on screen, the navigation (RSC) request included, and flags two requests for the same query key or route in one visit. B2 runs "A, B, back to A" | same e2e project |
| B4 | e2e per area with writes: API delayed 1 s, five deletes in a row, each row is gone before its API call answers and the total is right; plus the Vitest test of the concurrent-delete helpers | the area's e2e suite and `npm run test:unit` |
| B5, B6, B7 | not measured by us since 14/11/2026 (no own beacon, 2.10); an external tool only if the owner wants it | the saved query, read weekly into `docs/handoff.md`; a route over budget for 3 days in a row (each day with the minimum sample; otherwise its weekly reading counts) is a bug ahead of new features, below attendance bugs (attendance comes first, `CLAUDE.md`) |
| B8 | a script after `next build` that sums the compressed JS each route loads, checked once against the Playwright figure above | the script fails above the ceiling; `fechar-entrega` runs it after the build (`checar` stays offline and does not build) |
| B9 | the hourly edge-log query used in the diagnosis (`edge_logs`, upstream time, `/rest/v1/*`), saved in `docs/instrumentacao-uso.md` | weekly read into `docs/handoff.md`; the fix it calls for is the owner's call (Step 0) |
| B10 | the Supabase edge log timeline of one navigation (Step 0); after Step 3, B1 makes a waterfall visible as a failure | B1 |

There is no CI in this repository (no `.github/workflows`), so "locked" means the `fechar-entrega` skill and the PostToolUse lint hook, as for every other rule here. Step 1 adds `npm run test:unit` and the B8 script to `fechar-entrega`.

## 4. Steps

Each step closes with:
- the `fechar-entrega` skill (types, lint, build, the right suites, and from Step 1 the unit tests and the B8 script);
- the owner's flow: implement, show him, tests, `/simplify` and `/code-review`, `main`;
- one ADR or rule update when it introduces a rule;
- the "State" block of `.claude/rules/dados-estado-desempenho.md` updated in the same commit that closes the step (steps done, areas migrated).

Every step that migrates an area also: moves the area into `features/<area>/` in a commit of its own (no behavior change, never mixed with the behavior commit); puts that screen's navigation state in the URL (2.8); turns on prefetch on intent on that area's menu links and drops the database from its page (2.3, D8); adds the area's routes to the `frame` allow-list.

Every migration applied in production during the plan runs outside attendance hours: each one reloads the PostgREST schema cache, and one reload happened a minute before the worst spike of 10/11 (Step 0, item 3).

**Start condition**: met. The external review was done on 11/11/2026 and its findings are applied; Step 0 is released.

### Step 0: immediate relief and the root cause of the 14.8 s

Independent of the migration.

Scope:
1. **Parallel server reads**:
   - Pipeline: `getMyClient` and `pipeline_stages` together, then the columns (3 rounds to 2; the columns need the stage keys).
   - Pedidos: without `?abrir=`, the first page runs together with members and counters (3 rounds to 2).
   - Agenda: config, agenda, week and blocks together after the session (3 rounds to 2; the week read is discarded on the rare redirect).
   - Layout: `agendaAtivaDoTenant` alongside the rest instead of after it, or read in the same `clients` row (the rule "`getMyClient` exposes scalars only" allows a scalar extracted from the jsonb; to be checked against `normalizarConfigDaAgenda`). Hard loads only.
2. **`loading.tsx` per route** with the static frame for Pipeline, Pedidos, Agenda, Painel, Campanhas, Nova busca, Equipe, Agente, Perfil. Contatos and Conversas keep the generic one until Steps 3 and 4 (their layouts read lists, see 2.3).
3. **Root cause measurement** (read only, a short report into `docs/handoff.md` and an ADR if a cause is confirmed). **Time box: one working day**, in the order (a), (c), (b), then the rest if time is left. Without an attribution by then, record what was ruled out and move on; the beacon (Step 1) catches the next spike. Evidence so far:
   - `select` on `clients` executes in 5 ms on average in Postgres (`pg_stat_statements`, 15 thousand calls), but took 652 ms p50, 7 s p90 and 14.8 s max at the Supabase edge (upstream time) on 10/11. The same query went from 6 ms to 14.8 s within one minute.
   - The time is lost between the Supabase edge and the Postgres executor. That rules out Vercel cold start and the Vercel to Supabase distance as the cause of the seconds. The functions run in `gru1` (`x-vercel-id`; `vercel.json` does not pin it, the project setting does).
   - RLS without an index is ruled out for these two tables: `user_clients` has its PK `(user_id, client_id)`, matching the policy.
   - To add first: the statement timeout of the `authenticated` role. If it is the default 8 s, 14.8 s cannot be one query running; it is waiting in a queue (the 10-connection pool) or the PostgREST schema cache reload.

   To measure:
   - (a) Supabase dashboard (Reports, Database), first, because the history is already there (about half an hour): CPU, memory and swap, disk IO budget, at 15:10 to 15:20 UTC on 10/11 and at the next spikes, plus the current plan and compute size. Instance settings seen: `max_connections` 60, `shared_buffers` 224 MB, PostgREST pool of 10. The review's first suspect is memory: 224 MB of `shared_buffers` points to the 1 GB instance, shared by Postgres, the RAG vector search, Realtime and cron. Precedent: on 01/10/2026 this database already locked up for lack of memory on the Supabase free plan (`docs/plano-carregamento.md`).
   - (b) Sample `pg_stat_activity` for the `authenticator` connections (active vs idle, wait events) every 5 s during a 30 min working session, to see whether requests queue on the 10-connection pool.
   - (c) Correlate spikes with PostgREST schema cache reloads and pool re-initialization (`postgrest_logs`: 6 reloads in 24 h, one at 15:13:04 UTC just before the worst minute; each migration applied in production triggers one).
   - (d) Correlate with the 5 min `prospeccao_tick_5m` cron (`prospeccao_ativar_agendadas` and `prospeccao_apagar_antigos`: p50 1.25 s, peaks 6 s, at 15:15:00).
   - (e) Time the list RPCs as `authenticated` with a real JWT claim (`set local role` + `request.jwt.claims`) to confirm RLS cost in the functions.
   - (f) Idle effect: a trivial read after 15 to 120 s idle took 0.29 to 1.3 s against 0.17 to 0.24 s warm. It explains part, not the bursts.
4. **Two checks before the Base is written** (read only, results into `docs/handoff.md`):
   - "A, B, back to A" on `next build` + `next start` with the navigation RSC delayed 3 s: does the visited screen show its skeleton again on the way back? Confirms finding 1 (2.3) in ten minutes.
   - Realtime DELETE and UPDATE on the real project (2.7): two sessions of different tenants, delete a note and update a row, record who receives each event and what comes in `old`. The DELETE line of `.claude/rules/realtime.md` and `.claude/rules/dados-estado-desempenho.md` is written from this result, in the same delivery.

Files: `app/(app)/pipeline/page.tsx`, `app/(app)/pedidos/page.tsx`, `app/(app)/agenda/page.tsx`, `app/(app)/layout.tsx`, new `app/(app)/<route>/loading.tsx` files.

Acceptance (measured):
- Pipeline, Pedidos and Agenda do 2 server rounds instead of 3 (counted in the Supabase edge log timeline for one navigation).
- On `next build` + `next start`, clicking each route with a frame shows it in under 300 ms with the navigation RSC response delayed by 3 s (B1).
- Within the one-day time box: a written attribution of the 14.8 s (which hypothesis held, with numbers) and the options with their cost for the owner, or the list of what was ruled out.
- The two checks of item 4 recorded, and the DELETE rule rewritten from the result.

Out: any change to SQL functions, PostgREST or compute settings; any client cache; any move to `features/`.

**Delivered (13/11/2026):**
- Parallel reads: Pipeline (gate and stages together), Pedidos (without `?abrir=` the first page joins members and counts), Agenda (config, agenda, week and blocks together), layout (`agenda_config->ativa` comes in the `getMyClient` select, through `normalizarConfigDaAgenda`; `agendaAtivaDoTenant` stays only for the bench). Not counted in the edge timeline yet.
- Frames: `loading.tsx` for Pipeline, Pedidos, Agenda, Painel, Equipe, Perfil, Agente, Campanhas and Nova busca, all from one product piece, `components/MolduraDeCarregamento.tsx`, over a new base `components/ui/esqueleto.tsx` (the skeleton of 7.1, brought forward from Step 1 so nine frames did not copy the same classes) and `components/TituloDaPagina.tsx` (the header Painel, Equipe and Perfil now render too, so frame and page do not jump).
- B1 measured on `next build` + `next start` with the navigation RSC delayed 3 s: 51 to 68 ms on every route with a frame (Perfil has no menu link to click; its frame exists).
- "A, B, back to A" (item 4): the visited screen shows its frame again on the way back (50 ms, then waits for the server). Finding 1 confirmed.
- DELETE test (item 4): result in 2.7.
- 14.8 s (item 3), within the time box: the `authenticated` statement timeout is 8 s and the `clients` select never executed longer than 1.1 s (`pg_stat_statements` since 26/06/2026), so the 14.8 s was waiting, not running. The worst minute (15:15 UTC, 10/11) is the minute the 5 min cron route ran `prospeccao_apagar_antigos` (6.1 s) and `prospeccao_ativar_agendadas` (5.6 s) while Campanhas fired about ten `prospeccao_*` RPCs per click (0.6 to 4.3 s each that minute), on a PostgREST pool of 10: (d) correlates. The instance itself was slow too: the cron job took 6.9 s against 0.13 s five minutes before, the `cron.job_run_details` one-row insert has a 78 s maximum, the schema cache query took 1.2 s. The 15:13:04 reload (c) was not a migration (none on 10/11): it came with PostgREST reconnecting its pool and Realtime re-initializing, a consequence more than a cause. The database is 129 MB with a 100% cache hit, so data memory is not it. Left: (a), the dashboard (CPU, IO budget, at 15:10 to 15:20 UTC on 10/11), which these tools cannot read, and (b), which needs a working session. No ADR yet: no cause is confirmed.
- **Cause found (14/11/2026):** the Supabase dashboard warned "Your project is about to deplete its Disk IO Budget" (Nano baseline 5 MB/s). The database was 129 MB, about 100 MB of it index bloat: 78 MB of indexes on `chat_messages` for 721 live rows, 23 MB on `conversations` for 65 rows (rows inserted and deleted by the logged suites and the purges; every `conversations` update moves `last_message_at`, which is in five indexes, so only 2% of 169 thousand updates were HOT). A message insert wrote about 820 KB of WAL (`pg_stat_statements`), so attendance itself spent the IO budget, and a starved disk queues every read: that is (a). `REINDEX TABLE CONCURRENTLY` on both tables at 13h23 SP took the database to 28 MB; after it `inbox_pagina` runs in 53 to 175 ms, `inbox_contagens` 8 ms, `painel_verbatim` 31 ms. The waste survey and the maintenance routine are owner decisions in progress.

### Step 1: the Base

Scope:
1. Dependencies, each checked against Next 16.2 and React 19.2 and measured for B8 at install:
   - `@tanstack/react-query` v5 (10.8 kB gzip measured with the hooks we use);
   - `zod`;
   - `nuqs`;
   - `react-hook-form` and `@hookform/resolvers`;
   - `vitest` (dev), with `npm run test:unit`, wired into `fechar-entrega`.
2. `QueryClient` factory with 2.4's defaults; the provider keyed by user plus tenant in `app/(app)/layout.tsx` and in the `/design` layouts (fake source); the debounced invalidator (2.7) and the global write-error notice (2.6).
3. The key factory convention (2.5, three-level mutation keys) and the pure cache helpers (`tirarDaPagina`, patch by id, both list shapes), with Vitest tests including the concurrent-delete case and two different writes on the same list.
4. nuqs adapter in the root of the app and the shared parsers (2.8).
5. The error shape (2.9): a server helper for routes, the browser `ErroDaApi`, the global 401 handler (renew once and repeat, then `/login` with no return path, 2.9), the shared block error component, `app/(app)/error.tsx`.
6. Zod helpers (2.9): body and query parsing inside `sessaoDaRota`/`rotaDoAdmin`; the Asaas webhook schema in shadow mode.
7. Forms (2.12): `components/ui/form.tsx` and one documented example in `docs/design-system/camada-base.md`; nothing else, no existing form migrated.
8. Observability (2.10): the saved B9 query over the Supabase edge logs. No beacon, no table, no migration.
9. Guardrails (section 5): ADRs, rule lines, lint rules.
10. The performance budget tooling (section 3.2): the `frame` e2e project, the request-count assertions (RSC included), the JS-per-route script with the B8 ceilings, the saved B9 query.
11. The screen states pattern (7.1): the base components and their page in `docs/design-system/camada-base.md`, used by every step from Step 2 on.
12. Session without the database on the click (D8): the session context fed by the `(app)` layout, the client guard (blocked, owner-only, deactivated), the prefetch-on-intent link for the menu, used by the first migrated area; `ativa: true` on the 9 write routes of D10.

Not in the Base (review findings 2 and 21): the realtime bridge (Step 3a, its first consumer), any change to `lib/use-canal-ao-vivo.ts`, `lib/env.ts` (Step 5), an empty `features/` skeleton (each area creates its folder when it moves), a per-session rate limit on the beacon.

Files:
- `package.json`, `vitest.config.ts`
- `lib/query/` (client, keys convention, cache helpers, debounced invalidator)
- `lib/rota.ts`, `lib/admin.ts` (schema and error helpers)
- `app/(app)/layout.tsx`, `app/(app)/error.tsx`, `app/layout.tsx` (nuqs adapter), `app/api/billing/webhook/route.ts` (shadow schema only)
- `components/ui/{form,esqueleto,erro-do-bloco}.tsx` (names settled in Step 1)
- `eslint.config.mjs`, `e2e/` (frame spec, production web server project)
- `.claude/rules/`, `docs/adr/`, `docs/instrumentacao-uso.md`, `.claude/skills/fechar-entrega/SKILL.md`

Acceptance:
- No visible behavior change.
- `npm run build`, `npm run lint`, `npm run checar`, `npm run test:unit` and the `sem-login` suite pass.
- Because `lib/rota.ts`, `lib/admin.ts` and `app/(app)/layout.tsx` are used by Conversas: the `logado` suite, `realtime.serial`, `atendimento.serial` and `npm run test:e2e:n8n` pass before and after, with no difference (the `fechar-entrega` skill already warns that `sem-login` alone let three broken tests through).
- The concurrent-delete unit test passes: 5 deletes in flight with the 3rd refused end with 4 rows gone, the 3rd back after the final invalidation, total minus 4, one invalidation. A second case: a remove and a mark on the same list, the first to finish does not erase the other's optimistic change.
- The baseline observability numbers exist for one day.
- The Asaas schema is logging in shadow mode, with its mismatch count visible.

Out: migrating any screen; enforcing any schema on a machine caller; `lib/use-canal-ao-vivo.ts`.

**Delivered (14/11/2026):**
- Dependencies (exact versions, checked against Next 16.2.11 and React 19.2.4): `@tanstack/react-query` 5.107.1, `zod` 4.6.7, `nuqs` 2.10.3, `react-hook-form` 7.92.0, `@hookform/resolvers` 7.0.6, `vitest` 4.1.12 (dev). Vitest 5 asks for `@types/node` 22 or more (the project has 20), and npm 11 loops on the optional peers of `vite`; vitest 4.1.12 was installed with `--legacy-peer-deps` for that one command, and the lock was checked: only the optional `ajv` peer of `@hookform/resolvers` left, four patch bumps (postcss, nanoid, source-map-js, wasm-runtime).
- Data layer in `lib/query/`: `cliente.ts` (2.4 defaults, 401 to `/login`, global notice), `provedor.tsx` (keyed by user and tenant), `cache.ts` (`tirarDaPagina`, `remendarLinha`, both list shapes), `escrita.ts` (`opcoesDeTirar`, `opcoesDeRemendar`), `invalidar.ts`, `erro.ts` (`ErroDaApi`), `api.ts` (`chamarApi`, one renewal on 401), `aviso-global.ts`; Vitest in `lib/query/escrita.test.ts` (`npm run test:unit`, 4 tests, the concurrent-delete case and two writes on one list).
- Session without the database on the click (D8): `lib/sessao.tsx` fed by the `(app)` layout, `components/GuardaDaTela.tsx`; the providers wrap the whole shell. `ativa: true` on the 9 write routes of D10.
- Prefetch on intent (D9): `components/LinkNaIntencao.tsx` on the menu items of `NavRail` (desktop rail, phone bar and "Mais"). Measured: hovering the 7 menu items without clicking made ZERO Supabase requests (edge logs, 14/11/2026 06:06 UTC); the click is what runs the page's gate. Toggling the `Link` prop on hover did not work (the click ignored the prefetch); `router.prefetch` on the gesture does.
- URL: `NuqsAdapter` in `app/layout.tsx`, shared parsers in `lib/url.ts`.
- Errors: `erroDaRota`, `lerCorpo`, `lerConsulta`, `conferirNaSombra` in `lib/rota.ts`; `components/ui/erro-do-bloco.tsx`; `app/(app)/error.tsx`; `components/AvisoGlobal.tsx`. Asaas webhook in shadow mode (`lib/asaas-esquema.ts`).
- Forms: `components/ui/form.tsx` and its example in `docs/design-system/camada-base.md` (with the screen states).
- Lint: `features/**` gets the project rules plus inline keys and fetching `useEffect` as ERRORS, and no Supabase import in its components and hooks.
- Budget tooling: `npm run test:orcamento` (`playwright.orcamento.config.ts`, `e2e/desempenho.orcamento.spec.ts`) on `next start`: B1 on the 7 menu routes with a frame (passes, stable after waiting for the intent prefetch response), B2 for migrated areas (none yet), B8 on 12 routes (all within the ceilings). The B9 query is section 6 of `docs/instrumentacao-uso.md`. Both are in `fechar-entrega`.
- ADRs: `2026-11-14-screen-never-waits-for-the-database.md`, `2026-11-14-tanstack-query-is-the-browser-data-layer.md`, `2026-11-14-every-input-crosses-a-zod-schema.md`, `2026-11-14-vertical-slice-one-folder-per-area.md`.
- Not done in Step 1: the `/design` layouts do not get the data provider yet (no `/design` screen reads through it until Campanhas, Step 2, which adds it with its fake source).

### Step 2: Campanhas, the pilot (exit gate for the rest)

Starts only after the `importar-planilha` work is merged into `main` (it edits `components/admin/campanhas`).

Scope:
- Move commit first: `components/admin/campanhas/**`, `lib/campanhas-fonte.ts`, `lib/campanhas-servidor.ts`, `lib/prospeccao.ts` and the other Campanhas-only `lib/` files into `features/campanhas/`. Only `git mv` and imports change.
- `useLeitura`/`usePaginaDaFonte` replaced by the area hooks (queries through the admin API routes).
- No double read: the server stops pre-reading data the client will query; the page keeps only the gate and the frame.
- Optimistic writes for remove lead, delete list, delete campaign and mark lead (`nao_encontrado` on delete is success inside the source).
- Tab, open list, campaign, filters and page in the URL through nuqs (refresh and back keep them).
- prefetch on intent on the Campanhas menu link; `refetchOnWindowFocus` on (no realtime in this area).
- Nova busca frame in `loading.tsx`.
- The cron (D12): `prospeccao_apagar_antigos` runs in one tick a day, at dawn (São Paulo), not in every 5 min tick.
- JS weight: find what weighs in Campanhas and Nova busca (the recharts charts in `components/admin/campanhas/graficos.tsx` and the spreadsheet importer are the suspects) and load it on demand, to the 340 kB ceiling of the other routes (B8).
- Zod and the single error shape in `app/api/admin/campanhas/**`; the Apify webhook and the Campanhas cron in shadow mode.

Files: `features/campanhas/**` (after the move), `app/(app)/campanhas/**`, `app/api/admin/campanhas/**`, `app/api/prospeccao/**`, `e2e/campanhas*.spec.ts`.

Acceptance (measured):
- Switching Campanhas and Leads tabs, opening a list and coming back from Nova busca: 0 blocking requests, the navigation (RSC) request included (the screen shows cached data before any request returns), against 2 to 5 today (B2, B3).
- Frame under 300 ms with RSC delayed 3 s (B1).
- Refresh and back keep tab, list, filters and page.
- Remove 5 leads in under 2 s with the API delayed 1 s: no "já saiu da lista", each row gone before its API answers, the total is right, and one refused delete shows its reason and its row comes back with the final invalidation (B4).
- JS for Campanhas and Nova busca at or under 340 kB (B8); if it cannot get there, the reason and the owner's exception go into an ADR.
- Existing Campanhas e2e (including `/design`) pass.

**Exit gate**: if any criterion fails, the next area does not start; fix the Base or revisit the pattern first.

Out: the other admin screens; the `/clientes` central (it keeps `lembrar` until Step 5).

**Delivered (14/11/2026, partly):**
- Reads: `useLeitura` (`components/admin/campanhas/tabela.tsx`) now runs on the query cache with the same signature, so the 20 reads of the area changed in one place. The same key does not read again for 30 s: switching tabs and coming back from Nova busca open from the cache. What the server already read enters as fresh data, so the browser no longer reads it again (B3, the double read). The server's first data is used only for the key it read (with the cache, passing it to every page made page 2 show page 1, caught by `campanhas.design.spec.ts`). Focus return re-reads (no realtime here); no retry (the 20 s limit stays the only wait).
- Writes: `mudou` became an invalidation of the `["campanhas"]` prefix that waits for a pending write (the `versao` stays 0 until the move commit). Removing a lead, deleting a list and deleting a campaign are optimistic (`components/admin/campanhas/Apagar.tsx` over `opcoesDeTirar`): the row and the total leave at the confirm, the dialog closes at once, a refusal shows its reason in the app notice and the final re-read brings the row back; only the last pending write re-reads. "Não encontrado" on a delete is success inside the source (`lib/campanhas-fonte.ts`). Marking a lead was already a local patch and stayed.
- URL: tab, open list and open campaign (`?aba=`, `?lista=`, `?campanha=&vista=`) through nuqs (`components/admin/campanhas/tela-na-url.ts`); opening pushes a history entry. The preview's in-page Nova busca stays out of the URL (the real one is its own route).
- Cron (D12): `prospeccao_apagar_antigos` runs only in the 03h00 tick (`ehHoraDaLimpeza`, `lib/prospeccao.ts`, Vitest).
- JS: the assistant, the campaign detail, Nova busca and the spreadsheet importer load on demand; Campanhas went from 483 kB (over the 480 ceiling after the Base) to 472 kB.
- Tests: `e2e/campanhas-dados.design.spec.ts` (refresh and back keep tab and list; three leads removed in a row, each gone at the click, no "já saiu da lista", total minus 3); the Campanhas design suites pass (108); `npm run test:orcamento` 20/20.
- **Left for the owner:**
  - B8: decided (D15), the charts stay in the first view and the ceiling stays 480 kB.
  - B2: decided (D16), Campanhas keeps its server read (the fix of the 30/10 refresh bug) and the admin gate in `adminDaPagina`; B2 and D8 apply to the tenant screens, not to Campanhas.
  - Not done: the move into `features/campanhas/` (mechanical, many cited paths), Zod and the single error shape on `app/api/admin/campanhas/**`, the Apify webhook and cron in shadow mode (writing their schemas needs real payloads, not guesses).

### Step 3: the tenant screens, straight to infinite queries

Campanhas is an admin area: it reads through API routes, not through RLS (D1), and has no realtime. So Step 2 proves optimistic writes, cache and URL, but direct reads, the realtime bridge and the infinite list enter here for the first time (review finding 14). Step 3 is split so they are proven on one small area first.

#### Step 3a: Pedidos, the tenant pilot (exit gate for 3b)

Scope:
- Move commit: Pedidos into `features/pedidos/`.
- The realtime bridge (2.7) is born here, as a new file in `lib/realtime/`, registered once in the `(app)` layout; `lib/use-canal-ao-vivo.ts` keeps owning channels, status callback, the skipped first `SUBSCRIBED` and the hidden-tab park, and its callbacks start calling the bridge. INSERT, UPDATE and DELETE per the 2.7 tables; DELETE per the Step 0 result.
- Pedidos: frame at the click, data per block through `useQuery` read directly through RLS (D1), the list on `useInfiniteQuery`, the tab counters through the debounced invalidation.
- Tab and search in the URL (nuqs), prefetch on intent on the Pedidos menu link.
- Zod on the Pedidos routes; the Asaas webhook schema enforced if its shadow week had zero mismatches.

Files: `features/pedidos/**` (after the move), `app/(app)/pedidos/**`, its API routes, `lib/realtime/**`, `lib/use-canal-ao-vivo.ts` (callbacks only), `app/(app)/layout.tsx`.

Acceptance:
- Frame under 300 ms with RSC delayed 3 s (B1); "A, B, back to Pedidos": 0 blocking requests, RSC included (B2).
- A help request opened by the AI shows in the open list without re-reading the loaded pages; RPC call counts not higher than today.
- Because the bridge sits on the tenant channel that Conversas also uses: `realtime.serial`, `atendimento.serial` and `npm run test:e2e:n8n` pass before and after.
- Refresh and back keep tab and search.

**Exit gate**: if any criterion fails, 3b does not start.

#### Step 3b: Contatos, Pipeline, Painel, Agenda

Scope:
- Each area moves into `features/<area>/` (separate commits): contatos, pipeline, painel, agenda.
- Contatos (list and ficha), Pipeline, Painel and Agenda: frame at the click, data per block through `useQuery`, read directly through RLS (D1).
- `usePaginada` lists go straight to `useInfiniteQuery` (no double migration).
- Realtime through the bridge, INSERT per the 2.7 table; `contato-bus` and the data `router.refresh` calls replaced by cache updates.
- URL state with each screen: Contatos filter and search, Pipeline filters, Agenda week (nuqs); prefetch on intent on each menu link.
- `contatos/layout.tsx` stops reading the list (its `loading.tsx` becomes possible).
- Painel's heavy aggregates become per-block queries (the same RPCs).
- Zod on the routes of these areas; the Agenda cron (`/api/agenda/lembretes`) in shadow mode.

Files:
- `features/{contatos,pipeline,painel,agenda}/**` (after the moves)
- `app/(app)/{contatos,pipeline,painel,agenda}/**`, their API routes
- `lib/use-paginada.ts` (removed when its last user goes), `lib/contato-bus.ts`

Acceptance:
- Frame under 300 ms with RSC delayed 3 s for each screen (B1); "A, B, back to A" within 5 min: 0 blocking requests, RSC included (B2).
- `e2e/realtime.serial.spec.ts` and `e2e/clientes.serial.spec.ts` pass with RPC call counts not higher than today.
- Refresh and back keep the filters of each list (one e2e per list).
- `/design` suites pass; JS per route within B8.

Out: Conversas, NavRail counters.

### Step 4: Conversas, last, with the n8n battery before and after

Scope:
- Move into `features/conversas/` (separate commit).
- `inbox/layout.tsx` (stops awaiting the first page), `ContactSidebar`, the open conversation (`useMensagensDaConversa`, handoffs, notes), NavRail counters (`useContagemAoVivo`).
- `encaixar` stays the INSERT placement rule of the list; in the open conversation a new message is appended from the event, skipping an id already present, and never invalidates the message list (2.7).
- Conversas chips and search in the URL (nuqs); prefetch on intent on the Conversas menu link.
- The draft of the reply being typed survives a 401 redirect (2.9).
- Zod for the n8n webhooks (`/api/agent`, `/api/inbound-media`, `/api/clients/by-instance/[instanceName]`): validate and log, never refuse, except a missing field the handler cannot work without, which also raises a notice (2.9).
- Re-evaluate server prefetch with `HydrationBoundary` for the first inbox page only, with numbers from production.

Files: `features/conversas/**` (after the move), `app/(app)/inbox/**`, `app/api/{agent,inbound-media,send,conversations}/**`, `app/api/clients/by-instance/**`, `components/shared/NavRail.tsx`, `lib/use-contagem-ao-vivo.ts`.

Acceptance:
- `npm run test:e2e:n8n` passes before and after with no difference; `realtime.serial` and `atendimento.serial` pass.
- Message arrival to screen not slower than today (timed in the battery).
- Opening a conversation shows the frame under 300 ms with RSC delayed 3 s (B1).
- Refresh and back keep the chips and the search.
- The n8n webhook schemas log their mismatches and the battery is green with them in place.

Out: any change to n8n workflows or to the brain's behavior.

### Step 5: the central and the last routes

The tenant screens already carry their URL state from their own steps (review finding 15). Step 5 keeps:
- The `/clientes` central: its query layer (the `lembrar` cache moves to TanStack Query), its tabs and filters in the URL, prefetch on intent on its link, and its move into `features/central/`.
- Folder moves only for what this step touches (the central). Agente, conhecimento, equipe and assinatura move the day a delivery changes them (2.13), not in bulk.
- Zod sweep: every route not converted by an earlier step gets its schema and the single error shape.
- `lib/env.ts`: validated once against the Vercel variable list and enforced the same day the owner confirms the list (2.9); from then on, the lint against `process.env` outside it.

Acceptance:
- Refresh and back keep the state on every list of the central (one e2e per list); shared links open the same view.
- No route left without a schema (a `checar` check lists routes that parse a body without one).
- Every budget item B1 to B10 within budget, recorded in `docs/handoff.md`.

Out: new filters; moving areas that did not change.

## 5. Guardrails (so this does not come back a third time)

1. **ADR "The screen never waits for the database to appear"** (Step 0 or 1): pages and segment layouts do not await data; every route has a `loading.tsx` frame; server reads in parallel; a migrated page reads no database and its menu link prefetches on intent. Also fix the `next.config.ts` comment that credits speed to `loading.tsx` alone.
2. **ADR "TanStack Query is the only browser data layer"** (Step 1):
   - every browser read through an area hook with the key factory;
   - writes are optimistic mutations; a refusal shows its reason and the final invalidation brings the row back; last-write check on `[area, entity]`;
   - realtime by event type and per list (2.7), bridges registered once in the `(app)` layout.
3. **ADR "Every input crosses a Zod schema"** (Step 1): shadow mode for Asaas, Apify and the crons; the n8n webhooks validate and log without refusing; no Zod behind the URL parsers; the environment validated once in Step 5.
4. **ADR "Vertical slice: one folder per area"** (Step 1): an area moves when it is touched.
5. **The rule file** `.claude/rules/dados-estado-desempenho.md` (section 8): the State block, the budget, the three places for state, and the per-step transition, so the rule text always matches the code. Its lines grow as each step lands.
6. **Lint** through `no-restricted-imports` and `no-restricted-syntax` (no own lint plugin, which is more maintenance). An error in `features/**` (the path says the area migrated), a warning elsewhere; the PostToolUse hook already makes a touched file come out clean:
   - no `useEffect` that fetches in components;
   - no `supabase-js` import in components (only in sources);
   - no query key written inline;
   - no new file loose in `lib/` or at the root of `components/` for a migrated area (2.13);
   - no `process.env` outside `lib/env.ts` (from Step 5, when env is enforced).
7. **Tests**:
   - the frame e2e on a production build (B1 to B3) with the allow-list growing per step;
   - the concurrent-delete e2e per area with writes (B4);
   - Vitest for pure rules, cache helpers and schemas, run by `fechar-entrega`.
8. **The performance budget (section 3) is a rule**, in two kinds: the lab budget (B1 to B4, B8, B10) is an acceptance criterion of a delivery from the day its tool exists (Step 1); the production budget (B5 to B7, B9) is a weekly reading. A delivery that breaks a lab item either fixes it or records the owner's exception in an ADR.
9. **Deploy with a tab open for days**: dropped on 14/11/2026, the attendants do not leave Conversas open for days (owner).
10. **D1 note, not reopened**: with direct reads, the page gate is experience, not security. A blocked account is blocked for data only if RLS or the grants say so (to check in the database; see 2.3, open point).

## 6. Documentation map (one source per subject)

| Subject | Single source | Notes |
|---|---|---|
| Data, state and performance in the browser and on navigation | this document | the roadmap until Step 5 ends; then its rules live in `.claude/rules/dados-estado-desempenho.md` and the ADRs of section 5 |
| Owner's loading rules and the database side of lists | `docs/plano-carregamento.md` | still binding; its browser layer is superseded area by area (note at its top) |
| Product roadmap and decisions | `docs/proximos-passos.md` | points here for data, state and performance |
| Where the product stands, traps, status | `docs/handoff.md` | points here; the weekly B9 reading is recorded there |
| Design: tokens, base layer, reasoning | `docs/design-system/` | the only design source; the code wins on any disagreement (its README) |
| Why each rule exists | `docs/adr/` with `docs/adr/README.md` | ADRs that this plan will replace carry a transition note, not "Superseded", until the replacing step lands |
| Finished plans and one-off reports | `docs/arquivo/` | moved there with a line on top saying why and what replaces them; nothing deleted |

## 7. After Step 5: the design track

The design front starts after Step 5 is closed, not before and not in parallel. This section fixes the track so nothing has to be decided again; it does not design anything.

### 7.1 Inside this plan: one pattern for the new screen states

The migration creates states the app does not have today. They get ONE pattern, defined in the Base (Step 1, item 13), so each area does not invent its own:

| State | Today | Pattern (Base) |
|---|---|---|
| Block loading | `loading.tsx` and screens draw ad hoc `animate-pulse` divs with loose classes (`app/(app)/loading.tsx`); there is no skeleton in `components/ui/` | one skeleton component in `components/ui/` with variants for line, block and list row, using the existing surface tokens |
| Block error | none; screens show an inline sentence or nothing | one block error component (reason sentence plus "Tentar de novo"), red only as state (`fundamentos-cor.md`) |
| Empty | `components/ui/estado-vazio.tsx` exists | kept as is |
| Item leaving and coming back (optimistic undo) | none | one exit and return transition from the existing animation tokens (`fundamentos-animacao.md`), plus the reason shown in place |
| Route frame | generic skeleton | each `loading.tsx` composes the real page header components with the skeleton, so the frame and the loaded page do not jump. `loading.tsx` does not receive the URL parameters, so it draws only what does not depend on them (no active tab, no filter chips) |
| Form field error | each form writes its own | the shadcn `Form` message slot with the schema's sentence (2.12) |

Their copy follows the visible-vocabulary rules already in `engineering.md` (no dash, Portuguese UI). Polishing them is part of the design track, not of this plan.

### 7.2 The track, in order, after Step 5

1. Component audit of the base layer and the product components (names, fixed values, duplication), confirming what lives in `components/ui`, `components/shared` and each `features/<area>/components`.
2. Light theme weight: carry the visual weight of the new login to the other screens (the owner's request of 06/11/2026, recorded in `docs/proximos-passos.md`).
3. Accessibility review (contrast, keyboard, touch target, screen reader), weighing the phone.
4. Copy of the states from 7.1.

Each design change lands per area, in commits separate from any behavior change.

### 7.3 Design documents: findings of 10/11/2026

- `docs/design-system/pendencias.md` was last updated on 31/08/2026. Its item 12 says mobile "não foi resolvido", but the mobile plan ran on 23/09/2026 (`docs/arquivo/relatorio-mobile.md`). A note now says the item is stale and needs re-checking. The Light weight complaint of 06/11/2026 and the new screen states were not recorded there; both are now listed (items 13 and 14).
- `docs/design-system/README.md` still opens with the 30/08/2026 context (17 files in `components/ui/`, now 28). That is history, not a conflict, since its rule is "the code wins".
- `docs/proximos-passos.md` had the Light weight work "anotado para a semana de 09/11/2026". That conflicted with the owner's 10/11 decision to run design after this plan; it now carries a note saying so.
- No other design document conflicts with this plan: none of them defines loading, error or optimistic states.

## 8. Instruction files

The owner approved on 11/11/2026 (relayed by the Campanhas session) that the data, state and performance rules live in their own rule file, that the existing rules get transition notes, and that `CLAUDE.md` gets only a short reference (to keep it small). The changes below are **applied**. `AGENTS.md` holds only the Next 16 warning and does not mirror `CLAUDE.md`: no change.

### 8.1 The rule file `.claude/rules/dados-estado-desempenho.md` (applied)

The rule text lives only in that file; this spec does not keep a copy, because two copies drift apart (review finding 22). What it holds:
- a **State** block at the top (steps done, areas migrated), updated in the commit that closes each step;
- the sentence that decides new code: in an area not migrated yet, new code follows that area's current pattern (`data.md`, `realtime.md`, `engineering.md`); a new screen or a wholly new area is born in the new pattern;
- "Applies now": the screen does not wait for data, the three places for state, migrations outside attendance hours, the DELETE caution, where a new file goes;
- "Applies from Step 1": the lab budget as an acceptance criterion, URL state through nuqs, the browser data layer, writes, errors, validation;
- "Applies from Step 3a": the realtime bridge and the INSERT rule per list;
- lint as an error in `features/**`, a warning elsewhere.

### 8.2 Transition notes in the existing rules (applied)

| File | Line today | Change |
|---|---|---|
| `.claude/rules/engineering.md`, "Never size for a small audience" | "Every list paginates 10 at a time ... (`lib/use-debounce.ts`, `lib/use-paginada.ts`)" | append: "Transition: `use-paginada` becomes an infinite query per area in Step 3 of `docs/plano-dados-e-estado.md`; see `dados-estado-desempenho.md`." |
| `.claude/rules/realtime.md` | "Reuse `lib/use-paginada.ts` and `lib/use-contagem-ao-vivo.ts` ..." | append: "Transition: replaced area by area in Steps 3 and 4 of `docs/plano-dados-e-estado.md`." |
| `.claude/rules/realtime.md` | "`REPLICA IDENTITY FULL` is required where UPDATE/DELETE events matter (RLS must evaluate the old row)." | the replacement of 11/11 was reverted to this original text (review finding 3); appended: "Under verification, see Step 0 of `docs/plano-dados-e-estado.md`." The final sentence is written from the Step 0 test |
| `.claude/rules/realtime.md` | "A handler patches the row from the payload (`modo: "aplicar"`, zero queries) or fetches ONE row ..." | append: "Transition: from Step 3a of `docs/plano-dados-e-estado.md` a migrated area's handlers go through the cache bridge, with the INSERT rule per list of its section 2.7; counters and lists without a placement rule invalidate, debounced." |
| `.claude/rules/data.md` | "A mutation never calls `router.refresh()` for a small change: announce on `lib/contato-bus.ts` or patch local state." | append: "Transition: becomes an optimistic mutation on the query cache in Step 3 of `docs/plano-dados-e-estado.md`." |

### 8.3 `CLAUDE.md`, one line in "Where to read more" (applied)

Right after the `docs/handoff.md` line:

"- `docs/plano-dados-e-estado.md` = the single roadmap for data, state and performance (its budget is an acceptance criterion); the rules are in `.claude/rules/dados-estado-desempenho.md`."

## 9. Decisions (closed by the owner on 11/11/2026)

| # | Decision | Owner's answer | What it changed in the plan |
|---|---|---|---|
| D1 | Read path | direct browser reads through RLS; API routes only for sensitive writes ("sim") | one path in 2.2 (the alternative removed); admin areas still read through routes because they use `service_role` |
| D2 | Vitest | now ("gostei, vamos seguir assim") | Step 1 adds `vitest` and `npm run test:unit` to `fechar-entrega`; pure rules, cache helpers and schemas get unit tests; B4 is locked by a unit test too |
| D3 | URL state | nuqs | 2.8 and every step use nuqs parsers; the own helper is only the fallback if nuqs fails the Next 16.2 check at install |
| D4 | Zod | every input: route bodies, the n8n and Asaas webhooks, URL parameters, environment variables, not only forms | 2.9 lists every input type with its step; Step 5 gains the sweep of every remaining route and `lib/env.ts`; a lint against `process.env` outside `lib/env.ts`. **Adjusted by the owner on 11/11/2026** (review findings 18 to 20): Zod stays on API routes, Asaas, Apify (and the crons) and forms; the n8n webhooks validate and log without refusing (only a missing field the handler cannot work without is refused, with a notice); the URL leaves Zod (nuqs parsers only); `lib/env.ts` is validated once against the Vercel list, with no shadow week |
| D5 | react-hook-form | ready in the Base for new or complex forms, no migration of the forms that work ("já vamos deixar isso no gatilho pois talvez nossa vertente possa verticalizar") | 2.12; Step 1 adds `react-hook-form`, `@hookform/resolvers` and `components/ui/form.tsx`; a field-error state joins 7.1 |
| D6 | `features/` | yes, vertical slice ("sim, vertical slice") | 2.13 fixes the structure; each step starts with the move commit of its area; the lint against new loose files starts in Step 1; shared pure rules cited by the rules files stay in `lib/` until their citations move with them |
| D7 | Production measurement | own beacon ("é uma boa"). **Reversed by the owner on 14/11/2026**: no own beacon ("frescura guardar isso em prd") | 2.10: lab tests plus the Supabase edge logs; browser numbers only through an external tool, his call |

The review of 11/11/2026 also had four cuts accepted by the owner the same day: findings 18 and 19 (the D4 adjustment above), 20 (env without a shadow week) and 21 (a smaller Base: no realtime bridge in Step 1, react-hook-form limited to `form.tsx` and one example, an area moves when it is touched, a small area can be a flat folder, no beacon rate limit).

### Still open

By design: the B8 ceilings are confirmed with the owner once Zod, nuqs and react-hook-form are measured at install.

The review's four questions, answered by the owner on 14/11/2026:
1. A blocked company kept on screen until a reload: accepted ("tudo bem").
2. Supabase is on the **Free plan (Nano: shared CPU, up to 0.5 GB of memory, burst disk)**; a bigger plan depends on revenue. Recommendation recorded (Step 0): Pro with the Micro size (USD 25 a month, Micro covered by the plan's compute credits) is the most effective performance measure of the whole plan; self-hosting on the owner's VPS is not recommended now (backups, updates, one machine for n8n, Evolution and the database). His call.
3. No switch between companies: one login (one e-mail) works in one company.
4. Attendants do not leave Conversas open for days: the deploy guard of guardrail 9 is dropped.

### 9.1 Decisions of 14/11/2026 (owner, after Step 0)

| # | Decision | What it changes |
|---|---|---|
| D8 | No database on the click | a migrated page reads nothing on the server; the session comes once from the `(app)` layout through the session context; client guard for redirects; RLS and the write routes are the lock (2.1, 2.3) |
| D9 | Prefetch on intent, not every visible link | replaces `prefetch={true}` of 11/11 (2.3) |
| D10 | Blocked company: the write routes are the lock | 9 routes get `ativa: true` in Step 1 (all of the 10 found except `team/remove`); `billing/subscribe` stays open (2.3) |
| D11 | No own beacon | D7 reversed (2.10) |
| D12 | Campanhas cron | the 5 min tick stays in `pg_cron` (moving the clock to n8n would call the same route and the same queries, no relief); `prospeccao_apagar_antigos` (D8 of Campanhas, 12 month retention, LGPD) runs once a day at dawn instead of 288 times (Step 2) |
| D13 | The full logged e2e suites run outside attendance hours | they write and read the production database; on 13/11 night the suite took the Supabase edge to p90 9.8 s with 5xx errors |
| D14 | Login does not return to the requested link | the ADR of 30/09 stands (2.9) |
| D15 | Campanhas charts stay in the first view | Campanhas and Nova busca keep the 480 kB ceiling, the owner's exception (B8, `e2e/desempenho.orcamento.spec.ts`) |
| D16 | Campanhas keeps reading on the server | the 30/10 refresh fix stays and the admin gate stays in `adminDaPagina`; D8 (no database on the click) and B2 apply to the tenant screens (Step 2) |
| D17 | Supabase stays on the Free plan | the goal is making Nano cope: less waste in IO and CPU (Step 0, the reindex of 14/11) |
