# The login is a split screen with a brand panel that shows a conversation being answered
- Date: 2026-11-06
- Status: Accepted
- Area: ui, product

## Context
The login was a small card on the canvas. The owner asked for a striking, different screen before the first real campaign (09/11/2026), with the reference of a product leaving a coloured panel, cut by its edge. Screens of the kind usually show a dashboard print. Here the thing worth showing is the work itself: a customer writing at night and being answered.

On the first version the owner liked the phone and found the division simple, the panel empty and the form poor. On the second he found too many balloons ("ficou balão demais, ficou confuso"), a square corner on one side and cut balloons on the other, an empty lower left corner, and three lines saying the same thing under the form. This record is the third round.

The panel must not cost the login anything: no heavy image, no animation dependency, no competition for focus, and the audience (a small business owner on a modest notebook or a phone) must never wait for it.

## Decision
- `components/PainelMarca.tsx`: a separate component, plain HTML and CSS, no hook and no state, so `/cadastro` can reuse it. The brand gradient at panel size is `.brand-grad-painel`, next to `.brand-grad`, with the same `--brand-grad-*` tokens, identical in Light and Dark.
- The division is one wavy contour in three tones, strong purple to light lilac, with a single balloon point in the middle: the same line pulled back for each layer. It replaced stacked balloons, which the owner found confusing. One list of curves draws the standing edge of the desktop and the lying edge of the phone strip, swapping x and y. The strong layer enters the panel and fades there, because its gradient cannot match the panel's on every window proportion; the two translucent layers stop at the panel edge, or they would lighten the purple behind the title.
- The panel touches the screen at the top, right and bottom, and the contour runs past both ends of the screen. It no longer has margins or rounded corners: the contour had to reach the end of the screen, and a rounded panel beside it left one square side and one cut side.
- From 1024px up the panel carries a tilted premium phone cut by the panel edge, playing one short conversation, a list of five benefits that appears in step with it (each item in the same `--t` timeline) and sits low in the left column, ending near the base, four glass cards around the device, and a background of glow and rings. The two lower cards stay on the device, clear of the list.
- Glass cards are light glass with dark ink, not white text on glass: they cross both the purple and the light phone screen, and only dark ink passes AA on both.
- Below 1024px: form first, then a strip with the lying division, the title and benefits 1, 4 and 5. No phone and no animation.
- The conversation, the list and the card entrances run once and stop at about 7.5s. What keeps moving, very slowly, are the division layers and the cards, only through `transform` and `translate`. The reply slot exists from the first frame, so nothing reflows.
- The resting state is the complete scene: all motion lives inside `prefers-reduced-motion: no-preference`, so `reduce` falls straight into the end and no rule has to undo anything.
- The phone is an illustration: `aria-hidden`, nothing focusable, its colours local to `.celular` because the `--bubble-*` tokens flip in Dark and the panel does not. The list is real text in the document.
- Everything inside the phone is measured in `em`, and one `font-size` tied to the panel height (`cqh`) scales device and cards from a 640px to a 1080px window.
- The form: the seal centered with the product name below it (`BrandMark empilhada`), icons in the fields (`CampoComIcone`, base layer), an eye button to show the password, one full width outline button, "Criar conta grátis por 7 dias", under a thin line, and a help line that opens WhatsApp in a new tab. New type role `text-entrada` (28/34), closed to entry screens.
- The product name is now Atenda in `lib/brand.ts`, on every screen and in the browser tab. The seal is still the OBS one until the Atenda logo exists.

## Consequences
- The eye button takes its name from `sr-only` text, never `aria-label`: `e2e/auth.setup.ts` and `e2e/fluxos-principais.auth.spec.ts` use `getByLabel("Senha")` without `exact`, which matches aria-label by substring, so "Mostrar senha" there would break the login of the whole logged-in suite. `e2e/publico.design.spec.ts` keeps that count at one.
- The conversation talks about a scheduled time, which fixed screen text normally must not assume (mixed audience). The owner chose it as a sample scene, on a marketing panel, and it is one more reason the phone is an illustration and never a product screen.
- `/login` no longer has a heading "Entrar", only a button. The form is no longer a card (`cardVariants` left the login), on any size.
- The one card that sits between two balloons follows the phone plane (`--giro: 0deg`); level, it touches them because of the tilt.

## Evidence
`e2e/publico.design.spec.ts`: the exact panel copy, list order and card texts, none of the banned words on the page, the title of the tab, the eye by keyboard, only the two float animations are endless, the others end under 8.5s, everything touches only `opacity`, `transform` and `translate`, reduced motion shows the full scene with zero animations, and at 1024x768, 1280x640, 1280x720, 1366x768, 1440x900 and 1920x1080 no card covers text or a balloon and no list item touches the device (probed with `elementsFromPoint`, because the box of a tilted element lies). `e2e/entrada.mobile.spec.ts`: the strip comes after the form with the three benefits and no animation runs.

Measured by hand on 06/11/2026 with the text hidden, brightest pixel behind each line of white text: 4.58:1 at worst in the four window sizes (AA). `offsetTop` of each conversation row is the same before and after the animation, and typing in the e-mail field during it keeps focus and value.
