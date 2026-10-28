# ADR index (docs/adr/, 100 files)

| File | Area | Status | Title |
|---|---|---|---|
| 2026-08-17-ui-migration-to-base-layer.md | ui | Accepted | All screens migrated to the `components/ui/` base layer |
| 2026-08-20-handoff-does-not-pause-or-mute-ai.md | agent-ai | Accepted (supersedes the earlier "silent handoff" of phase 3.5; follow | Handoff does not pause and does not mute the AI |
| 2026-08-20-handoff-no-pause-n8n-pause-nodes-disabled.md | n8n | Accepted | Handoff without pause: the n8n pause nodes are disabled |
| 2026-08-22-advanced-mode-tail-always-reattached.md | agent-ai | Accepted | Advanced mode: free text with the base tail always glued back |
| 2026-08-22-base-tail-single-function.md | agent-ai | Accepted | The base tail is one function used by both modes |
| 2026-08-22-conversations-column-grants.md | security | Accepted (open point recorded below) | conversations browser writes are limited by per-column grants |
| 2026-08-22-playground-tests-config-in-edit.md | agent-ai | Accepted (later made a conversation: 2026-09-26-playground-as-conversa | Test bench inside /agente tests the configuration in edit, compiled by the server |
| 2026-08-22-prompt-three-layer-structure.md | agent-ai | Accepted | Prompt base is three layers and the order is the defense |
| 2026-08-22-save-is-publish-agent-publications.md | agent-ai | Accepted (premise "n8n reads persona live" corrected by 2026-09-17-per | Saving is publishing; agent_publications is an append-only record |
| 2026-08-26-beta-mvp-scope-and-menu.md | product | Accepted | Free beta MVP: scope, menu order and non-reopenable decisions |
| 2026-08-26-no-mass-messaging-over-qr.md | product | Accepted (with explicit owner exceptions below) | Product guardrails: no mass messaging over QR, no own agenda, no automation builder |
| 2026-08-27-before-after-with-imported-history-blocked-by-data.md | dashboard | Accepted (blocked, not postponed). History import was later removed (2 | "Before and after" using imported history is blocked by data |
| 2026-08-27-dashboard-chart-columns-need-h-full.md | dashboard | Accepted | Chart columns need h-full; items-end on the column row breaks the bars |
| 2026-08-27-dashboard-imported-is-not-ai-reply.md | dashboard | Accepted | Dashboard counts only what happened after the AI entered; `imported` is not an AI reply |
| 2026-08-27-dashboard-periods-and-headline.md | dashboard | Partially reverted (selector part, see 2026-08-29-dashboard-each-block | Dashboard periods are rolling windows computed once on the server; the headline follows no selector |
| 2026-08-27-run-both-e2e-suites-before-closing-a-step.md | testing | Accepted | Run BOTH e2e suites (no-login and login) before closing a step |
| 2026-08-28-account-type-identifies-not-authorizes.md | billing | Superseded by 2026-10-16-account-type-removed.md | clients.account_type identifies the tester, it never authorizes access |
| 2026-08-28-agent-switch-two-columns.md | onboarding | Accepted | Agent switch is two columns, and a muted agent returns 200 |
| 2026-08-28-agent-two-surfaces-one-form.md | onboarding | Accepted | The agent has two surfaces over one form |
| 2026-08-28-ai-security-proven-with-real-brain.md | agent-ai | Accepted | AI safety is proven against the real brain, with a sabotaged persona for guardrail cases |
| 2026-08-28-feedback-table-write-only.md | product | Accepted | feedback is write-only from the browser, with no read screen |
| 2026-08-28-publish-blockers-drop-tested.md | onboarding | Accepted | publishBlockers() no longer requires the "tested" step |
| 2026-08-28-wizard-draft-guards-and-state.md | onboarding | Accepted | Wizard draft in the browser, four guards on /montagem, onboarding state module |
| 2026-08-29-dashboard-animation-tokens-and-bar-height.md | ui | Accepted | Dashboard animation is house CSS plus useContagem; bars grow in height |
| 2026-08-29-dashboard-each-block-owns-its-period.md | dashboard | Accepted | Dashboard round 3: each block owns its period, no global selector |
| 2026-08-29-dashboard-empty-state-blocks-show-literal-xx.md | dashboard | Accepted | Blocks without instrumentation ship as empty state with a literal "XX" |
| 2026-08-29-dashboard-hour-chart-counts-ai-replies.md | dashboard | Accepted | The hour chart counts AI replies, not received messages |
| 2026-08-29-dashboard-verbatim-rule.md | dashboard | Accepted (supersedes "most recent AI reply" from 2026-08-27) | Verbatim agent sentence: most recent from a conversation the AI handled alone |
| 2026-08-31-realtime-subscribe-callback-and-focus-refetch.md | realtime | Accepted (extended by 2026-10-01-production-loading-and-realtime-rules | Realtime drops silently: subscribe with callback, refetch on reconnect and on focus |
| 2026-09-07-serial-project-for-absence-tests.md | testing | Accepted | Tests that assert "this must NOT happen" go to the `logado-serial` project |
| 2026-09-11-ia-suite-paid-and-opt-in.md | testing | Accepted | The `ia` e2e suite hits the real brain, is paid, and runs only when named |
| 2026-09-11-memoize-server-supabase-client-per-request.md | data | Accepted | Memoize server createClient() and getMyClient() per request |
| 2026-09-11-whatsapp-down-banner-checked-in-browser.md | ui | Accepted | WhatsApp-down banner is checked in the browser, never in a Server Component |
| 2026-09-17-ai-brain-in-api-agent-n8n-is-the-pipe.md | n8n | Accepted (cutover applied and active) | The agent brain runs in POST /api/agent; n8n is only the pipe |
| 2026-09-17-atendente-project-asserts-absence-of-power.md | testing | Accepted | Separate `atendente` Playwright project with the second user's session |
| 2026-09-17-compile-persona-single-dispatch.md | agent-ai | Accepted | compilePersona is the single "mode -> persona" dispatch |
| 2026-09-17-domain-change-silent-outage.md | n8n | Accepted | Domain change silently took the channel down |
| 2026-09-17-e2e-tenant-is-obs.md | testing | Accepted | The e2e login suite runs against the OBS tenant (the owner's parked number) |
| 2026-09-17-n8n-channel-hardening.md | n8n | Accepted | n8n channel hardening: groups refused, dedupe, error fallback |
| 2026-09-17-n8n-workflows-versioned-secret-placeholder.md | n8n | Accepted | n8n workflows are versioned in n8n/ with the secret replaced by a placeholder |
| 2026-09-17-persona-assembled-at-read.md | agent-ai | Accepted | Persona is assembled at read time, every turn |
| 2026-09-17-persona-origem-diagnostic.md | agent-ai | Accepted | diagnostics.personaOrigem exposes where the prompt came from |
| 2026-09-19-ai-and-person-never-attend-same-conversation.md | agent-ai | Accepted | AI and a person never attend the same conversation, enforced in the database |
| 2026-09-19-inbox-opens-on-today.md | inbox | Accepted | The conversation list opens on "Hoje" |
| 2026-09-19-input-sutil-variant.md | ui | Accepted | Input variant `sutil` for fields inside pair tables |
| 2026-09-23-beta-open-master-switch.md | billing | Superseded by 2026-10-15-vitalicio-replaces-the-beta-switch.md | BETA_ABERTO: master switch that frees every tenant during the beta (removed on 15/10/2026) |
| 2026-09-23-connect-does-not-import-history.md | onboarding | Accepted | `/connect` imports no history; new instances are created with `syncFullHistory: false` |
| 2026-09-24-connect-by-pairing-code-and-risk-notice.md | onboarding | Accepted | Connect WhatsApp by phone number (pairing code) and trimmed risk notice |
| 2026-09-24-first-activation-requires-real-connection.md | onboarding | Accepted | First activation checks the Evolution connection state |
| 2026-09-24-montagem-order-inverted-connect-last.md | onboarding | Accepted | /montagem order inverted: connect WhatsApp is the last step |
| 2026-09-25-auth-email-link-implicit-flow.md | onboarding | Accepted | Auth e-mail link arrives in the implicit flow: /auth/concluir |
| 2026-09-26-button-carregando-prop.md | ui | Accepted | Async actions use Button `carregando`, not a disabled button |
| 2026-09-26-e2e-seed-in-production-db.md | testing | Accepted | E2E seed: one test conversation created in the production database |
| 2026-09-26-montagem-wizard-round.md | onboarding | Accepted | /montagem wizard round of 26/09/2026 (owner requests, one by one) |
| 2026-09-26-playground-as-conversation.md | agent-ai | Accepted (owner requests for first impression; same `components/Playgr | The test bench becomes a conversation (shared by /agente and the assembly) |
| 2026-09-27-dates-on-screen-use-sao-paulo-timezone.md | ui | Accepted | Dates on screen always use timeZone America/Sao_Paulo |
| 2026-09-27-handoff-queue-and-handoffs-table.md | agent-ai | Accepted (amended 2026-09-28 with the `mesmoAssunto` safety net; follo | Help requests become a queue: `handoffs` table, composer-integrated request, AI decides "new request" |
| 2026-09-27-orientar-resolves-request-immediately.md | agent-ai | Accepted (supersedes the 2026-09-26 rule: request closed only when pro | Orienting a help request resolves it immediately |
| 2026-09-27-resolved-requests-enter-the-prompt.md | agent-ai | Accepted | Already-resolved help requests enter the prompt as their own section |
| 2026-09-27-supabase-auth-redirect-urls.md | onboarding | Accepted | Production domain must be in Supabase Auth Redirect URLs and Site URL |
| 2026-09-29-conducao-section-and-persona-limit-14000.md | agent-ai | Accepted (limit raised again, see 2026-09-30-dates-and-times-in-base-p | CONDUÇÃO DA CONVERSA added to the base tail; persona limit raised to 14,000 |
| 2026-09-29-help-request-lives-in-the-test-conversation.md | agent-ai | Accepted | The help request lives in the test conversation, with the same composer as Conversas |
| 2026-09-29-notify-destination-required-first-activation.md | onboarding | Accepted | Notification destination is mandatory on first activation |
| 2026-09-29-notify-destination-single-target.md | agent-ai | Accepted | notify_group_jid is the single destination of all WhatsApp notices |
| 2026-09-29-numero-de-avisos-is-never-a-conversation.md | agent-ai | Accepted | The notices number is never a conversation |
| 2026-09-29-whatsapp-notices-from-processturn.md | agent-ai | Accepted (beta P0; plans in `docs/plano-avisos.md`) | Help-request notice on WhatsApp is sent from processTurn |
| 2026-09-30-contact-email-birthdate-grants-cpf-excluded.md | data | Accepted | Contact fields editable from the browser; CPF deliberately excluded; one shared contact sheet |
| 2026-09-30-dates-and-times-in-base-prompt.md | agent-ai | Accepted | Date and time rules live in the base, not only in guided mode |
| 2026-09-30-n8n-audio-broken-error-outputs.md | n8n | Accepted | Audio was silently broken; media nodes get error outputs |
| 2026-09-30-n8n-one-row-per-received-message.md | n8n | Accepted | One chat_messages row per received message |
| 2026-09-30-pedidos-detail-is-a-request-sheet-not-a-chat.md | product | Accepted (rebuilt 2026-09-30, `docs/plano-fechar-p0.md`, `components/P | /pedidos: the detail is the request sheet, never a chat |
| 2026-10-02-pedidos-paginated-single-source.md | data | Accepted | /pedidos paginates 10 at a time from one source (`lib/pedidos-fonte.ts`, SQL `pedidos_pagina`), realtime patches one conversation queue |
| 2026-09-30-schedule-does-not-open-help-request.md | agent-ai | Accepted | Scheduling does not open a help request |
| 2026-10-01-contacts-also-born-from-the-crm.md | inbox | Accepted | Contacts can be created from the CRM ("Novo cliente") |
| 2026-10-01-e2e-n8n-attendance-battery.md | testing | Accepted | End-to-end attendance battery against production n8n |
| 2026-10-01-n8n-send-failure-continues.md | n8n | Accepted | A failing send must not stop the rest of the execution |
| 2026-10-01-n8n-sliding-wait-debounce.md | n8n | Accepted | Sliding wait in the n8n debounce |
| 2026-10-02-n8n-webhooks-secret-path-and-header-auth.md | n8n | Accepted | Secret UUID paths on the three n8n webhooks and header auth on the two CRM flows |
| 2026-10-01-production-loading-and-realtime-rules.md | realtime | Accepted | Production loading: paginate, server-side search, row-level realtime, session-bound channels |
| 2026-10-01-migrations-versioned-in-repo.md | security | Accepted | Database migrations live in the repo; default privileges give anon nothing |
| 2026-10-01-profile-photo-copied-to-bucket.md | data | Accepted | Contact profile photos are copied to our bucket |
| 2026-10-02-list-rpcs-keyset-per-index.md | data | Accepted | List RPCs (inbox, pipeline, clientes) read one index per group and stop at the limit; searches use the trigram index on the exact expression; counters split open requests from the window |
| 2026-10-02-painel-agrega-no-banco.md | dashboard | Accepted | Panel and subscription numbers aggregate in SQL (Max rows is 1000), classification stays in TS, SQL copy of "who replied" is declared and tested |
| 2026-10-02-session-by-claims-and-cheap-navigation.md | data | Accepted | Session checked by local JWT claims (getClaims), sensitive writes re-check at Auth, tenant cache only for members, cheaper conversation opening |
| 2026-10-03-test-phone-never-reaches-evolution.md | n8n, testing | Accepted | A test phone (DDD 00) never reaches Evolution: IF before every Evolution node in n8n, telefoneImpossivel in the app, checar fails the export otherwise |
| 2026-10-03-disconnect-and-switch-whatsapp-number.md | onboarding, WhatsApp | Accepted | Owner-only explicit logout of an open instance (agent goes Desativado, history stays), switch number on the same instance via the existing connect flow, webhook re-pointed, notices destination to be rechecked |
| 2026-10-05-turn-calendar-computed-in-code.md | agent, prompt | Accepted | Every turn gets a code-computed CALENDÁRIO (today plus 7, weekday, open/closed/already closed) from the registered hours only; the model never does calendar arithmetic |
| 2026-10-06-schedule-needs-time-and-summary-keeps-agreements.md | agent, prompt | Accepted | A meeting is agendar only with day AND time (period alone: ask the time), listed in PRECEDÊNCIA; the help summary keeps what was agreed and what did not happen |
| 2026-10-06-help-request-reason.md | agent, data, dashboard | Accepted | Every help request carries a reason from lib/motivos.ts (seguranca set by code), filterable in Pedidos and counted per reason on the client panel (painel_motivos) |
| 2026-10-08-help-request-resolution-is-stored.md | data, pedidos, conversation | Accepted | The resolution (orientou_ia, time_resolveu, time_assumiu) is a stored column from lib/solucoes.ts, recorded by fecharPedido per door; screens show the label, never a derived sentence |
| 2026-10-08-pedido-detail-shows-source-messages.md | pedidos, data, realtime | Accepted | The Pedidos detail shows section cards in one column with the real client messages (before and while waiting), the orientation and the reply after, by who sent it (lib/historia-do-pedido.ts), loaded only on open; the AI summary is a labeled title, reason/times/resolution only in the facts strip |
| 2026-10-08-open-request-updated-by-new-client-info.md | agent, data, pedidos | Accepted | Client info added to an open request rewrites its summary (atualizado_em) through the pure atualizacaoDoPedido (lib/fila-de-pedidos.ts); never a new notice, ties are skipped |
| 2026-10-13-orientation-saved-as-agent-rule.md | agent-ai, pedidos, data | Accepted | An orientation can be saved as a rule in clients.regras_salvas, rendered by ONE section before the base tail in both modes; only POST/DELETE agent-rules writes it, by compare and swap (limit check, publication row); one compile helper (compilarDoTenant); the guardrail sees it through the persona |
| 2026-10-13-ai-usage-cap-in-tokens.md | agent-ai, admin, data | Accepted | AI usage per company with a monthly cap in TOKENS (default 10M, SP month): one PK read before the model, atomic sum in logTurn, silent turn limite_ia, notices once per level, /admin guarded by ADMIN_USER_IDS with every action logged |
| 2026-10-14-clientes-central-with-tabs.md | admin, ui, data | Accepted | The owner's central "Clientes" at /clientes (contacts moved to /contatos): guard per route (page and API, listed and tested), non-admins redirected and never told it exists, menu item only for the owner, ONE keyset list query with alert chips from lib/admin-alertas.ts, detail with Visao geral, Uso de IA (cap edit moved here) and Atendimento reusing the panel's numbers |
| 2026-10-15-charts-recharts-in-base-layer.md | ui, admin, dashboard | Accepted | shadcn chart (Recharts 3.8.0 + react-is 19) in components/ui/chart.tsx, ONLY door to charts (the heatmap component was deleted on 16/10/2026), themed with --chart-* tokens (brand + neutral, ramp for slices, green/amber/red stay state); tooltip and table view on every chart; central Uso de IA = columns + monthly-limit pace line + period chips, heatmap with tooltip, Atendimento = stacked columns, donut, horizontal bars; admin_cliente_uso_horas for the Dia period |
| 2026-10-15-central-layout-adjustments.md | ui, admin, data | Accepted | The owner's layout adjustments of the central (15/10/2026): the rail scrolls its items so the page never does, Dia = today from 00h (the panel stays rolling), columns above the pace line in a state color, peak map in 3-hour bands with numbers, Financeiro rows chosen by access kind, one filter icon, month and whole-period picker (admin_cliente_uso_meses), cap editing moved to Acoes, detail warmed on idle with a segment skeleton |
| 2026-10-16-central-picos-plan-caps-ptax-and-cards.md | admin, ui, data, agent-ai | Accepted | Peak hours variation A with the period filter and a custom range (lib/picos.ts, admin_cliente_picos); per-plan AI caps 13 / 33 / 100 mi (REAL enforcement, derivation written); meter with the ideal-spend bar; the client's model and costs in reais at the BCB PTAX; number cards with deltas, sparklines, progress and donuts |
| 2026-10-15-vitalicio-replaces-the-beta-switch.md | billing, admin, data | Accepted (revised 15/10/2026) | accessState returns a discriminated kind (deactivated > manual block > vitalício > stored status); situation, alerts and list filters map from it; vitalício and manual block are dedicated columns written only by admin_mudar_conta (trigger), the webhook never rewrites a vitalício company (pure atualizacaoDoEvento, frozen columns); Financeiro actions in one transaction with admin_acoes, "Estender teste" one control (7, 15, Personalizado, Vitalício); the BETA_ABERTO switch, its kind and its notice removed (admin_bloqueados_sem_beta left unused until after the deploy) |
| 2026-10-15-two-step-company-deletion.md | admin, data, security | Accepted | Desativar is reversible and enforced on the server (pages to /conta-desativada, sessaoDaRota 403, processTurn silent; the product owner is never locked out); Apagar de vez only for a deactivated company, name typed, LGPD export first (streamed ZIP, one CSV per table), ONE routine (Asaas cancel, Storage, Evolution logout and instance delete, one SQL transaction with a surviving audit row, logins) over TABELAS_DO_CLIENTE, with billing_events KEPT (TABELAS_MANTIDAS, deleted_client_id/name), checked against the schema three ways |
| undated-agent-enabled-vs-published-at.md | onboarding | Accepted (see also 2026-08-28-agent-switch-two-columns.md) | agent_enabled is the switch; agent_published_at is the first activation and is never cleared |
| undated-agent-turns-metering.md | agent-ai | Accepted | agent_turns: one measurement row per AI turn, best-effort, no message content |
| undated-asaas-billing-and-webhook.md | billing | Accepted | Asaas billing: subscribe, idempotent public webhook, event map, cash-register screen |
| undated-atendimento-ia-stays-text.md | data | Accepted | Decisions kept on purpose: atendimento_ia is text, chat_messages.active is dead |
| undated-brand-and-state-colors.md | ui | Accepted | Brand lives in lib/brand.ts; green, amber and red are state colors only |
| undated-crm-reads-only-n8n-writes-conversations.md | n8n | Accepted | The CRM reads conversation data; n8n and service_role routes write it |
| undated-html5-drag-not-testable-with-dragto.md | testing | Accepted | HTML5 drag is tested by dispatching events, never with `locator.dragTo()` |
| undated-n8n-live-changes-need-explicit-confirmation.md | n8n | Accepted | n8n is production: never change live without explicit confirmation |
| undated-nomewpp-voce-is-not-a-contact-name.md | data | Accepted | `nomewpp = "Você"` is not a contact name |
| undated-perceived-value-lib-valor.md | dashboard | Accepted | Perceived value (lib/valor.ts): dependency sentences, four non-negotiable rules |
| undated-pipeline-stage-model.md | data | Accepted | Pipeline stage model and AI stage moves |
| undated-plans-and-seat-limit.md | billing | Accepted | Plans table, null plan means no limit, owner does not count as a seat |
| undated-processturn-guardrail-handoff-coach.md | agent-ai | Partially reverted (see 2026-08-20-handoff-does-not-pause-or-mute-ai.m | Extract the agent turn into processTurn, with dryRun, diagnostics, guardrail and handoff coach |
| undated-prompt-cache-measured-and-threshold.md | agent-ai | Accepted | Prompt cache measured; prefix order is load-bearing; warning uses the upper threshold |
| undated-signup-without-password-and-provision-tenant.md | onboarding | Accepted | Self-service signup: no password field, provision_tenant, abuse brake |
| undated-subscription-access-gate-read-only-mode.md | billing | Accepted | Subscription access gate: pure rule, read-only mode, 4 server-side enforcement points |
| undated-tenant-isolation-pool-rls.md | security | Accepted | Multi-tenancy: shared tables + client_id + RLS, with fixed roles |

## Duplicates and overlaps (recommended merges; nothing was edited or deleted)

1. **Agent switch (2 files)**: `2026-08-28-agent-switch-two-columns.md` and `undated-agent-enabled-vs-published-at.md`. Same decision (`agent_enabled` + `agent_published_at`, never cleared). Merge into the dated one; carry over from the undated one the vocabulary rule ("Agente ativo"/"Desativado", never "pausado") and the owner-only guard. Delete the undated file afterwards.
2. **WhatsApp notices (3 files)**: `2026-09-29-whatsapp-notices-from-processturn.md`, `2026-09-29-notify-destination-single-target.md`, `2026-09-29-notify-destination-required-first-activation.md`. One feature (plan `docs/plano-avisos.md`). Recommend ONE ADR "WhatsApp notices" (sender, single destination, mandatory on first activation). If kept separate: keep single-target (agent-ai) as the destination semantics, and make required-first-activation point to it. `2026-09-29-numero-de-avisos-is-never-a-conversation.md` is a distinct decision, keep.
3. **Handoff 2026-08-20 (2 files, C and F)**: `2026-08-20-handoff-does-not-pause-or-mute-ai.md` (app) and `2026-08-20-handoff-no-pause-n8n-pause-nodes-disabled.md` (n8n). Same decision, two halves. Merge into the first and keep a section "n8n side"; also fold in the superseded part of `undated-processturn-guardrail-handoff-coach.md` (it already links to the first).
4. **Prompt base (related, keep but cross-link)**: `2026-08-22-base-tail-single-function.md`, `2026-08-22-advanced-mode-tail-always-reattached.md`, `2026-09-29-conducao-section-and-persona-limit-14000.md`, `2026-09-30-dates-and-times-in-base-prompt.md` (persona limit history 12,000, 14,000, 16,000 is split across the last two; one "LIMITS.persona" timeline would help).
5. **Persona at read (related)**: `2026-09-17-persona-assembled-at-read.md`, `2026-09-17-compile-persona-single-dispatch.md`, `2026-09-17-persona-origem-diagnostic.md`. Distinct enough; ensure the first states it corrects the premise of `2026-08-22-save-is-publish-agent-publications.md`.
6. **Dashboard 2026-08-27 vs 2026-08-29**: `2026-08-27-dashboard-periods-and-headline.md` is partially reverted by `2026-08-29-dashboard-each-block-owns-its-period.md`; `2026-08-27-dashboard-chart-columns-need-h-full.md` overlaps `2026-08-29-dashboard-animation-tokens-and-bar-height.md` on bar height. Keep, but cross-link.
7. **Test bench**: `2026-08-22-playground-tests-config-in-edit.md` is extended by `2026-09-26-playground-as-conversation.md` and `2026-09-29-help-request-lives-in-the-test-conversation.md`. Keep as a chain.
8. **Montagem (3 files)**: `2026-08-28-wizard-draft-guards-and-state.md`, `2026-09-24-montagem-order-inverted-connect-last.md`, `2026-09-26-montagem-wizard-round.md`. Chain, keep; the round file mixes several small decisions and could be split or folded into the order ADR.
9. **Orientar**: `2026-09-27-orientar-resolves-request-immediately.md` supersedes the 2026-09-26 rule inside `2026-09-27-handoff-queue-and-handoffs-table.md`; make sure both state it.
10. **Realtime**: `2026-08-31-realtime-subscribe-callback-and-focus-refetch.md` extended by `2026-10-01-production-loading-and-realtime-rules.md`. Keep as a chain.
11. **Dated vs undated**: 17 `undated-*` files should get real dates when the owner knows them (e.g. `undated-subscription-access-gate-read-only-mode.md` is Phase 4, `undated-processturn-guardrail-handoff-coach.md` is Phase 3.5, approx. 08/2026).
12. **`2026-08-27-before-after-with-imported-history-blocked-by-data.md`**: import was later removed (`2026-09-23-connect-does-not-import-history.md`); status says so, consider marking Superseded.
| 2026-10-16-account-type-removed.md | billing, data, admin | Accepted | The beta is over: no code reads or writes clients.account_type, the migration that drops it waits for the deploy, the instrumentation queries stop filtering by it |
| 2026-10-16-goal-progress-meter-and-no-account-type.md | admin, ui | Accepted | Cap meter as a goal-progress bar with a pace marker, hatched gap, green or red by pace and a projection sentence; header without the Conta/Plano line and the repeated "nunca cobrado"; no account type on any screen; donut center scaled to fit |
| 2026-10-17-pairing-code-off-qr-only.md | onboarding | Accepted | Pairing code turned off (WhatsApp rejects the Evolution 2.3.7 code, upstream #2696); connect by QR only, mobile notice to open the page on a computer |
| 2026-10-27-inbound-media-signed-upload.md | n8n, data | Accepted | Received media goes to Storage by a signed upload URL from `/api/inbound-media` (`assinar: true`, rule in `lib/midia-recebida.ts`), n8n PUTs the binary; the base64 body stays accepted; video reaches the AI as caption plus "[Vídeo enviado]" |
| 2026-10-23-montagem-clear-from-start-to-end.md | onboarding | Accepted | Montagem in five steps (connect alone, then "Quem a IA chama" with the notices, the review and Ativar); opening with one colored icon per step and the computer sentence; hours in step 1 confirmed or not (`hoursConfirmed`, read only by `horarioDaConfig`); review before activating with the /agente fields in a sheet; mobile "Continue no computador" stop; signup tip |
| 2026-10-28-own-agenda-slots-in-prompt.md | agent-ai, data, product | Proposed | Own agenda (owner decision 28/10/2026): the AI asks day and period, the code offers at most 3 nearest times and books (exclusion constraint against overlap), inside the minimum notice it escalates to the team; start grid on the hour, half hour or right after; reminder in one daily run at 9h by Vercel Cron for tomorrow up to the next open day (`lib/envio-ativo.ts`, values pending); agenda switch drives menu, "Agendado" funnel column and prompt |
