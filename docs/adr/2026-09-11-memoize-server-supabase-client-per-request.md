# Memoize server createClient() and getMyClient() per request
- Date: 2026-09-11
- Status: Accepted
- Area: data

## Context
Layout and page both call `createClient()` (server) and `getMyClient()` in the same navigation. Each call was a new round trip to Supabase (item C5 of the demo plan).

## Decision
`createClient()` in `lib/supabase/server.ts` and `getMyClient()` in `lib/auth.ts` are memoized per request with `React.cache`. The scope is the request, so nothing crosses users. Inside `getMyClient`, `clients` and `user_clients` are fetched in parallel and the role is picked in memory by `client_id`.

## Consequences
- Inside one request, changing something in `clients` and calling `getMyClient()` again returns the OLD value. Reading what was just written needs its own query.
- Do not add a second, non-cached path to the same data.

## Evidence
Conversation switch TTFB in dev dropped from ~656 ms to ~445 ms (35 to 40%, not half). What remains: `getUser` twice in series, proxy, and `getMyClient`.
