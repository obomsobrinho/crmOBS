# The owner can disconnect the WhatsApp and switch to another number
- Date: 2026-10-03
- Status: Accepted
- Area: onboarding, WhatsApp

## Context
Until 2026-10-03 the rule was "an `open` instance is NEVER dropped" (docs/adr/2026-09-24-connect-by-pairing-code-and-risk-notice.md) and no screen could disconnect. A tenant that changed phone number, or whose number was restricted by WhatsApp (the test number was, on 2026-10-03), was stuck: `/connect` redirected an open instance to the inbox, and creating another account made no sense (the history belongs to the tenant).

## Decision
- Only an EXPLICIT action by the owner drops an open instance. The route `POST /api/clients/[id]/disconnect-whatsapp` uses `sessaoDaRota` with `dono`, `ativa` (blocked account answers 402) and `revalidar`. Owner decision of 2026-10-03: owner only, never the attendant (403).
- The route calls `logout` on the Evolution instance (skipped when it is already `close`) and sets `agent_enabled = false`. `agent_published_at` is never cleared. The agent stays "Desativado" until the owner turns it on again after the new connection.
- The instance is NOT deleted and recreated: `clients.evolution_instance` stays stable (n8n resolves the tenant by it), and Evolution keeps instance and webhook after `logout`. Switching number = logout, then the same connect flow as a first connection (QR or pairing code) on the SAME instance. `connect-whatsapp` now calls `setWebhook` (`lib/evolution.ts`, `POST /webhook/set/{instance}`) on the reconnect branch, with `N8N_BOT_WEBHOOK_URL`, best effort, so an old instance does not keep a stale URL. Context7 was unreachable in this session: the endpoint shape comes from the Evolution v2 docs as already used in `createInstance`; confirm with a real switch by the owner (never from a test).
- Conversations and contacts stay visible as history (owner decision): they belong to the tenant, not to the number.
- UI: `components/AcoesConexao.tsx` (buttons "Trocar número" and "Desconectar", each behind `ConfirmModal` that states the consequence) is used by `/connect` (new `conectado` phase when the screen opens with the instance already open, instead of redirecting) and by the Agent screen (`components/agente/ConexaoCampo.tsx`, status read in the browser). The QR and the pairing code stay ONLY in `ConnectWhatsApp`; "Trocar número" hands control back to it. `WhatsAppBanner` still links to `/connect`.
- After a switch the screen tells the owner to check the notices destination (`clients.notify_group_jid`): it cannot be the agent's own number (`notify-target` already refuses it when the number is known) and a group of the old number may not exist on the new one.

## Consequences
- The attendant sees no action and the route refuses.
- Tests never call Evolution: `/design/conexao` and `/design/agente` run with `estadoForcado` and `preview`; the route is covered by the 401 without session and by `sessaoDaRota`. The real switch has not been exercised against Evolution.
- The new number is not checked against `notify_group_jid` at connect time (QR gives no number up front); only the reminder and the existing `notify-target` check protect it.
