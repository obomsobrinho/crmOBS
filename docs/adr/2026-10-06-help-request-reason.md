# Every help request carries a reason, and the client panel counts them
- Date: 2026-10-06
- Status: Accepted
- Area: agent, data, dashboard

## Context
P1 item 4 of the beta plan (`docs/proximos-passos.md`). A help request (`handoffs` row, `action = pausar`) only had a free-text summary: it said WHAT the person asked, not WHY the AI called the team, so nobody could see what to teach the AI. The market already records the handoff reason (`docs/estrategia-2026-07.md`, section 4, item 2). Owner decisions on 2026-10-06: the list below as is; the count is for the CLIENT, on their own panel; old requests stay without a reason (nothing is reclassified). Plan: `docs/plano-motivo-pedido.md`.

## Decision
- One pure source, `lib/motivos.ts`: `pessoa`, `preco`, `falta_info`, `fechar`, `reclamacao`, `urgencia`, `fora_escopo`, `manipulacao`, and `seguranca`. The model may choose all but `seguranca`; `seguranca` is set by code when the guardrail blocks (`motivoDoPedido`). Anything outside the list is `null`, never invented.
- The structured output gains `motivo` (enum of the model keys plus `""`), described in the JSON schema (`lib/agent.ts`). The base prompt `### OUTPUT` only lists the keys: the descriptions live in the schema the model also receives, so the prompt does not pay ~550 characters of every tenant's 16,000 ceiling twice.
- `handoffs.motivo text null` with a `check` on the same keys (migration `20261006211419_motivo_do_pedido.sql`; `e2e/motivos.design.spec.ts` fails if the check and the list diverge).
- Pedidos: a neutral `Badge variant="motivo"` on each row, "Motivo" in the sheet, and a server filter (`p_motivo` on `pedidos_pagina` and `pedidos_contagens`, so tab numbers follow it) on partial indexes per tab. Realtime rows are filtered by the same rule (`casaMotivo`).
- Conversation: the open request strip shows the reason. WhatsApp notice: `*Motivo:*` line before the request (`textoDoAviso` receives the label; `lib/avisos.ts` keeps zero imports).
- Panel: block "Por que a IA te chamou" with its own period selector (each block owns its period), total and one brand bar per reason, gray for "Sem motivo", never green/amber/red. Counted in the database (`painel_motivos`: requests that OPENED per window and reason, at most windows x 10 rows), ordered by `contagemPorMotivo`.
- Bench diagnostics show the reason.

## Consequences
- Only requests opened after the deploy have a reason; the panel shows the rest as "Sem motivo".
- Adding a reason changes `lib/motivos.ts` and the `check` together, in a new migration.
- Proof: `e2e/motivos.design.spec.ts` (rule, notice, demo screens), `e2e/pedidos.serial.spec.ts` (badge and filter against the real database), `test:e2e:ia` (manipulation cases require `manipulacao`), `test:e2e:bateria` (pausar cases check the stored reason: pessoa, urgencia, reclamacao, fechar). First runs: ia 28/28, bateria 78/78 (2 only on retry).
- Base prompt grew; the OBM advanced prompt assembles to 14,607 characters (ceiling 16,000).
