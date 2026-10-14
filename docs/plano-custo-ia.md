# Plan: AI usage per company, with a monthly cap (P1 item 6)

Status: APPROVED by the owner on 13/10/2026 (decisions taken in chat). Ready to execute.

## Why

The beta is paid by the owner: every AI reply on every tenant's WhatsApp is billed to his OpenAI
account, and today nobody sees how much each company spends. A tenant in a loop or with heavy
volume grows the bill with no brake.

## Measured baseline (OBM, last 30 days, `agent_turns`, real turns only)

- Model `gpt-5.4-mini`. Per turn: ~4,683 input tokens (~2,304 of them cached) and ~83 output tokens.
- Official price (developers.openai.com/api/docs/pricing, read on 13/10/2026), per 1M tokens:
  input US$ 0.75, cached input US$ 0.075, output US$ 4.50.
- Cost per turn: ~US$ 0.0023 (about 430 replies per US$ 1).
- A small company (50 replies/day, ~1,500/month) costs ~US$ 3.50; a busy one (240/day) ~US$ 17.
- Conclusion: US$ 50 per company is far too high for the beta; the default cap below is ~US$ 5.

## Decisions (owner, 13/10/2026)

1. **The cap is in TOKENS** (input + output of the agent turns), not in money. The screen also shows
   an ESTIMATED cost in US$ computed from the official price table kept in code. No BRL, no
   exchange rate.
2. **Default cap: 10,000,000 tokens per company per calendar month** (~2,100 replies, ~US$ 5).
   The owner can change it per company on the admin page. `null` = the default.
3. **Month** = calendar month in America/Sao_Paulo (`lib/fuso.ts`), resets on the 1st at 00:00.
4. **At 80%**: WhatsApp notice to the OWNER and to the company's notice group (`notify_group_jid`).
   **At 100%**: the AI of that company stops until the month turns or the owner raises the cap;
   both get a notice. Each notice is sent ONCE per company, month and level.
5. **When stopped**: same behavior as the agent switch off (`processTurn` returns 200 with empty
   `messages` before the model, n8n still records the customer message), with diagnostics reason
   `limite_ia`. The company's app shows a banner "Limite de IA do mês atingido" while stopped. The
   team keeps attending by hand. Raising the cap above the usage reactivates it on the next message.
6. **Where to see it**: a first slice of Admin v1 at `/admin`, owner only. Prospecting and the rest
   of Admin v1 (item 7) come after.
7. **Naming**: in the companies' app the menu and screen texts "Clientes" become **"Contatos"**
   (market term, fits every segment). In the admin, the companies using the CRM are **"Empresas"**.
   Visible text only; tables and the `/clientes` route stay (route rename is a later, separate step).
8. **Out of this step**: audio transcription (Whisper, US$ 0.006/min) and knowledge-base embeddings
   are not recorded per company today; a second step, if the owner wants.

## Answered by the owner (13/10/2026)

- **Owner notice destination**: the SAME notice mechanism as today. The owner's notices go to the
  notice destination (`notify_group_jid`) of the admin user's own tenant (found through
  `user_clients`), through the same sender as the help-request notices. No new number or env var.
  If that tenant has no destination, the owner notice is skipped and logged.
- **Bench turns count**: test turns (`dryRun`) count toward the company's usage like any other
  turn, with no split on screen, and the cap applies to them too (a stopped company is stopped in
  the bench as well, with a clear message there).
- **Admin access**: only the owner. His user id comes from a server env var `ADMIN_USER_IDS` (set by
  the owner in Vercel and `.env.local`); the code never hard-codes or guesses it. Without the var,
  `/admin` is 404 for everyone.

## Design

### Single sources of truth (pure `lib/` modules)
- `lib/custo-ia.ts`: `PRECOS_POR_MODELO` (input, cachedInput, output per 1M, with source URL and
  date), `custoEstimadoUsd(tokens por tipo, modelo)` (unknown model = `null`, never a guess),
  `LIMITE_PADRAO_TOKENS = 10_000_000`, `estadoDoConsumo(usados, limite)` -> `normal | aviso | parado`
  (80% / 100%), `mesSP(date)`.
- Notice texts in `lib/avisos.ts` (one sender per notice type, as today).

### Data (migrations via Supabase MCP, versioned files, types regenerated)
- `clients.ia_limite_tokens bigint null` (null = default). Written only by the admin route.
- `consumo_ia_mensal (client_id, mes date, tokens_entrada, tokens_cache, tokens_saida,
  atualizado_em)`, PK `(client_id, mes)`. Incremented atomically by a SQL function
  called from `logTurn` (one upsert per turn). This keeps the per-turn cap check a PK lookup, never a
  sum over `agent_turns`. RLS on, service_role only (the admin page reads through the server).
- `consumo_ia_avisos (client_id, mes, nivel)` unique, to send each notice once
  (`insert ... on conflict do nothing` decides who sends).
- `admin_acoes (quem, acao, alvo, antes, depois, em)`: every admin change is recorded (decision in
  `docs/proximos-passos.md`).

### Turn path (`processTurn`, `lib/agent-turn.ts`)
- Before the model (WhatsApp turns and bench turns alike): read the month row + cap; if `parado`,
  return the silent turn with reason `limite_ia` (same contract as the agent switch; the bench shows
  the reason). Bench turns are counted like any other turn (`logTurn` increments for `dryRun` too).
  The paid suites (`ia`, `bateria`) run on the test tenants: their usage counts, so keep their cap
  high enough, never bypass the check in code.
- After `logTurn` increments: if the new total crosses 80% or 100%, schedule the notices with
  `after()` (best-effort, deduped by `consumo_ia_avisos`).
- No new query on the hot path beyond one PK read; the increment is part of `logTurn`.

### Admin page `/admin` (owner only, server-enforced)
- Guard: session user id in `ADMIN_USER_IDS`, else 404. Not in the menu of any tenant.
- List of **Empresas**: name, plan/account type, AI state (ativa / aviso / parada / desligada),
  tokens this month, % of cap with a bar, estimated US$, cap (editable), last activity.
- Paginated 10 with infinite scroll, server search by name with debounce (engineering rules).
  No realtime needed (a refresh button is enough for the owner).
- Editing the cap writes `clients.ia_limite_tokens` + an `admin_acoes` row; raising it above the
  usage clears the stop immediately.

### Company side
- Banner in the app shell while the company's AI is stopped (`parado`), owner and attendants.
- "Clientes" to "Contatos" in every visible text (menu, titles, empty states, buttons).

## Tests
- Unit (sem-login): cost math against the table, 80/100 thresholds, SP month boundary, unknown model.
- Serial (real DB, OBS tenant, restore at the end): counter increments on a turn; cap reached makes
  the turn silent with `limite_ia`; notices dedupe (one per level per month); raising the cap
  reactivates; attendant gets 404 on `/admin`.
- Design (`/design/admin`): the Empresas list, bar states, banner.
- Paid: `test:e2e:ia` and the bateria must stay green (the stop must never trigger under the cap).

## Rules and ADR
- Rule lines in `.claude/rules/agent-ai.md` (cap, silent turn, notices once) and a new
  `.claude/rules/admin.md` (access by env list, every action logged, service_role only on server).
- ADR `docs/adr/2026-10-13-ai-usage-cap-in-tokens.md` with the measured baseline above.
