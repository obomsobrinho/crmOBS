# Separate `atendente` Playwright project with the second user's session
- Date: 2026-09-17
- Status: Accepted
- Area: testing

## Context
Permission tests assert ABSENCE of power: the attendant does not see Agente and the route redirects, `/montagem` redirects, the attendant cannot manage the funnel, a dono-only route answers 403. With the owner's session each of these would prove the opposite of what it claims.

## Decision
Project `atendente` (`*.att.spec.ts`) uses the SECOND user's session, written by `auth.setup.ts` into `e2e/.auth/atendente.json`.
- Nothing in it writes to the database. A permission test that can write already failed before asserting.
- The 403 check uses `/api/team/invite`, NOT the `PUT` of `agent-config`: the latter carries the tenant id in the path and answers 403 in BOTH cases (wrong tenant and wrong role), and the id is not visible anywhere to the browser because RLS makes it implicit.

## Consequences
Closed the declared test hole "attendant". Remaining declared holes (reason written inside each spec): blocked account goes to `/assinatura` (needs an expired account), advanced mode goes to `/agente` (needs an advanced account that has not published). No coverage at all: manual send, team invite, knowledge-base upload, mobile.

## Evidence
- `e2e/atendente.att.spec.ts`
