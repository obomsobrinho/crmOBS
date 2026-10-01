# Dashboard animation is house CSS plus useContagem; bars grow in height
- Date: 2026-08-29
- Status: Accepted
- Area: ui

## Context
Round 3 of the dashboard needed animation. House rule: no animation library.

## Decision
New tokens in `globals.css`: `--ease-dado` (DATA curve, `cubic-bezier(0.165, 0.84, 0.44, 1)`) beside `--ease-out` (INTERFACE curve), plus `--dur-cartao` 320ms, `--dur-numero` 900ms, `--dur-barra` 700ms and `--dur-troca` 420ms. Classes `.painel-cartao`, `.painel-barra`, `.painel-area`, `.painel-hora`, `.painel-balao`, `.painel-guia`, `.painel-pressiona`. Number count-up is the `useContagem` hook (`components/painel/useContagem.ts`). The bar grows in `height`, NOT `scaleY`: with scaleY the 3px top radius arrives squashed. The keyframe reads `var(--altura)`, which the column sets inline. `prefers-reduced-motion` takes everything to the final value on the first frame; hover and accordion keep working, only without transition.

## Consequences
Tests: a lucide icon is also an `svg` with a `polyline` inside. A test counting `svg polyline` in the movement card caught the badge arrows and saw three series, so the area carries `data-slot="painel-area"`; select by that slot.
