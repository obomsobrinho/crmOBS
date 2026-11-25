# Light theme: the login's weight and color carried into the app

Date: 2026-11-24. Status: Accepted. Area: ui, dashboard.

## Context

The owner said the Light theme of the app reads "too white and gray" while the login reads right, and asked to carry the login's weight into every screen. A design critique run with the Design plugin (vault `assets/atenda/design-2026-11-24/critica-plugin.md`) measured why, Painel against login at 1440x900:

- Page title: 18px weight 600 with a 20px purple icon (`text-titulo`), against the login's 32px weight 700.
- Card on canvas: white `#ffffff` over `#f4f4f4`, separated only by an 8% border and a 5% shadow.
- Ink: 72 of about 200 texts on the Painel first fold were 12px `#6e6e6e` (`--ink-3`).
- Color: purple only as thin detail (icon, line, number); almost no solid action; the login has a solid purple mass and a solid button.

Three variants were rendered by injecting CSS into screenshots (nothing in the repo): A (weight only), B (weight plus color), C (B with more color where it matters, menu unchanged). The owner chose C with the 28px title, refused the solid purple active menu item ("não curti tanto, pode deixar igual estava"), and approved C as the reference: "tudo aprovado, mete marcha".

## Decision

1. New type role `text-pagina` 28/34, weight 700, `-0.025em`, for the page title, with no icon beside it (`TituloDaPagina`, the loading frame and every page `h1` of the app shell). `text-titulo` stays for dialogs and entry screens without the shell.
2. Light tokens only (Dark untouched): `--canvas` `#ebebeb` (was `#f4f4f4`), `--line` 12% (was 8%), `--ink-3` `#525252` (equal to `--ink-2`; the role stays so a screen can separate them again).
3. Color by mass, each with one meaning:
   - Solid brand = the AI result. The Painel headline is `Stat variant="marca-cheia"`: the login's `.brand-grad-painel` plus `.superficie-marca`, which redefines ink and line tokens to white inside, so the children keep their usual classes. The hour chart tooltip stays a light surface.
   - Amber = people waiting. "Precisa de você" is `bg-cartao-aviso` whenever the queue has someone; its button is solid brand, and turns solid amber after `ESPERA_AVISO_MS` (the old rule was a neutral card until that threshold).
   - Label palette = identity, never state. Tinted indicators (`Stat` `azul`, `ciano`, `rosa`, over `--color-cartao-*` and `--color-borda-*`, mixed with `--raised` so they turn by theme), `ListaDeContagens colorido` (first bar brand, the next in palette order; the central keeps brand only), tags filled with their own surface and ink, funnel column headers in the stage color, the "Assuntos em alta" bars at 6px with the first in brand.
   - "A última resposta do agente" in `bg-cartao-marca` (purple is "the AI did it").
   - One solid main action per block (`Button variant="brand"`), and the active period tab in `brand-surface`/`brand-ink`.
4. The NavRail active item stays as it was.
5. Fixed together, from the same critique: the variation badge moved next to the numeral (it overflowed 43px into the next card at 1440 and squeezed the label to three lines); "Tempo de 1a resposta" became "Tempo da primeira resposta"; the "who attends" mark moved a third out of the avatar corner (it covered the second initial); a past agenda slot fades by background and color bar, never by text (the card at 60% opacity dropped the text to 2.4:1).

## Consequences

- Every screen with a page title changes at once (one component and one role). Conversas has no page title and changed little: it needs its own round.
- Rules updated: `ui.md` (type roles, color by mass), `dashboard.md` (motivos bars). Docs: `fundamentos-tipografia.md`, `fundamentos-cor.md`, `fundamentos-superficie.md`.
- JS budget (B8, 25/11/2026): Campanhas was at 480.42 kB before this change and the new `Stat` and `Medidor` variant strings added 90 bytes (481 kB rounded, over the 480 ceiling). The tinted `Stat` classes moved to `app/globals.css` (`stat-tinto`, `stat-azul|ciano|rosa`, with an unlayered rule that tints the label and numeral), and `Medidor` keeps one `paleta` tone fed by `--medidor-cor` instead of one tone per hue: Campanhas 480.46 kB, about 40 bytes under the ceiling. Any new base-layer piece will cross it.
- The login itself is unchanged: the owner considers it right, and the critique's "AI look" items about it were withdrawn.
- Open: Pedidos reason chips stay neutral (the Painel colors reasons by rank, not by identity, so a chip color would not match); Contatos and Pedidos still show an empty right half on desktop.
