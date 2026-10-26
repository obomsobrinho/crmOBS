---
paths:
  - "app/montagem/**"
  - "app/(app)/agente/**"
  - "app/connect/**"
  - "app/cadastro/**"
  - "app/login/**"
  - "app/auth/**"
  - "app/definir-senha/**"
  - "app/recuperar-senha/**"
  - "app/page.tsx"
  - "components/agente/**"
  - "components/Agent*.tsx"
  - "components/Montagem*.tsx"
  - "components/AvisoMontagem.tsx"
  - "components/ConnectWhatsApp.tsx"
  - "components/AcoesConexao.tsx"
  - "components/ConnectionRiskNotice.tsx"
  - "lib/onboarding.ts"
  - "lib/evolution.ts"
  - "app/api/clients/**"
  - "app/api/signup/**"
---
# Onboarding: /montagem, /agente, connect, signup

## Two surfaces, one form
- Agent config has TWO surfaces over ONE form: `/montagem` (wizard, once per account) and `/agente` (3 tabs + advanced). Fields in `components/agente/campos.tsx`, layout in `components/agente/ui.tsx`, state and `PUT` in `components/agente/useAgentConfig.ts`. Never duplicate a field; the only allowed difference is `mostrarOpcionais`.  (why: docs/adr/2026-08-28-agent-two-surfaces-one-form.md)
- `/agente` tabs use `forceMount` AND `data-[state=inactive]:hidden` (`components/ui/tabs.tsx`). Never let Radix unmount an inactive panel (drafts in `AgentBulletList` would vanish while still being saved).  (why: docs/adr/2026-08-28-agent-two-surfaces-one-form.md)
- Advanced mode is a separate form, never a fourth tab. A `PUT` error returns `fields`; the screen jumps to the first tab with an error, only after a save attempt.  (why: docs/adr/2026-08-28-agent-two-surfaces-one-form.md)
- Agent config is owner-only in `/agente` and `/montagem` (page redirects the attendant, `PUT` answers 403); writes by service_role only.  (why: docs/adr/undated-agent-enabled-vs-published-at.md)
- Vocabulary: "Agente ativo" / "Desativado", never "pausado". `agent_published_at` is the first activation and is never cleared; `agent_enabled` is the switch (behavior in `agent-ai.md`).  (why: docs/adr/undated-agent-enabled-vs-published-at.md)

## Wizard
- Step order: quem atende, o que ele sabe, testar, conectar o WhatsApp, quem a IA chama (notices destination, review and "Ativar o agente"). Connecting never turns the agent on and never advances by itself: step 4 "Continuar" stays disabled until the connection is seen on screen (`razao-continuar`), and step 5 is reached only connected (a draft resuming at 5 opens at 4). "Ativar o agente" stays disabled until a destination is saved (`razao-avisos`).  (why: docs/adr/2026-09-24-montagem-order-inverted-connect-last.md, docs/adr/2026-10-23-montagem-clear-from-start-to-end.md)
- Step 3 hosts the bench inside the step; the page does not scroll (`h-dvh`). Step 4 button says "Gerar QR code", never "Conectar WhatsApp". Exit buttons say what is deferred ("Terminar depois", "Testar depois", "Conectar depois", "Ativar depois"). Do not generate the QR on opening the step (would create the Evolution instance; owner decision pending).  (why: docs/adr/2026-09-26-montagem-wizard-round.md)
- Onboarding state lives only in `lib/onboarding.ts` (pure): `PASSOS_MONTAGEM`, `montagemState()`, `publishBlockers()`. `getMyClient()` exposes `montagem` as scalars only. No ad hoc onboarding checks in pages.  (why: docs/adr/2026-08-28-wizard-draft-guards-and-state.md)
- `/montagem` has four guards: blocked account to `/assinatura`, attendant to `/inbox`, already published to `/agente`, `prompt_mode = 'avancado'` to `/agente`. The wizard loads with `ssr: false` (`components/MontagemCliente.tsx`); browser draft `components/agente/rascunho.ts`, key `montagem:{clientId}`; the server wins if `agent_config_updated_at` is newer; the wizard writes to the server ONCE, leaving step 2.  (why: docs/adr/2026-08-28-wizard-draft-guards-and-state.md)
- Nobody reaches step 4 without knowing it needs a computer: the opening (`MontagemAbertura`, only before starting, no counter, no estimated time) maps the five steps, one icon and label color each (`PASSOS_MONTAGEM[].resumo`) and says `AVISO_COMPUTADOR`; `/cadastro` has the tip line. On mobile, step 4 is the "Continue no computador" stop (`MontagemParada`, link with copy and `navigator.share`, "Mostrar o QR aqui" still reveals the QR); the mobile notice of `ConnectWhatsApp` stays only on `/connect`.  (why: docs/adr/2026-10-23-montagem-clear-from-start-to-end.md)
- Step 1 holds the business hours (`CampoHorario` in a `Destaque`). The ready-made hours are a suggestion (`hoursConfirmed: false` in `EMPTY_CONFIG`) until "Este é o nosso horário" or any edit; never save the default as if chosen. The notices destination lives ONLY in step 5, after connecting (number, group and test need the WhatsApp); never ask for it before. The first activation refuses a number destination equal to the agent own number (`PUT publish`).  (why: docs/adr/2026-10-23-montagem-clear-from-start-to-end.md)
- Before activating, step 5 shows the review (four rows; the notices are the step itself) (`MontagemRevisao`; states from `revisaoAntesDeAtivar`, copy in `ITENS_DA_REVISAO`, both in `lib/onboarding.ts`): it never blocks (only `publishBlockers` does). Rules, message and hours open a sheet with the `/agente` blocks (`BlocoLimites`, `CampoHorario`), never new fields; closing the sheet saves. What makes a difference is a `Destaque` (`components/agente/ui.tsx`) where it already exists (model and hours in step 1, documents in step 2, notices in step 5).  (why: docs/adr/2026-10-23-montagem-clear-from-start-to-end.md)
- `OnboardingBar` does not exist. The only banner is `components/AvisoMontagem.tsx` (one line, owner only, until the agent is live). One progress counter, inside the wizard.  (why: docs/adr/2026-08-28-wizard-draft-guards-and-state.md)
- Landing depends on role AND setup (`app/page.tsx`): unpublished owner to `/montagem`, published owner to `/painel`, attendant to `/inbox`.  (why: docs/adr/2026-08-26-beta-mvp-scope-and-menu.md)

## Activation
- `publishBlockers()` = connect, configure, `hasNotify`. Never re-add `tested` as a blocker; `onboarding_tested_at` is written by `/api/playground` as data only.  (why: docs/adr/2026-08-28-publish-blockers-drop-tested.md)
- First activation requires a SAVED notices destination. `components/agente/AvisosCampo.tsx` saves by itself ("Salvar destino"), outside the form Salvar; never fold it into the form save. Disabled reason id `razao-avisos`.  (why: docs/adr/2026-09-29-notify-destination-required-first-activation.md)
- `PUT /api/clients/[id]/publish` (`{ enabled }`, owner-only): on FIRST activation it queries `connectionState` and answers 409 if clearly not `open`; if Evolution does not answer it does NOT block. Prerequisites apply only on first activation.  (why: docs/adr/2026-09-24-first-activation-requires-real-connection.md)

## Connect
- `ConnectWhatsApp` is ONE component with two frames (`enquadramento` `pagina`/`passo`, `onConectado`); never duplicate QR, pairing code or polling.  (why: docs/adr/2026-09-24-connect-by-pairing-code-and-risk-notice.md)
- The pairing code is OFF (`PAREAMENTO_LIGADO`, `components/ConnectWhatsApp.tsx`): WhatsApp rejects the Evolution 2.3.7 code; QR only, and on mobile a notice says to open the page on a computer. Turn it back on only after a real number connects by code.  (why: docs/adr/2026-10-17-pairing-code-off-qr-only.md)
- `POST connect-whatsapp` with `{ number }` returns `pairingCode`. An `open` instance is dropped ONLY by the explicit owner action (`POST disconnect-whatsapp`, below); `connect-whatsapp` itself returns `connected` for it. An instance stuck in `connecting` gets `logout` first.  (why: docs/adr/2026-09-24-connect-by-pairing-code-and-risk-notice.md)
- Disconnect and switch number: `POST /api/clients/[id]/disconnect-whatsapp` (`sessaoDaRota`, owner only, blocked 402) does `logout` on the SAME instance and sets `agent_enabled = false` (`agent_published_at` stays). Never delete the instance (`evolution_instance` is how n8n finds the tenant); history stays. UI is `AcoesConexao` behind `ConfirmModal`, in `/connect` and `ConexaoCampo` on `/agente`; the QR flow stays only in `ConnectWhatsApp`. After a switch the screen reminds to check `notify_group_jid`. Tests mock nothing and never touch Evolution: `estadoForcado`/`preview` in `/design`.  (why: docs/adr/2026-10-03-disconnect-and-switch-whatsapp-number.md)
- Risk notice (`components/ConnectionRiskNotice.tsx`): never promise protection against blocking, never "não pague a API da Meta" (an e2e enforces it). Keep it short: dedicated number and block risk, the rest behind "Saiba mais".  (why: docs/adr/2026-09-24-connect-by-pairing-code-and-risk-notice.md)
- `/connect` never imports history; new instances are created with `syncFullHistory: false` (`lib/evolution.ts`). Do not recreate an import route.  (why: docs/adr/2026-09-23-connect-does-not-import-history.md)

## Signup and auth
- `/cadastro` never asks for a password: `POST /api/signup` + `auth.admin.inviteUserByEmail`, tenant via `provision_tenant` (security definer, idempotent, one transaction); if it fails after the user exists the route DELETES the user. Brake in `signup_attempts` (5/h, 20/day per IP, failures count). Signup and invite need SMTP configured in Supabase.  (why: docs/adr/undated-signup-without-password-and-provision-tenant.md)
- Production domain must be in Supabase Auth Redirect URLs and as Site URL; check with `auth.admin.generateLink` without sending e-mail.  (why: docs/adr/2026-09-27-supabase-auth-redirect-urls.md)
- `/auth/confirm` without `code`/`token_hash` redirects to `/auth/concluir` (implicit flow, token after `#`). The link is single-use: opening it while the server is down burns it.  (why: docs/adr/2026-09-25-auth-email-link-implicit-flow.md)
- Signup and team invite depend on Supabase SMTP AND the "Invite user" email template being configured, plus the production domain in Auth Redirect URLs.
