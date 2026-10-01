# One source for the Sao Paulo timezone, contact names and phone spellings
- Date: 2026-10-01
- Status: Accepted
- Area: lib

## Context
The 01/10/2026 audit (R-39, R-57, R-58) found the same rule written many times: `FUSO` declared in four modules and the literal `"America/Sao_Paulo"` typed in eight more files; an `Intl.DateTimeFormat` built on every call in `idadeEmDias`; `cleanName(display_name) ?? cleanName(nomewpp)` copied in 11 places; the "with and without the ninth digit" list built in three modules; `message_type === "manual"` written by hand in `Thread.tsx` next to the `lib/mensagem.ts` helpers.

## Decision
- `lib/fuso.ts` (pure) owns `FUSO`, `diaIsoSP`, `dataLongaSP`, `diaMesCurtoSP`, `diaMesHoraSP`. `lib/format.ts` re-exports `FUSO`. No other file writes the zone string.
- `nomeDoContato` (`lib/inbox.ts`) is the only place where `display_name` beats `nomewpp`.
- `grafiasDeDigitos` (`lib/avisos.ts`) is the only builder of the ninth digit spellings; `grafiasDoNumeroDeAvisos`, `grafiasDoTelefone` and `foraDaLista` call it.
- `ehManual` (`lib/mensagem.ts`) decides the bubble side in `Thread.tsx`.
- Dead exports removed (`lastQualByPhone`, `buildCards`, `resumoDaColuna`, `accountStatus`, `annualPriceBRL`) after grep proved zero use, including `e2e/` and `app/design/`.

## Consequences
- Behavior is unchanged. `e2e/dedup-lib.design.spec.ts` keeps the OLD implementations as references and proves old == new near the Sao Paulo midnight, for names ("Voce", empty, precedence) and for phones (with and without 55 and the ninth digit, JIDs).
- Still outside this change (other fronts owned the files): `lib/painel*.ts`, `components/Pedidos.tsx` and `lib/guardrail.ts` (its own digit stripping is a different rule, not a spelling builder).

## Evidence
Audit items STRUCT-06, STRUCT-08, STRUCT-09, STRUCT-10, UI-19.
