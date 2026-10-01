# BETA_ABERTO: master switch that frees every tenant during the beta
- Date: 2026-09-23
- Status: Accepted
- Area: billing

## Context
The beta exists to be used and to generate data. The 7-day trial created at signup would block
testers before that.

## Decision
`BETA_ABERTO=1` in the environment (read in `lib/beta.ts`, passed to `accessState` by `getMyClient` and
`processTurn`) frees EVERY tenant, ignoring trial and subscription. The 7-day signup trial only matters
once the switch is turned off.

## Consequences
⚠️ When turned off, accounts that signed up during the beta already have an expired `trial_ends_at` and
fall straight into the block. Decide beforehand what to do with those accounts.
