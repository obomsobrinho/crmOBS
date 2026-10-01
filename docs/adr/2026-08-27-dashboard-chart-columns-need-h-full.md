# Chart columns need h-full; items-end on the column row breaks the bars
- Date: 2026-08-27
- Status: Accepted
- Area: dashboard

## Context
The 14-day chart rendered invisible in production with the e2e passing.

## Decision
In the row of columns, the column needs `h-full` (its `justify-end` is what sits the bar on the floor). With `items-end` the column takes the content height, and the bar, whose height is a percentage, resolves to ZERO.

## Consequences
The e2e used to count columns and never measured a bar. There is now a height test. Any chart test must measure bar height, not count elements.
