# Handoff: Campanhas v2 backend (overnight run, 29 to 30/10/2026)

Branch `claude/campanhas-plano-1c34fe` (worktree `.claude/worktrees/campanhas-plano-1c34fe`). Written by the
Cursor agent while the owner sleeps. Never merged, never pushed to `main`.

## What I understood (read before phase 0)

- Campanhas is the product owner's own prospecting tool (only `ADMIN_USER_IDS`), never a tenant feature.
  Two sections: Leads (a base built by searches at Apify, deduplicated by phone, marked good or
  discarded) and Campanhas (a 4 step wizard: Campanha, Contatos, Mensagem, Confirmar; one fixed message
  per lead with 1 to 3 rotating variants; at most 10 a day, 8h to 18h, random 4 to 12 min pause; detail
  with Pausar/Retomar and "Nova campanha com quem não respondeu").
- The layout is approved and lives in `components/admin/campanhas/*`, fed today by fake data in memory
  (`/design/campanhas`). My job: make it real WITHOUT changing what it looks like. The rules already live
  in `lib/prospeccao.ts` (pure); routes, cron and SQL must use or mirror them.
- Data: six new tables (`prospeccao_*`), RLS on, service role only; every admin write is one SQL
  function with its `admin_acoes` row; dashboards are SQL aggregates (never rows in the browser);
  `prospeccao_campanhas` goes into `TABELAS_DO_CLIENTE`.
- Sending: `GET /api/prospeccao/cron` every 5 min from Supabase `pg_cron` + `pg_net` (Vercel Hobby), with
  the `CRON_SECRET` bearer read from Vault; one message per due campaign per run through
  `enviarMensagemAtiva`; reply and opt-out detection by reading `chat_messages` (read only).
- Source: Apify actor `compass/crawler-google-places`, async with a webhook to `/api/prospeccao/apify`
  (`APIFY_WEBHOOK_SECRET`), polling fallback in the cron. No Apify account yet: build against the
  documented schema and mark the mapping "to confirm with a real run".
- Tonight: additive DDL is released (new tables, indexes, functions, the pg_cron job). Nothing existing is
  altered. No real WhatsApp message, no n8n, no push to `main`.

## Open questions (for the owner; none blocks tonight)

1. **Which numbers can send.** The wizard lists "Número que envia". I restrict it to the companies the
   admin user is a member of (`user_clients`) that have a WhatsApp instance, so a prospect message can
   never leave a customer's number by mistake. OBS qualifies. Tell me if you want a wider list.
2. **n8n and the first message.** In the n8n export in the repo (`n8n/obs-atendimento.json`), every
   outgoing message (`fromMe`) goes to "Pausar IA (Franck digitou)" and to the AI history. For a NEW
   lead there is no `dados_cliente` row yet, so nothing is paused and the AI gets the message as context.
   For a phone that already talks to OBS (your own phone in the rehearsal!), the send would pause the AI
   of that conversation. Whether Evolution emits `fromMe` for API sends depends on its webhook events,
   which I did not touch. Check it in the rehearsal (section "Para o Franck amanhã").
3. **Numbered pages.** The approved layout has numbered pages ("Mostrando 11 a 20 de 137"), which need
   an offset. The SQL pages by offset over an index-ordered query (owner-only tables, a few thousand rows
   at most); the    plan's "keyset" wording conflicts with jumping to page 7. Kept offset, on purpose.

## Log

### Phase 0 (done)
- Merged `origin/main` (47 commits: agenda, `lib/envio-ativo.ts`, central updates). Two conflicts, both
  kept both sides: the lucide import of `components/admin/ListaCentral.tsx` and the ADR index rows.
  Types, lint (10 old warnings, none in Campanhas) and `checar` green.
- D1 to D9 recorded in plan section 12 and in `lib/prospeccao.ts`: `JANELA` Monday to Saturday,
  `LINHA_DE_SAIDA` appended by `textoParaLead`, `AMOSTRA_MINIMA` 30, `PARADAS_PARA_PAUSAR` 2,
  `MESES_DE_RETENCAO` 12.

### Phase 1 (done, APPLIED to production as additive DDL)
- `supabase/migrations/20261030034211_prospeccao_do_dono.sql` (the applied version). Six tables, RLS on,
  no policy, service role only. Admin writes, one SQL function each with its `admin_acoes` row:
  `prospeccao_criar_busca`, `prospeccao_marcar_lead`, `prospeccao_salvar_campanha` (draft autosave),
  `prospeccao_iniciar_campanha`, `prospeccao_pausar_campanha`, `prospeccao_retomar_campanha`. System
  (webhook and cron): `prospeccao_concluir_busca`, `prospeccao_ativar_agendadas`,
  `prospeccao_reivindicar_envio` (reserves the campaign turn and claims ONE lead), `prospeccao_registrar_envio`,
  `prospeccao_em_observacao`, `prospeccao_registrar_respostas` (with the D6 pause),
  `prospeccao_apagar_antigos` (D8). Reads: pages and counts for searches, leads and campaigns,
  `prospeccao_resumo_da_base` and `prospeccao_resultados` (long format, folded in the app by the same
  shapes as the pure twins), `prospeccao_leads_do_filtro` (the eligibility, shared by the wizard count and
  the start).
- Decisions I took: lead and campaign ids are generated in the app (the search id goes into the Apify
  webhook before the row exists, so the route makes ONE write); a lead keeps the phone as the source gave
  it (`telefone_original`, shown with the Fixo/Inválido badge) and the dedupe key only for a valid mobile
  (`telefone`), plus a dedupe by place id for leads without mobile; `tentado_em` keeps a failed attempt in
  the results window while `enviado_em` stays the twin of `enviadoEm`.
- Tested inside a rolled back transaction with fake data (dedupe, idempotent completion, filters, start,
  claim race, failure, auto conclusion, opt-out, results, pages, base summary, LGPD purge): all as
  expected. Security advisors: only the expected "RLS on, no policy" info for the new tables.
- `lib/database.types.ts` regenerated (only additions); `prospeccao_campanhas` added to
  `TABELAS_DO_CLIENTE` (`lib/admin-purga.ts`).

### Phase 2 (in progress, Cursor 30/10/2026 ~01h)
- Added `lib/fonte-de-leads.ts`, `lib/fonte-apify.ts` (actor `compass/crawler-google-places`; star/website
  enum mapping marked TODO until a real run).
- Added `lib/campanhas-servidor.ts` (RPC helpers, row mappers, conexões do admin).
- Routes: `GET/POST /api/admin/campanhas/buscas`, `POST /api/prospeccao/apify` (query `busca` + secret `s`),
  `GET /api/prospeccao/cron` + `lib/prospeccao-cron.ts` (send claim, reply scan, Apify poll fallback).
- `REGRAS_DA_PROSPECCAO` in `lib/envio-ativo.ts`.
- Draft migration `20261030043000_prospeccao_cron_job.sql` (schedules only when Vault secrets exist).
- **Not applied yet:** pg_cron migration (needs Vault secrets first).
- **Still missing for phase 2 close:** env var names documented in `data.md`, real-run field check.

### Phases 3–7 (not started)
- Live `/campanhas` page, `lib/campanhas-fonte.ts`, remaining admin routes (leads, campaigns CRUD,
  resultados/resumo), wire `CentralDeCampanhas` to API, unit + e2e tests, self-review.

## Para o Franck amanhã
1. **Vault (Supabase):** create `prospeccao_cron_url` and `prospeccao_cron_bearer`, then apply migration
   `20261030043000_prospeccao_cron_job.sql` (or tell Cursor to apply).
2. **Vercel env:** `APIFY_TOKEN`, `APIFY_WEBHOOK_SECRET`, `CRON_SECRET` (same as agenda lembretes if shared).
3. **Apify account:** create, add token, run one search of 5 places and confirm star/website field values.
4. **Local webhook:** Apify must reach your URL; overnight dev only works if tunnel/production URL is set.
5. **UI:** backend for lists exists for buscas only; the screen still uses `/design/campanhas` fake data until
   phase 3 lands.
6. **Rehearsal:** your phone as sole lead, after UI + env are ready (not done tonight).
