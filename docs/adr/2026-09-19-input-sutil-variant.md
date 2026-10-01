# Input variant `sutil` for fields inside pair tables
- Date: 2026-09-19
- Status: Accepted
- Area: ui

## Context
Fields inside a table of pairs (the contact column of the conversation) had no visible frame before the click.

## Decision
`Input` (`components/ui/input.tsx`) has the variant `sutil`: frame visible BEFORE the click, control height. The border is `line` (8%), NOT `line-soft`.

## Consequences
In the light theme the column, `--input-bg` and `--s-campo` are all `#fff`, so the border color is the only signal left. Using `line-soft` makes the field disappear.
Not documented in `docs/design-system/camada-base.md` (only here).
