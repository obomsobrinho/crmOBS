# Dashboard periods are rolling windows computed once on the server; the headline follows no selector
- Date: 2026-08-27
- Status: Partially reverted (selector part, see 2026-08-29-dashboard-each-block-owns-its-period.md)
- Area: dashboard

## Context
Step 1 of the beta MVP rebuilt `/painel`. Research and the instrumentation list are in `docs/proximos-passos.md`.

## Decision
- `lib/periodo.ts` (pure module) has the four windows (dia/semana/quinzena/mes), rolling and not calendar. The previous period is the equal previous window, EXCEPT "dia", which compares with the SAME weekday of the previous week (Monday against Sunday would give an alarming badge with no meaning).
- `agoraMs()` exists only to wrap the clock: `Date.now()` in a Server Component body is a `react-hooks/purity` error.
- The 4 periods are computed on the SERVER in one pass and the browser only switches which one shows.
- The headline does NOT follow any selector: it is closed month plus accumulated, and the strongest sentence on the screen cannot shrink with a click. `ValorResumo` has prop `parte` (`tudo`/`manchete`/`resto`) so the page can interleave other blocks between the two halves.
- No chart library, and the reason is COLOR, not bundle: green, amber and red are state, so there is ONE categorical color (the brand) plus gray. Two series is the palette ceiling.
- "Preferiu confirmar" (`conversation_qualifications` with `action='pausar'`) is containment turned into proof: the only observable form of "the AI does not invent". Direction is neutral, never green or red. NEVER label it "what the AI could not answer": `pausar` also fires on fixed escalation triggers, which are policy, and the label would accuse the AI of a failure it did not commit. The label is "o que a IA passou para você".
- The agent reply appears VERBATIM and never hand-picked. Curating the good ones and being found out costs all trust. (The selection RULE changed in round 3, see `2026-08-29-dashboard-verbatim-rule.md`.)

## Consequences
`components/PainelOperacao.tsx`, `components/DashboardCards.tsx` and `components/DashboardBarras.tsx` no longer exist (round 3 replaced them).
