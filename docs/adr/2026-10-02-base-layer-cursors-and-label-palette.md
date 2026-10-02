# Cursors live in the base layer, and tags and stages share one palette
- Date: 2026-10-02
- Status: Accepted
- Area: ui

## Context
Owner: some clickable things showed the arrow (Radix menu items, a div with onClick), so people did not know they could click. Separately, tags (`TAG_COLORS`, `lib/crm.ts`) and funnel stages (`STAGE_COLORS`, `lib/pipeline.ts`) had two hex palettes that disagreed about the same key, had no dark values, and tags offered green, amber and red, which the system reserves for state.

## Decision
- The base components (`components/ui/*`) and the reset in `app/globals.css` set `cursor-pointer`; disabled is `not-allowed`, `carregando` is `progress`. `e2e/cursor.design.spec.ts` asserts the computed cursor on every `/design` route. ESLint warns on `onClick` on non-interactive elements.
- One palette, `lib/rotulos.ts`: eight hues, none green, amber or red, light and dark tokens in `app/globals.css`. Old stored keys are mapped at render by `chaveDoRotulo`; the DB is not rewritten.
- `ink-faint` stays as text only in the empty-state XX mark; other ink-faint text became `ink-3`.
- Pedidos and Pipeline cards show the contact photo through `AvatarContato`; member avatars are one component (`AvatarMembro`). `pedidos_pagina` returns `foto_path` (migration `20261002150000_pedidos_pagina_foto.sql`, drop plus create plus re-grant); the app falls back to initials until it is applied.

## Consequences
- Existing red or green tags render in the nearest allowed hue until the owner picks again.
- A new base component without a cursor fails the e2e.

## Evidence
- `e2e/cursor.design.spec.ts`, `e2e/rotulos.design.spec.ts`.
