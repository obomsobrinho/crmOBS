# The conversation scrollbar thumb follows the content, and a held thumb loads nothing
- Date: 2026-10-05
- Status: Accepted
- Area: ui

## Context
Owner report on `/inbox/[id]`: spinning the mouse wheel made the scrollbar thumb jump, and holding the thumb left it still while the chat kept moving up. Measured on `/design?mensagens=150` (150 messages, older pages served over the network, thumb position read every frame):
1. Radix `ScrollArea` measures content size in a `ResizeObserver` debounced by 10ms but repositions the thumb on every `scroll` event. When an older page arrives and `useMensagensDaConversa` restores `scrollTop`, the scroll event lands before the new measure and the thumb is drawn with the old math for a few frames (321px where 181px was right).
2. Radix maps the pointer to `scrollTop` while dragging, with sizes measured before the new page. The restore put the message back in view, the next mouse move undid it, the top showed again and the `IntersectionObserver` loaded another page, in a chain (4 pages in about 1.5s with the mouse held). The thumb sat near 6px while the content swapped under it.

## Decision
1. `components/ui/scroll-area.tsx` recomputes the thumb size and offset in its own `ResizeObserver` on the content, in the same frame and before paint, with the same math as Radix. Radix reaches the same value later.
2. `useMensagensDaConversa` does not load older messages while a pointer is down on the conversation's scrollbar. On release the `IntersectionObserver` is recreated, so if the top is in view one page loads and the position is kept as usual.
3. `/design?mensagens=N` renders a long conversation (last 30 first, `temAntigas` on) and `e2e/rolagem-barra.design.spec.ts` serves the older pages through `page.route`.

## Consequences
- Dragging the thumb is a positioning gesture over loaded content: the content does not change under the pointer.
- The base layer duplicates two lines of Radix math. If Radix changes its thumb sizing, the spec (thumb position against `scrollTop`, error under 2px) fails.

## Evidence
Per-frame probe before the fix: `st=3599 sh=8035 th=329 esp=178`, then drag chain `sh` 8035, 11563, 15091, 18597 with the thumb at 6px. After: no jump (error 0), drag holds `scrollHeight` constant and loads exactly one page on release.
