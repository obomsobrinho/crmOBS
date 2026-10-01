---
paths:
  - "app/(app)/painel/**"
  - "lib/painel.ts"
  - "lib/valor.ts"
  - "lib/periodo.ts"
  - "lib/metrics.ts"
  - "lib/mensagem.ts"
  - "components/painel/**"
  - "components/PainelBlocos.tsx"
  - "components/ValorResumo.tsx"
  - "docs/instrumentacao-beta.md"
---
# Dashboard (`/painel`) and perceived value

## What counts
- Who replied is decided ONLY in `lib/mensagem.ts`; `lib/valor.ts`, `lib/metrics.ts`, `lib/painel.ts` and any SQL use it. `imported` is NOT an AI reply: the panel counts only what happened after the AI entered. In SQL: `is distinct from`, not `<>`, and day in America/Sao_Paulo.  (why: docs/adr/2026-08-27-dashboard-imported-is-not-ai-reply.md)
- Perceived-value numbers come only from `lib/valor.ts`; `ValorResumo` computes nothing (prop `parte`: `tudo`/`manchete`/`resto`). Never invent or inflate: no configured hours -> omit the sentence; zero -> omit. Only AI replies count for "fora do horário" and "fim de semana". Classify time in America/Sao_Paulo via `Intl`. Holidays: national only, computed in the module.  (why: docs/adr/undated-perceived-value-lib-valor.md)
- Slice the closed month from the accumulated in memory with `Date.parse`, never by ISO string comparison (`+00:00` vs `Z`). An empty closed month falls back to the accumulated and the label becomes "desde o início". Business hours are saved alone by `PUT` agent-config `mode: "horario"` (merge, never touches `persona`/`prompt_mode`).  (why: docs/adr/undated-perceived-value-lib-valor.md)
- The same "AI reply" rule must hold in the beta queries of `docs/instrumentacao-beta.md`.

## Periods and layout
- Periods live in `lib/periodo.ts` (pure): rolling windows dia/semana/quinzena/mes; the previous period is the equal previous window, except "dia" compares with the same weekday of the previous week. Compute the 4 periods on the server in one pass. Never `Date.now()` in a Server Component (`agoraMs()`).  (why: docs/adr/2026-08-27-dashboard-periods-and-headline.md)
- The headline (closed month + accumulated) follows NO selector. Each block owns its period (operation: 4; movement: 14 and 30 days). There is no global selector, and the text "does not follow the selector" must never return (an e2e fails if it does).  (why: docs/adr/2026-08-29-dashboard-each-block-owns-its-period.md)
- The hour chart counts AI REPLIES, not received messages: `barrasDeHora` counts exactly the rows `atendidasForaDoHorario` counts (`lib/painel.ts`), so the purple parts sum to the headline. Label "em que horas a IA respondeu". Inside/outside hours depends on weekday. Omit the chart when there is no "fora do horário" headline.  (why: docs/adr/2026-08-29-dashboard-hour-chart-counts-ai-replies.md)
- Label for `action='pausar'` counts: "o que a IA passou para você", neutral direction, never green/red, never "what the AI could not answer" (`pausar` also fires on fixed escalation triggers).  (why: docs/adr/2026-08-27-dashboard-periods-and-headline.md)
- The agent sentence is shown VERBATIM, never hand-picked: `escolherVerbatim` takes the most recent reply of a conversation the AI handled ALONE, falling back to the most recent above `VERBATIM_MIN_CHARS`. It returns `mensagens: string[]` (n8n joins a turn with `" | "`; never print the pipe). Thresholds `ESPERA_AVISO_MS`, `VERBATIM_MIN_CHARS` are named in `lib/painel.ts`.  (why: docs/adr/2026-08-29-dashboard-verbatim-rule.md)
- Blocks without instrumentation ("Assuntos em alta", "Objeções que ela segurou") render as empty state: number literally `XX`, positional labels, gray bars; the page removes them itself once data exists. Never a plausible or blurred number.  (why: docs/adr/2026-08-29-dashboard-empty-state-blocks-show-literal-xx.md)
- "Before and after" with imported history is blocked by DATA, not postponed.  (why: docs/adr/2026-08-27-before-after-with-imported-history-blocked-by-data.md)

## Charts
- Chart columns need `h-full`; never `items-end` on the row of columns (bars resolve to height 0). Bars animate `height`, not `scaleY`. No chart library: ONE categorical color (the brand) plus gray; green/amber/red are state; two series max.  (why: docs/adr/2026-08-27-dashboard-chart-columns-need-h-full.md, docs/adr/2026-08-29-dashboard-animation-tokens-and-bar-height.md)
- Motion tokens: `--ease-dado` (data), `--ease-out` (interface), `--dur-cartao`/`--dur-numero`/`--dur-barra`/`--dur-troca`, plus `useContagem` (`components/painel/useContagem.ts`). Reduced motion shows the final value on the first frame.  (why: docs/adr/2026-08-29-dashboard-animation-tokens-and-bar-height.md)
- Mark the no-data card with `data-em-breve` (an outside `data-slot` on `Stat` is ignored).  (why: docs/adr/2026-08-29-dashboard-empty-state-blocks-show-literal-xx.md)
