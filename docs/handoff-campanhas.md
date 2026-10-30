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
   at most); the plan's "keyset" wording conflicts with jumping to page 7. Kept offset, on purpose.
