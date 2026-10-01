# The e2e login suite runs against the OBS tenant (the owner's parked number)
- Date: 2026-09-17
- Status: Accepted
- Area: testing

## Context
The previous test tenant pointed at the WhatsApp of a clinic that received real contacts, which is the opposite of what the "test tenant" rule wanted to protect. The OBS tenant (called OBM in the database) is the owner's own number, parked.

## Decision
The login suites (`logado`, `atendente`, `logado-serial`) use the OBS tenant. Decided by the owner, with the risk weighed: the login suite WRITES to this tenant's CRM (moves cards, zeroes unread counts) but never sends a message and never wakes the agent.

The OBS tenant is in `prompt_mode = 'avancado'`. New tests must NOT pin the tenant's mode nor the conversation phone number: a test that needs a conversation takes the first in the list; a test that needs the guided builder handles both modes.

## Consequences
- Three tests broke when the tenant turned out to be in advanced mode: they assumed the guided form or a phone number written in the file.
- Tests that need a conversation depend on the seed (see `2026-09-26-e2e-seed-in-production-db.md`).

## Evidence
- Credentials live in `.env.e2e.local` (outside git). Details in `e2e/README.md`.
