# E2E seed: one test conversation created in the production database
- Date: 2026-09-26
- Status: Accepted
- Area: testing

## Context
Tests that need a conversation were being skipped. The owner authorized writing a seed into the production DB ("depois a gente limpa").

## Decision
`e2e/semente.ts` (run by `e2e/semente.setup.ts`, project `setup`) uses the service key from `.env.local` to create ONE test conversation in the test tenant, with an impossible phone (`5500000000001`, DDD 00) and the name "Cliente de teste (e2e)". The cleanup SQL is at the top of `e2e/semente.ts`.

## Consequences
- Unskipped the tests that need a conversation, and enabled `atendimento.serial.spec.ts`: handoff in the list and in the "O cliente quer" strip with Resolvido checked in the DB; orient the IA (writes, re-enables, drops the assignee, cancels); and TWO calls to the real brain without dryRun (the agent opens a handoff when asked for a person, and consumes the orientation on the next turn).
- Nothing goes to WhatsApp (the sender is n8n). DDD 00 phones also never generate a notice (`telefoneImpossivel`).
