# End-to-end attendance battery against production n8n
- Date: 2026-10-01
- Status: Accepted
- Area: testing

## Context
Owner request: "só me mande testar depois de estar 100%".

## Decision
`npm run test:e2e:n8n` (`e2e/atendimento.n8n.spec.ts`) sends by hand what Evolution would send to the PRODUCTION n8n webhook, with the impossible phone number, and checks database and screen: mixed batch (text, REAL WhatsApp audio in `e2e/fixtures/audio-whatsapp.ogg`, text and image: 4 rows in order, each media, audio playing on screen, ONE response), audio arriving at the end of the wait, reaction in the middle, document, help request, schedule without request (swaps the notices destination for an impossible number and restores it at the end), paused AI and duplicated message. It is PAID (real model, Whisper and vision): it only runs when asked by name, like `ia`.
Together, `e2e/horarios.ia.spec.ts` proves dates and times in both modes with a FIXED clock (`agoraTeste`, only in dryRun), including the day control (16h at 10h is today). The "already passed or not" computation became CODE (`lib/horarios.ts`): the model was wrong in both directions when comparing by itself.

## Consequences
Run it before asking the owner to test any change to attendance (n8n, `processTurn`, prompt base).
