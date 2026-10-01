# publishBlockers() no longer requires the "tested" step
- Date: 2026-08-28
- Status: Accepted
- Area: onboarding

## Context
Owner decision, 28/08/2026.

## Decision
`publishBlockers()` (`lib/onboarding.ts`) LOST the `tested` blocker: only connect and configure remain. Step 3 ("Testar") offers the test prominently but it does not block activation. `onboarding_tested_at` is still written by `/api/playground`, now only as data.

## Consequences
Later additions to the blockers: `hasNotify` (see `2026-09-29-notify-destination-required-first-activation.md`) and the real-connection check (see `2026-09-24-first-activation-requires-real-connection.md`).
