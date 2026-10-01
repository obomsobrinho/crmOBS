# Blocks without instrumentation ship as empty state with a literal "XX"
- Date: 2026-08-29
- Status: Accepted
- Area: dashboard

## Context
Two blocks wait for instrumentation that does not exist: "Assuntos em alta" (rail) and the 4th operation card, "Objeções que ela segurou". Classifying the subject or objection of a turn needs a new column; `conversation_qualifications` only has `action`, `summary` and `preferencia_horario`.

## Decision
Three rules, none optional: the number is LITERALLY `XX` (never plausible, never blurred, because an enlarged screenshot of a blurred "17" destroys the product's axis), labels are POSITIONAL ("1º assunto mais perguntado"), and bars are GRAY (purple is the color of real data). Both disappear by themselves when the data exists: the page decides, not a switch someone must remember to turn off.

## Consequences
The card without data is marked with `data-em-breve` (an outside `data-slot` on `Stat` is IGNORED, because `data-slot` is written AFTER the spread; this was measured, the marker vanished). Marker lives in `components/painel/pecas.tsx`.
