# Async actions use Button `carregando`, not a disabled button
- Date: 2026-09-26
- Status: Accepted
- Area: ui

## Context
Async buttons (Save etc.) were shown as `disabled` while working, which dims them to half opacity. Owner: "botão salvando bloqueado é horrível".

## Decision
`Button` (`components/ui/button.tsx`) has a `carregando` prop: spinner replaces the icon, color stays FULL (the `disabled:opacity-50` look is reserved for refusal, such as an empty field), the button is locked against double click, and it sets `aria-busy`. Every async action uses `carregando={...}` and leaves `disabled` only for missing data.

## Consequences
- With `asChild` the child goes ALONE: a `false` next to it breaks the Radix Slot. The first version broke the pipeline on mobile.
- No animation library for this (reaffirmed: Motion only if a gesture or animated layout ever exists).
- Not yet documented in `docs/design-system/camada-base.md` (only here).

## Evidence
- Incident: first version of `carregando` with `asChild` took down the pipeline screen on mobile.
