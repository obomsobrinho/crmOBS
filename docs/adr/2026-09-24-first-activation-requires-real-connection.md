# First activation checks the Evolution connection state
- Date: 2026-09-24
- Status: Accepted
- Area: onboarding

## Context
`evolution_instance` is born when the QR or the code is REQUESTED, not when connected, so `publishBlockers` alone allowed activating over an instance never read.

## Decision
`PUT /api/clients/[id]/publish` queries `connectionState` at Evolution and answers 409 if the state is clearly different from `open`. If Evolution does not answer, it does NOT block (missing data must not take down someone activating). Only on the first activation.

## Consequences
No login test (needs a new unpublished account); the gap is declared in `e2e/montagem.auth.spec.ts`.
