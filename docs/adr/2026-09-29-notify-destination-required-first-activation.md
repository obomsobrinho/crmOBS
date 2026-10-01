# Notification destination is mandatory on first activation
- Date: 2026-09-29
- Status: Accepted
- Area: onboarding

## Context
Owner decision, 29/09/2026 (notices plan in `docs/plano-avisos.md`).

## Decision
- `publishBlockers` gained `hasNotify` ("definir para onde vão os avisos").
- In step 4 the notices block (`components/agente/AvisosCampo.tsx`) appears AFTER connecting, because the list of groups and "Mandar teste" come from WhatsApp itself. "Ativar" stays disabled with the reason written (`razao-avisos`) until a SAVED destination exists.
- The same component lives in `/agente`, tab "O que ele pode fazer", always visible.
- It SAVES BY ITSELF ("Salvar destino"), outside the form's Salvar: the test and Ativar need the destination already stored.
- Preview with destination: `/design/montagem?passo=conectar&conectado=1&avisos=1`.

## Consequences
Do not fold the destination save into the form's Salvar.
