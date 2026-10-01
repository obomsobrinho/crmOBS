# The hour chart counts AI replies, not received messages
- Date: 2026-08-29
- Status: Accepted
- Area: dashboard

## Context
The design carried the label "when messages arrived". Counting arrivals gives a different set from the headline: a message that arrived at 23h and was answered the next day lands in one and not the other.

## Decision
`barrasDeHora` (`lib/painel.ts`) counts the same rows that `atendidasForaDoHorario` counts, classified by `dentroDoHorario`. The sum of the PURPLE parts is EXACTLY the headline number. The label is "em que horas a IA respondeu", not the arrival label: keeping the design label would lie about what the bar measures. Inside/outside considers the DAY OF THE WEEK (14h on Sunday is outside). Without an "outside hours" headline the chart is omitted, because it would have nothing to close against.

## Consequences
There is an equality test in both suites. Never change one of the two counts without the other.

## Evidence
The equality test passed against real data (Loja Teste, 1 = 1).
