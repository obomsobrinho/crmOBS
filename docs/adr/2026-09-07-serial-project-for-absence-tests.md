# Tests that assert "this must NOT happen" go to the `logado-serial` project
- Date: 2026-09-07
- Status: Accepted
- Area: testing

## Context
The realtime test requires "opening the inbox causes ZERO fetches". It started receiving 5 the day the pipeline suite was born: pipeline tests write to `conversations` in the SAME tenant, and realtime, working as designed, made the list refresh. The code was right and the test wrong.

## Decision
Every new test of the form "this must NOT happen" is a `*.serial.spec.ts` (project `logado-serial`: a single worker, `dependencies: ["logado"]`), so no concurrent writer exists.

Blocking the WebSocket with `routeWebSocket` is NOT a substitute: without a connection `SUBSCRIBED` never fires, the guard that skips the first subscription would no longer be exercised, and the test would pass even with the guard removed.

## Consequences
Known intermittent tests, which pass alone: `pipeline.serial` (create and archive stage) and those hitting Supabase Auth under load (password recovery).

## Evidence
- `e2e/realtime.serial.spec.ts`, `playwright.config.ts` (projects `logado`, `logado-serial`).
