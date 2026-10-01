---
paths:
  - "components/**/*.tsx"
  - "app/**/*.tsx"
  - "app/globals.css"
---
# UI and design system

Base-layer reuse, `AreaRolavel`, `carregando`, tokens and no-dash are in `engineering.md`. The reasoning lives in `docs/design-system/` (read the matching file, do not copy it here).

## Layers
- Two layers: `components/ui/` is the BASE (adjusted once); `components/` is PRODUCT and consumes it. Search the base for a variant before writing `className`.  (why: docs/design-system/camada-base.md)
- For a `<form>`/`<section>` that IS the card use `cn(cardVariants(), ...)`, not `Card asChild`.  (why: docs/design-system/camada-base.md)
- Base-layer rules: geometry lives in the cva `size` (`size="none"` = no geometry); never `[&_svg]:size-4`; never a focus ring in a component (focus is global); `data-slot` AFTER the spread, and a `data-slot` passed from outside is ignored (mark states with another attribute, e.g. `data-em-breve`); never read an ancestor's `data-state` (pass state by prop); `tailwind-merge` knows the type scale via `extendTailwindMerge` in `lib/utils.ts`; a Radix root renders no element, so chained triggers attach to the SAME element.  (why: docs/design-system/camada-base.md)
- `Button carregando`: with `asChild` the child goes ALONE (no `false` sibling, it breaks the Slot). `disabled` only for missing data.  (why: docs/adr/2026-09-26-button-carregando-prop.md)
- Field inside a table of pairs: `Input` variant `sutil` (border `line`, not `line-soft`).  (why: docs/adr/2026-09-19-input-sutil-variant.md)
- `Stat` period legend (`StatLegenda`) is mandatory. `sheet` width is a variant (`padrao` 520, `largo` 1040), never className on a screen.  (why: docs/design-system/camada-base.md)

## Scroll and surface
- Every scrollable dissolves at its edges: `<AreaRolavel>` or the `fade` prop of `ScrollArea`; `useDissolverRolagem` only for other tags or `temMais`. Degrees: `DISSOLVER_PADRAO` 32, `DISSOLVER_LISTA` 72, `DISSOLVER_BALAO` 80. Exception: a scroll area with a `sticky` child gets no mask (`/agente`). `e2e/rolagem.design.spec.ts` fails on any unmasked scrollable.  (why: docs/design-system/fundamentos-superficie.md)
- No scroll shadow. One signal per fact; the dissolution must be LARGER than the item it dissolves. `SetaMais` only where scrolling is the navigation (conversation, conversation list).  (why: docs/design-system/fundamentos-superficie.md)
- `.fundo-rede` (`components/FundoRede.tsx`) is the ONLY texture: behind the message area, dissolved on four edges, 960px column.  (why: docs/design-system/fundamentos-superficie.md)
- Card surface is `bg-raised`; card padding 24px (`p-6`), exceptions: dashboard headline and a block inside a card (16px).  (why: docs/design-system/fundamentos-geometria.md)

## Color and type
- Each hue has 4 roles: `fill`, `on`, `ink`, `surface`/`line`. Text/icon uses `ink` (`text-brand-ink`, `text-warn-ink`), never `fill`; `ink` is never a background. Ink has 4 levels; `ink-faint` is never text; minimum text 12px.  (why: docs/design-system/fundamentos-cor.md)
- `--brand-grad-end` (#4464d4) only for brand gradient, symbol and decorative surface from 28px; never text, icon or state. Avatar color comes from `avatarPair()` (`lib/inbox.ts`).  (why: docs/design-system/fundamentos-cor.md)
- Type roles: `text-titulo` 18 (page), `text-cartao` 16 (block with own structure), `text-rotulo` 12 caps (label of a value, simple card, collapsible sub-block). The last two are not interchangeable. A type role never reuses a color name.  (why: docs/design-system/fundamentos-tipografia.md)
- Removed names must not return: `bg-conteudo`, `--s-conteudo`, `text-display`, tabs `segmentado`, `bg-sunken|inset|lista|lista-sel|composer|sub|painel|chat`, `--surface`, `--panel`, `text-ink-muted`, `text-ink-dim`, `.btn-primary`, `.glass`, `.panel`, `--radius-2xl`, `--color-accent`, `--color-ia`.  (why: docs/design-system/pendencias.md)

## Motion
- Animation is house CSS (`.anim-flutuante`, `.anim-fundo`, `.msg-in`, `.anim-lateral`, `.painel-*`), no `tw-animate-css`, no Motion. Tailwind v4 emits `-translate-x-1/2` as the `translate` property, so a keyframe that repeats it ADDS: `.anim-flutuante` must not touch `translate`; `sheet` has its own `.anim-lateral`. Honor `prefers-reduced-motion`.  (why: docs/design-system/fundamentos-animacao.md)

## Copy and inbox behavior
- Fixed screen text never assumes appointment, patient or scheduling (mixed audience); segment language comes from the preset.  (why: docs/adr/2026-08-26-beta-mvp-scope-and-menu.md)
- Inbox list opens on `Hoje` (`Hoje`/`7 dias`/`Tudo`, `data-slot="inbox-periodo"`), rolling civil day in America/Sao_Paulo (`dentroDaJanela`/`diaSP`, `lib/inbox.ts`). A conversation with open `handoff_at` is NEVER hidden by the time filter (`needsYou(it) ||` in `components/ContactSidebar.tsx`). Chip counts follow the window; search ignores it.  (why: docs/adr/2026-09-19-inbox-opens-on-today.md)
- Menu (`components/NavRail.tsx`): Painel first, Pedidos, Conversas, Pipeline, Agente (owner), Equipe. "Em breve" = Agenda and Follow-up; Campanhas does not come back.  (why: docs/adr/2026-08-26-beta-mvp-scope-and-menu.md)
- Mobile: bottom bar has Pedidos where Pipeline was; Pipeline lives in "Mais".  (why: docs/adr/2026-09-30-pedidos-detail-is-a-request-sheet-not-a-chat.md)
- `Stat` has an `elevado` variant because `--s-bloco` equals `--canvas` in the light theme: a `bloco` card on the canvas would be invisible. Use `elevado` there.
