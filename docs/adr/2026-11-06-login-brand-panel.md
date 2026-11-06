# The login is a split screen with a brand panel that shows a conversation being answered
- Date: 2026-11-06
- Status: Accepted
- Area: ui, product

## Context
The login was a small card on the canvas. The owner asked for a striking, different screen before the first real campaign (09/11/2026), with the reference of a product leaving a coloured panel, cut by its edge. Screens of the kind usually show a dashboard print. Here the thing worth showing is the work itself: a customer writing at night and being answered.

The panel must not cost the login anything: no heavy image, no animation dependency, no competition for focus, and the audience (a small business owner on a modest notebook or a phone) must never wait for it.

## Decision
- `components/PainelMarca.tsx`: a separate component, plain HTML and CSS, no hook and no state, so `/cadastro` can reuse it. The brand gradient at panel size is `.brand-grad-painel`, next to `.brand-grad`, with the same `--brand-grad-*` tokens, identical in Light and Dark.
- The panel is one giant message balloon: from 1024px up it has the balloon point at the top left, the shape of its own that the division between the sides asks for.
- From 1024px up, a tilted phone cut by the panel edge plays one short conversation and stops at about 7s. Below 1024px the panel is a short strip after the form, with no phone and no animation.
- The animation is CSS only, one timeline written in the component (`--t`), `opacity` and `transform` only, no `infinite`. The reply slot exists from the first frame, so nothing reflows.
- The resting state is the complete conversation: all motion lives inside `prefers-reduced-motion: no-preference`, so `reduce` falls straight into the end and no rule has to undo anything.
- The phone is an illustration: `aria-hidden`, nothing focusable, its colours local to `.celular` because the `--bubble-*` tokens flip in Dark and the panel does not.
- Everything inside the phone is measured in `em`, and one `font-size` tied to the panel height (`cqh`) scales it from a 640px to a 1080px window.
- New type role `text-entrada` (28/34), closed to entry screens: without the card and its frame the 18px of `text-titulo` disappears on the screen.

## Consequences
- The conversation talks about a scheduled time, which fixed screen text normally must not assume (mixed audience). The owner chose it as a sample scene, on a marketing panel, and it is one more reason the phone is an illustration and never a product screen.
- The product name in the panel copy is not used: the copy says "A central inteligente do seu WhatsApp.", so the future rename in `lib/brand.ts` does not touch it.
- The animation plays once per load. A loop would keep moving while the person types a password.
- The form is no longer a card (`cardVariants` left the login), on any size.

## Evidence
`e2e/publico.design.spec.ts`: the panel copy, no forbidden words, the phone hidden from assistive tech, every animation finite (under 8s) and touching only `opacity` and `transform`, and with reduced motion the full conversation at rest with zero animations. `e2e/entrada.mobile.spec.ts`: on a phone the strip comes after the form and no animation runs. Measured by hand on 06/11/2026: `offsetTop` of each conversation row is the same before and after the animation, and typing in the e-mail field during it keeps focus and value.
