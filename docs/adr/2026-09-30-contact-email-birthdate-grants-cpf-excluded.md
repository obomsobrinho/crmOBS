# Contact fields editable from the browser; CPF deliberately excluded; one shared contact sheet
- Date: 2026-09-30
- Status: Accepted
- Area: data

## Context
`/clientes` screen (list with search + sheet), decision D1 = B. Plan and slices in `docs/plano-clientes.md`.

## Decision
- `dados_cliente.email` and `birth_date` get column UPDATE grants for the browser (alongside `atendimento_ia`, `display_name` which precedes `nomewpp`, and `custom_fields`). n8n stays owner of `nomewpp`.
- CPF stays OUT on purpose (LGPD).
- `/clientes` uses the SAME sheet as the conversation panel: `components/FichaContato.tsx` (formerly `ContextPanel`), with prop `superficie` (`conversa` / `clientes`) and nothing else different. Pure rules in `lib/clientes.ts`.

## Consequences
- Never add a second contact-sheet component.
- Never grant CPF to the browser.
