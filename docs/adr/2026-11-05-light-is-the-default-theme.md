# The product opens in Light; Dark stays as a choice
- Date: 2026-11-05
- Status: Accepted
- Area: ui, product

## Context
Without a `theme` cookie the app opened in Dark (`app/layout.tsx`), inherited from the OBS site, which is dark-only. The owner decided on 05/11/2026 that the default is Light: the final customer is a small business owner, by day, at the office, and does not use Dark. The campaign video is recorded after this change, so it must show Light.

Opening every `/design` route and the public screens in Light, a WCAG audit of every visible text node found the text already healthy. Fields were the real gap: in Light the field is white on a white card, so its 8% border (1.2:1) is the only sign that it can be typed in. The owner had already complained about this on 19/09/2026 ("custei perceber que podia digitar ali", see the `sutil` variant in `components/ui/input.tsx`). The inbox chip counters at 75% opacity measured 3.56:1, below 4.5:1, only in Light.

## Decision
- No cookie, or an unknown value, means Light. Only `theme=dark` means Dark. `app/layout.tsx` decides on the server and `components/ThemeToggle.tsx` starts on the same value, so the theme itself never flashes and whoever already chose keeps the choice.
- New token `--input-line` for the frame of a field (`Input`, `Textarea`, `Select`, `CampoBusca`, the tag field): `--line-strong` in Light, `--line` in Dark, so Dark does not change by a pixel.
- The inbox chip counter loses the opacity in Light only (`dark:opacity-75`).

## Consequences
- `--input-line` must be declared in the dark block too: `:root` and `[data-theme="dark"]` match the same element, so a `var()` written only in `:root` resolves to the dark value.
- In Light the `hover:border-line-strong` of the `sutil` field no longer changes anything, because the border already has that value. The field frame is visible at rest, which is the point.
- A user with the old default never had a cookie (the toggle is the only writer), so they move to Light on the next load. A user who chose Light or Dark keeps it.
- `scripts/exportar-design-system.mjs` still exports its standalone page in Dark; it is a design document, not a product screen.

## Evidence
`e2e/tema.design.spec.ts` reads the raw HTML: no cookie gives `light` on `/login`, `/cadastro`, `/recuperar-senha` and `/design`, `theme=dark` gives `dark`, an unknown value gives `light`; the toggle goes both ways and survives a reload.
