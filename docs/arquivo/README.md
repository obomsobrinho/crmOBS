# Archive

Finished plans and one-off reports that no longer steer any work. Nothing here is deleted: each file was moved with `git mv` (history kept) and carries a line on top saying why it was archived and what replaces it.

Rule for adding a file here: it is executed or obsolete, no rule in `.claude/rules` or `CLAUDE.md` cites it (`npm run checar` fails on a cited path that moved), and every link to it from the rest of `docs/` is updated in the same commit. A plan cited by code comments or ADRs stays in `docs/` until those citations are updated in a delivery of their own.

| File | Archived | Why | Replaced by |
|---|---|---|---|
| `plano-agente.md` | 10/11/2026 | survey of 22/09/2026, nothing decided; the agent screen was rebuilt afterwards | `docs/adr/` (agent decisions) |
| `plano-ajustes-22-09.md` | 10/11/2026 | executed on 22/09/2026 | the code; design track in `docs/plano-dados-e-estado.md` section 7 |
| `plano-mobile.md` | 10/11/2026 | executed on 23/09/2026 | the code and `docs/handoff.md` |
| `relatorio-mobile.md` | 10/11/2026 | one-off report of the mobile execution | `docs/handoff.md` |
| `relatorio-noite-2026-09-10.md` | 10/11/2026 | one-off report of the demo plan night | `docs/handoff.md` |
