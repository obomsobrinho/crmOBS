# notify_group_jid is the single destination of all WhatsApp notices
- Date: 2026-09-29
- Status: Accepted
- Area: agent-ai

## Context
Plan in `docs/plano-avisos.md`. The column `clients.notify_group_jid` kept its name because n8n reads it, but its meaning changed. Notices exist so that people who do not live on the screen learn about help requests.

## Decision
`notify_group_jid` is the ONE destination of every notice: a help request (sent by the app), a booked meeting and "the AI did not answer" (both sent by n8n).
- It holds either a GROUP (`...@g.us`, chosen from a list that comes from WhatsApp, never typed) or a NUMBER (`<digits>@s.whatsapp.net`, country code 55 added automatically).
- Never the agent's own number: the `notify-target` route answers 400 after checking the Evolution `ownerJid`.
- The rules live in `lib/avisos.ts` (pure module).

## Consequences
- The column name is a historical lie; do not rename it without changing n8n.
- Each notice type has exactly one sender; sending the same notice from two places produces a double notice (see `2026-09-29-whatsapp-notices-from-processturn.md` and `2026-09-30-schedule-does-not-open-help-request.md`).
- First activation requires a saved destination (see `2026-09-29-notify-destination-required-first-activation.md`).
