# The screen never waits for the database to appear

Status: Accepted (owner, 11/11/2026 and 14/11/2026)
Area: data, ui, performance

## Context

On 10/11/2026 every click showed a loading screen: every page awaited all its reads (and some in series) before returning anything, only two routes had their own skeleton, and one read took 14.8 s in production. The full diagnosis and the plan are in `docs/plano-dados-e-estado.md`.

## Decision

- Every route has its own `loading.tsx` that draws the screen's static frame through one product piece, `components/MolduraDeCarregamento.tsx` (over `components/ui/esqueleto.tsx` and the page's real header, `components/TituloDaPagina.tsx`). The frame holds nothing sensitive.
- Pages and segment layouts do not await data; server reads that stay run in parallel.
- **No database on the click (D8, 14/11/2026).** A migrated page reads nothing on the server. `proxy.ts` checks the login token locally, the `(app)` layout reads the session once on a hard load (`getMyClient`) and hands it down through `lib/sessao.tsx`, and `components/GuardaDaTela.tsx` redirects in the browser (deactivated, blocked, owner-only). The lock is RLS plus the write routes: every write route passes `ativa: true` to `sessaoDaRota`, except `billing/subscribe` and `team/remove`, which must work for a blocked company.
- **Prefetch on intent only (D9, 14/11/2026).** Menu links are `components/LinkNaIntencao.tsx`: `prefetch={false}` on the `Link` and `router.prefetch` on hover, touch or focus. A visible menu item loads nothing by itself.

## Consequences

- A company blocked during use keeps seeing screens until a reload or focus return, and cannot write anything (accepted by the owner, 14/11/2026).
- A screen already visited still shows its frame on the way back until its area migrates to the query cache (Step 0 measurement, "A, B, back to A").

## Evidence

- Step 0 (13/11/2026, `next build` + `next start`, navigation RSC delayed 3 s): frame at the click in 51 to 68 ms on every route with a frame.
- Step 1 (14/11/2026): switching the `Link` `prefetch` from `false` to `null` on hover downloaded the route but the click did not use it (no frame in 3 s); `router.prefetch` on the gesture showed the frame in 83 ms. `npm run test:orcamento` (B1) locks it.
