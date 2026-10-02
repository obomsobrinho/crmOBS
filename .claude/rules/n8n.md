---
paths:
  - "n8n/**"
  - "app/api/agent/**"
  - "app/api/inbound-media/**"
  - "app/api/send/**"
  - "lib/evolution.ts"
---
# n8n (PRODUCTION)

- NEVER modify or activate n8n workflows live without explicit user confirmation. Use `validateOnly` before applying.  (why: docs/adr/undated-n8n-live-changes-need-explicit-confirmation.md)
- Workflows are versioned in `n8n/` (`obs-atendimento.json`, `crm-envio-manual.json`, `crm-envio-ia.json`); `n8n/README.md` explains restore. `x-lookup-secret` is plain text in TWO nodes (`Atendente`, `Sobe mídia recebida`); on export it MUST become `{{N8N_LOOKUP_SECRET}}`. Use the `exportar-n8n` skill before committing any n8n change. Never paste secret values in repo or chat.  (why: docs/adr/2026-09-17-n8n-workflows-versioned-secret-placeholder.md)
- The three n8n webhook paths are SECRET UUIDs (like a password) and the two app-called flows (`Webhook CRM`, `Webhook IA`) require header auth `x-webhook-secret` (credential "CRM webhook secret"). The app sends it through `headersN8n` (`lib/n8n.ts`) from `N8N_WEBHOOK_SECRET`. On export, `parameters.path` and `webhookId` become `{{N8N_WEBHOOK_PATH_*}}` / `{{N8N_WEBHOOK_ID_*}}`; real values live only in env/Vercel/the n8n credential, never in repo or chat. `npm run checar` fails otherwise.  (why: docs/adr/2026-10-02-n8n-webhooks-secret-path-and-header-auth.md)
- The brain is `POST /api/agent` (header `x-lookup-secret`, env only; 501 without `OPENAI_API_KEY`). n8n is only the pipe: no business logic in n8n.  (why: docs/adr/2026-09-17-ai-brain-in-api-agent-n8n-is-the-pipe.md)
- Deploy order when app and n8n change together: APP before n8n.  (why: docs/adr/2026-09-30-n8n-one-row-per-received-message.md)
- Changing the app domain requires editing n8n: `Atendente` and `Sobe mídia recebida` call the app URL. `git grep` the old domain to find every place.  (why: docs/adr/2026-09-17-domain-change-silent-outage.md)
- Channel guards must stay: `Rotas` refuses `@g.us`; `Dedupe (Redis)` (TTL 300s) where an EMPTY `messageId` PASSES (OR condition, never "fix" it); the error output of `Atendente` goes to `Salva user (IA falhou)` + `Fallback ao cliente` + `Avisa falha no grupo`, so a customer message is never lost.  (why: docs/adr/2026-09-17-n8n-channel-hardening.md)
- Media nodes (`Audio → Binary`, `Whisper`, `Image → Binary`, `Vision`) keep error outputs that let the message continue to the AI with a bracketed notice. `Audio base64` / `Image base64` re-read from `Dados` because `Sobe mídia recebida` replaces the item. Video and document must have an exit in `Tipo de mensagem`.  (why: docs/adr/2026-09-30-n8n-audio-broken-error-outputs.md)
- One `chat_messages` row per received message (`Salva recebida`, with `Dados.recebidoEm`); `Salva chat_messages` writes only the reply row.  (why: docs/adr/2026-09-30-n8n-one-row-per-received-message.md)
- Debounce is a sliding wait (`Marca chegada`, `Marca pronto`, `Marca última`, `Ainda chegando?`, `Espera 4s`, cap 8 loops); `Lock counter` TTL 120s; mark nodes are `continueRegularOutput`. Redis `set` needs explicit `keyType: "string"` (the automatic one stopped all attendance for ~3 min).  (why: docs/adr/2026-10-01-n8n-sliding-wait-debounce.md)
- `Evolution send` is `continueRegularOutput`: one failing send must not stop the rest (second message part, "Conversa marcada").  (why: docs/adr/2026-10-01-n8n-send-failure-continues.md)
- `Pausa IA (handoff)` and `Pausa IA (agendado)` stay DISABLED (`disableNode` = pass-through; `Notifica grupo` still runs). `Pausar IA (Franck digitou)` stays active (human took over). `enableNode` on the two brings back "AI muted forever".  (why: docs/adr/2026-08-20-handoff-no-pause-n8n-pause-nodes-disabled.md)
- The CRM does not talk to Evolution day to day (only onboarding: create instance, QR). It reads Supabase with the user session and sends manual messages through an n8n webhook. n8n writes conversation tables with service_role.  (why: docs/adr/undated-crm-reads-only-n8n-writes-conversations.md)
