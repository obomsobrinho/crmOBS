# /montagem order inverted: connect WhatsApp is the last step
- Date: 2026-09-24
- Status: Accepted
- Area: onboarding

## Context
Connecting was step 1. Owner decision (plan in `docs/plano-montagem-invertida.md`). People feared linking WhatsApp and the agent starting to answer before they finished. That never happened (the agent is mute while `agent_published_at` is null), but the screen never said so, and asking for the number first gave that impression.

## Decision
- Testing comes BEFORE connecting on purpose: the test bench does not need WhatsApp.
- CONNECTING DOES NOT TURN THE AGENT ON, and the last step says so at the top. `onConectado` of `ConnectWhatsApp` does NOT advance the step; it only reveals the "Ao ativar" list and enables the footer button "Ativar o agente", which stays DISABLED until the connection is seen on screen (with the reason written).
- The instance stopped being a floor: `montagemState` sends whoever has not configured to `quem` and whoever has configured to `conectar`. An old draft with `passo: "ativar"` is read as `conectar`.
- Preview of the connected state: `/design/montagem?passo=conectar&conectado=1`.

## Consequences
`montagemState` and `PASSOS_MONTAGEM` live in `lib/onboarding.ts` (pure module).
