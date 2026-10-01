# HTML5 drag is tested by dispatching events, never with `locator.dragTo()`
- Date: undated (pipeline suite, around 07/09/2026)
- Status: Accepted
- Area: testing

## Context
In the controlled Chromium `locator.dragTo()` moves the pointer but `dragstart`/`drop` do not fire.

## Decision
`e2e/pipeline.auth.spec.ts` dispatches the three events with ONE shared `DataTransfer` and RELOADS the page to prove the stage persisted, because the board moves the card in memory before talking to the database.
