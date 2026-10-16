# Central: goal-progress cap meter, header cleanup, no account type, donut center that fits
- Date: 2026-10-16
- Status: Accepted (owner rounds of 16/10/2026). Revises the meter of `docs/adr/2026-10-16-central-picos-plan-caps-ptax-and-cards.md` and the header of `docs/adr/2026-10-15-central-layout-adjustments.md`.
- Area: admin, ui

## Context
The two-bar meter (the client's usage plus an amber ideal bar and a legend) was hard to read at a glance. The header repeated facts (the Vitalício badge and "nunca cobrado"; "Conta" and "Plano" under the name, the same plan the Plano card and the usage label already say). The account type (interno, beta, pago) had no use once the beta ended. The donut center ("15,1 mi") overflowed the hole.

## Decision
- `Medidor` (`components/ui/medidor.tsx`) has a goal-progress mode (`marcador`, `estado`): one track in the light tint of the state, the usage as the solid fill, a round marker at the ideal spend of today and the segment between them hatched (diagonal stripes). Colors follow the pace with spending semantics: usage at or below the pace is green (`--human-*`), above is red (`--danger-*`). `RitmoDoLimite` (`components/admin/pecas.tsx`) writes the sentence from `ritmoDoMes`/`textoDoRitmo` (`lib/custo-ia.ts`): "Abaixo do ritmo: no ritmo atual termina o mês em N% do limite" or "Acima do ritmo: no ritmo atual passa do limite por volta de dd/mm" (or "o limite do mês já foi atingido"). The projection uses the SAME month counter (`usados`) and the elapsed fraction of the SP month; with no usage, no cap or less than a full day elapsed the sentence is not shown. The label "X de Y tokens (Plano ...), R$ ... estimado" is in the top right of the card (`RotuloDoUso`; the cost part only when the model has a price). The amber inner bar and `LegendaDoMedidor` are removed; the list keeps the thin bar (`MedidorDoLimite`).
- Header: no "Conta"/"Plano" line and no detail text next to the Vitalício badge (other details such as "5 dias restantes" stay). The plan stays in the Plano card (now with "Limite de IA: N tokens por mês") and in the usage label.
- `account_type` is read and shown nowhere (see `docs/adr/2026-10-16-account-type-removed.md`). The list row subtitle (`linhaDoPlano`) is only "Plano X" or "Sem plano".
- Donut center: the font scales with the text width (`tamanhoDoCentroDoDonut`, 32px down to 16px), so "15,1 mi", "128,6 mi" and "1,2 bi" fit the hole; `tokensCurto` gained the bilhão tier. The preview takes `escala=N` to prove big numbers.

## Consequences
- Color is never the only clue: the sentence under the bar states the pace in words. The marker position equals the ideal (`data-ideal-pct`), proven in `e2e/central-clientes-ajustes.design.spec.ts`.
- A new meter with a goal reuses `Medidor` with `marcador`; never a second bar or a hand-made legend.
