# The agent has two surfaces over one form
- Date: 2026-08-28
- Status: Accepted
- Area: onboarding

## Context
Step 2 of the beta MVP (field map and what was left out in `docs/proximos-passos.md`). The old `/agente` was an improvised wizard (numerals, "Continuar" buttons) from when no real wizard existed.

## Decision
The agent configuration has TWO surfaces over ONE form, in the WooCommerce setup pattern:
- `/montagem`: the assistant. Full screen, outside the `(app)` route group, four steps (who answers, what it knows, test, connect and activate). Runs once in the life of the account and disappears forever after the first activation. Asks for three typed fields (company name, what the company does, agent name) plus one click for the preset and one for the tone.
- `/agente`: the permanent screen. Three real tabs (who answers, what it knows, what it can do) plus advanced mode. It lost the numerals and the "Continuar" buttons.
- Fields live in `components/agente/campos.tsx`, layout in `components/agente/ui.tsx`, state and `PUT` in `components/agente/useAgentConfig.ts`.
- The ONLY allowed difference between the surfaces is `mostrarOpcionais`. Any other difference is a bug, because a duplicated field diverges on the first change.
- Tabs use `forceMount` AND `data-[state=inactive]:hidden` (the second lives in the base layer, `components/ui/tabs.tsx`). Radix unmounts the inactive panel by default, and `AgentBulletList` keeps an un-added draft in the parent: unmounting would make the text vanish from the screen while STILL being saved. With `forceMount` alone all three panels are VISIBLE, which brings back the single scrolling page.
- Advanced mode is NOT a fourth tab: the three tabs are slices of the SAME form, advanced is a different form. It is a button on the right of the tab strip.
- Error in a closed tab: the `PUT` returns `fields`, the screen switches by itself to the first tab with an error and marks it with a dot. Only AFTER a save attempt.

## Consequences
The wizard absorbed the old onboarding bar (one progress counter in the account), and the "save and continue" vs "saving is publishing" collision disappeared by construction.
