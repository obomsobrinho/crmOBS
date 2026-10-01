# Run BOTH e2e suites (no-login and login) before closing a step
- Date: 2026-08-27
- Status: Accepted
- Area: testing

## Context
In step 1 (the dashboard) only the no-login suite was run. Three login tests stayed broken for six days: two looked for the headings "Operação" and "Conversas na semana", which the new dashboard had renamed.

## Decision
Before closing any step run both suites (see the `fechar-entrega` skill). `E2E_PORT=3000 npx playwright test --project=logado` reuses a dev server already running.

## Evidence
- Counts as of 29/09/2026: login suite 41 passing, none skipped (2 workers in `logado`, see comment in `playwright.config.ts`); no-login plus mobile 286. Counts are status, they drift.
