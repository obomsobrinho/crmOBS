# All screens migrated to the `components/ui/` base layer
- Date: 2026-08-17
- Status: Accepted
- Area: ui

## Context
15 screens used loose classes instead of the shadcn based base layer.

## Decision
Every screen consumes `components/ui/`. Before writing `className` on a screen, look for the variant in the base; if the same class soup appears twice it becomes a variant. (Design rules: `docs/design-system/`.)

## Evidence
- 51 files touched. `npm run build` clean, eslint 0 errors (2 `set-state-in-effect` fixed by adjusting at render time).
- The conversation screen proved IDENTICAL by numeric snapshot: 425 elements in dark, 417 in light, zero style differences.
- Contrast defect fixed in 7 places: `--danger-fill` used as TEXT gave about 3.2:1 in dark; became the pair `danger-surface`/`danger-ink` (9.0:1).
