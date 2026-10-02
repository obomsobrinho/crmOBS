@AGENTS.md

# CRM WhatsApp: project guide

Chat with the owner in Portuguese (BR). Code, docs, specs and ADRs in English. UI strings stay Portuguese.
Hard rules live in `.claude/rules/` (see "Where to read more"). `engineering.md` is always loaded; the others load by file path.

## What this is
Multi-tenant CRM on top of an existing **n8n + Evolution API + Supabase** stack. Many companies (tenants) use the same system, each sees only its own data, and an AI agent answers on each tenant's WhatsApp. Free beta with 5 to 10 acquaintances of the owner; billing is built and parked on purpose. The CRM is a spin-off of OBS (O Bom Sobrinho): no fixed product name in components (`lib/brand.ts`).

## Who does what
- **Evolution API** = WhatsApp connection (one *instance* per tenant). The CRM talks to it only in onboarding (create instance, QR/pairing code) and for status/notice targets.
- **n8n** = the pipe (PRODUCTION). Receives the Evolution webhook, calls the brain `POST /api/agent`, sends replies, records messages with `service_role`. No business logic in n8n.
- **CRM (this repo, Next.js 16)** = interface and brain. Reads Supabase with the USER session (RLS per tenant); sends manual messages through an n8n webhook; the brain (`processTurn`) runs here. Never writes conversation tables directly (except granted columns).

## Glossary ("cliente" is AMBIGUOUS, read this)
- **`clients` = the TENANT**: the company that USES the CRM (e.g. OBM, Loja Teste). PK uuid. NOT a lead.
- **`dados_cliente` = the CONTACTS/LEADS**: who messages a tenant's WhatsApp ("the customer of your customer"). PK bigint, unique `(client_id, telefone)`.
- `client_id` in `chat_messages` and `dados_cliente` ALWAYS points to the tenant, NOT NULL, never to the contact.
- `chat_messages` = messages (`user_message` received and/or `bot_message` sent). Linked to a contact by `phone = dados_cliente.telefone` within the same `client_id` (no FK).
- `user_clients` = N:N `auth.users` <-> `clients`, with `role` `dono`/`atendente` (same DB role `authenticated`). `public.tenant_members()` lists colleagues.
- `clients.persona` = record/fallback of the compiled prompt; the SERVED persona is assembled on read. `agent_config` (jsonb, guided builder; `hours` also read by `lib/valor.ts`; `handoffNotice`), `prompt_mode` `guiado`/`avancado`.
- `clients.agent_enabled` = on/off; `agent_published_at` = FIRST activation, never cleared (separates montagem from edit).
- `clients.notify_group_jid` = destination of ALL WhatsApp notices (group or number); the name is historical.
- `clients.account_type` (`interno`/`beta`/`pago`, nullable) identifies the tester, never authorizes. Subscription columns: `subscription_status`, `trial_ends_at`, `grace_until`, `billing_provider`, `billing_customer_id`, `billing_subscription_id`, `billing_seats`, `billing_plan`.
- `agent_publications` = append-only log of each Save. `agent_turns` = per-turn AI measurement (no content). `conversation_qualifications` = AI `action`/`summary`/`preferencia_horario` per turn.
- `handoffs` = one row per help request (queue/history); `conversations.handoff_at` = oldest open one, drives "Precisa de você". `pedido` = help request opened by the AI (`action = pausar`). `retomada` = turn with no new client message after orienting. `pending_instruction` = operator orientation for the next turn.
- `dryRun` = turn that persists nothing (bench). `personaOverride` = persona injected, honored only in `dryRun`. `personaOrigem` = where the prompt came from.
- `knowledge_documents` + `knowledge_chunks` = RAG (pgvector 1536, `match_knowledge_chunks`); buckets `knowledge`, `whatsapp-media`.
- `pipeline_stages` = one funnel per tenant; `conversations.stage` FKs to `(client_id, key)`; `stage_source` `human`/`ia`.
- `tags` + `conversation_tags`, `conversation_notes` (never sent to WhatsApp), `quick_replies`, `feedback` (beta reports, browser write-only).
- `nomewpp` = WhatsApp pushName owned by n8n; "Você" on sent messages is not a name. `imported` = pre-AI history, not an AI reply.
- `inbox_pagina` / `inbox_contagens` = SQL functions feeding the conversation list. `provision_tenant` = SQL function creating tenant + owner + funnel.
- Test tenant: OBS = OBM (OBM in the DB, OBS in docs), the owner's parked number, `prompt_mode = 'avancado'`; Loja Teste = secondary tenant for `dryRun` checks. DDD 00 phone = e2e test conversation, never notified.
- "Agente ativo" / "Desativado" = the agent switch; "pausada" = the AI of ONE conversation when a human took over.

## Owner's working rules (universal)
- The owner's personal working rules (survey vs fix, never invent, scratchpad, no AI footer) live in the global `~/.claude/CLAUDE.md`; `engineering.md` repeats the engineering ones.
- Menu "Em breve" = Agenda and Follow-up; Campanhas is out.
- n8n is PRODUCTION: never modify or activate workflows live without explicit confirmation (`validateOnly` first). Never commit `x-lookup-secret` (skill `exportar-n8n`). Never paste secrets in chat.
- Atendimento is the product: an attendance bug comes before any side finding. Before asking the owner to test an attendance change, run `npm run test:e2e:n8n` (see `testing.md`).
- Never build mass sending over the QR (Baileys) connection, and never write marketing that promises mass sending, "não pague a API da Meta" or ban protection. Exception (decided 29/09/2026): the owner's OWN prospecting inside `/admin`, his user only, dedicated number, daily cap and interval (not built yet; never a tenant feature).
- Active messaging (reminders, birthdays, Follow-up) only to contacts with a recent conversation, never cold or imported lists; daily cap + random interval; "responda SAIR" exit; channel-agnostic.
- Never build a full own agenda nor a visual automation builder. Agenda = Google Calendar integration, after the beta, and it needs agent tools (function calling in `/api/agent`).
- Positioning anchors are ZapResponder (floor) and HelenaCRM (ceiling), but the field has many more peers: open the full list in `docs/estrategia-2026-07.md` before saying who the competitors are. Looking at a competitor means bringing what to adopt and do better, not a scoreboard.
- Meta charges Official API service messages from 01/10/2026: migration math needs variable cost, not zero.
- Mixed audience: no fixed screen text may assume appointment, patient or scheduling; the preset carries segment language.

## Where things live
Single sources of truth (pure `lib/` modules unless noted; never duplicate their rule):
- Access and plans: `lib/billing.ts` (`accessState`, `PLANS`); beta switch `lib/beta.ts`; Asaas `lib/asaas.ts` (server-only).
- Who replied (AI/human/imported): `lib/mensagem.ts`. Periods: `lib/periodo.ts`. Panel numbers: `lib/painel.ts`; perceived value: `lib/valor.ts`; metrics `lib/metrics.ts`.
- Prompt: `lib/agent-prompt.ts` (`compilePersona`, `buildPersona`, `buildAdvancedPersona`, `buildBaseTail`, `LIMITS`), `lib/agent.ts` (model call and prompt prefix), `lib/agent-turn.ts` (`processTurn`, `personaDoTenant`, `logTurn`, server-only), `lib/guardrail.ts`, `lib/agent-diagnostics.ts`, `lib/agent-presets.ts`, `lib/rag.ts`.
- Handoff and notices: `lib/handoffs.ts` (`fecharPedido`), `lib/pedidos.ts`, `lib/avisos.ts`, `lib/horarios.ts`, `lib/crm.ts` (`quemAtende`).
- Inbox and contacts: `lib/inbox.ts` (names, `diaSP`, `avatarPair`), `lib/inbox-lista.ts`, `lib/clientes.ts`, `lib/fotos.ts`, `lib/pipeline.ts`, `lib/team.ts`.
- Onboarding: `lib/onboarding.ts` (`PASSOS_MONTAGEM`, `montagemState`, `publishBlockers`). Formats: `lib/format.ts` (`FUSO`). Brand: `lib/brand.ts`, `components/BrandMark.tsx`.
- Supabase: `lib/supabase/{client,server,service}.ts`; auth `lib/auth.ts` (`getMyClient`, `requireActiveTenant`); Evolution `lib/evolution.ts`.
- Client data hooks: `lib/use-paginada.ts`, `lib/use-contagem-ao-vivo.ts`, `lib/use-debounce.ts`, `lib/*-fonte.ts`.
- UI: `components/ui/` base layer (shadcn/Radix), `components/` product, `components/agente/` agent form, `components/painel/` panel, tokens in `app/globals.css`, docs in `docs/design-system/`.
- n8n workflows: `n8n/` (`obs-atendimento.json`, `crm-envio-manual.json`, `crm-envio-ia.json`).

Routes. Public: `/login`, `/cadastro`, `/recuperar-senha`; auth: `/auth/confirm`, `/auth/concluir`, `/definir-senha`. Outside `app/(app)`: `/montagem` (owner-only wizard, once), `/assinatura`, `/connect`. In `app/(app)`: `/inbox`, `/inbox/[id]`, `/pedidos` (`?abrir={id}`), `/pipeline`, `/painel`, `/agente` (owner-only, 3 tabs + advanced, with the KB and the bench), `/clientes`, `/conhecimento` (out of the menu, route kept), `/equipe`, `/perfil`. Preview: `/design/*` (fake data). Landing (`app/page.tsx`): unpublished owner to `/montagem`, published owner to `/painel`, attendant to `/inbox`.
API (`app/api/`): `agent` (brain, `x-lookup-secret`), `playground` + `playground/transcrever` (owner-only, `dryRun`), `send`, `contacts`, `conversations/{orientar,resolve}`, `fotos/[...path]`, `inbound-media`, `team/{invite,remove}`, `signup` (public), `billing/{subscribe,webhook}`, `clients/[id]/{agent-config,connect-whatsapp,whatsapp-status,publish,notify-target,knowledge,whatsapp-media}`, `clients/by-instance`.

## How to run
- Dev: `npm run dev` (port 3001 via `.claude/launch.json`). Types/build: `npm run build`. Lint: `npm run lint`.
- E2E (Playwright, `e2e/`, details in `e2e/README.md`, credentials in `.env.e2e.local`, outside git): `npm run test:e2e -- --project=sem-login` (fake `/design` screens); `npm run test:e2e:login` (setup + `logado` + `atendente` + `logado-serial`, real DB on the OBS tenant); `npm run test:e2e:ia` (12 paid real-brain traps, only when named); `npm run test:e2e:n8n` (paid end-to-end attendance battery against production n8n, only when named). Also a `mobile` project.
- Close a delivery with the `fechar-entrega` skill (types, lint, build, the right suites). Beta metrics: skill `consultas-beta`.

## Where to read more
- **`docs/handoff.md` first** (map and state: what to read, where the beta stands, what was in progress, the traps).
- `docs/proximos-passos.md` = SOURCE OF TRUTH for product decisions and roadmap (read before prioritizing or scoping). `docs/estrategia-2026-07.md` = market research (its old prescriptions are superseded; `proximos-passos` wins).
- `docs/instrumentacao-beta.md` = the five beta SQL queries (no UI, by decision; "AI reply" in SQL must equal `lib/mensagem.ts`).
- `docs/design-system/` = tokens, base layer and the reasoning. `docs/adr/` = one decision per file (the "why" behind every rule line; index in `docs/adr/README.md`). `docs/plano-*.md` = feature plans. System maps (owner's, outside git): `Desktop/arquitetura-crm/`.
- `.claude/rules/`: `engineering.md` (always) plus `data`, `realtime`, `ui`, `agent-ai`, `n8n`, `testing`, `billing`, `dashboard`, `onboarding` (loaded when matching files are read).
- Next 16 differs from your training data: read `node_modules/next/dist/docs/` first.

## How rules evolve
Every bug or architectural slip found becomes, in this order: (1) a rule line in the right `.claude/rules/` file (imperative, names the canonical file, ends with `(why: docs/adr/...)`); (2) an ADR in `docs/adr/` with context, decision, consequences and evidence (numbers and incidents preserved); (3) when possible, a lint rule or a test, because a rule nobody can check gets forgotten. Status and diary (test counts, dates, "what I did today") go to `docs/handoff.md`, never into rules or this file. Cross-cutting musts that must hold even for NEW files go in `engineering.md` (unscoped); scoped files only load when a matching file is read.
