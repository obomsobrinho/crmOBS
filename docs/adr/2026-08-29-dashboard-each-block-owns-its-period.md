# Dashboard round 3: each block owns its period, no global selector
- Date: 2026-08-29
- Status: Accepted
- Area: dashboard

## Context
Round 3 of the design (step 5 of the beta MVP). Layout, blocks and animation come from the approved boards; the map of what was left out is in `docs/proximos-passos.md`.

## Decision
- Layout: main column plus a 380px rail. Column: headline (with the hour chart INSIDE), operation in 4 cards, movement. Rail: subjects and the agent's real sentence. The queue moved up to the header.
- EACH BLOCK OWNS ITS PERIOD. There is no global selector: operation has the 4 periods, movement has 14 and 30 days, the headline follows none. The old written notice "does not follow the selector" is GONE and must not return: it was the symptom of the control being in the wrong place.

## Consequences
An e2e fails if that text reappears.

## Evidence
Measured at 1920: column 1268px, rail 380px, card 305px, operation closes at 594px, within 1080 without scrolling.
