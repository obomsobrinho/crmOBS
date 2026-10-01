# n8n is production: never change live without explicit confirmation
- Date: undated
- Status: Accepted
- Area: n8n

## Context
The n8n workflows are production attendance. Bad edits have stopped all attendance (Redis `keyType` incident, ~3 min; error-output gaps losing messages; a domain change muting the channel).

## Decision
- NEVER modify or activate live n8n workflows without explicit user confirmation.
- Use `validateOnly` before applying.
- On export, replace `x-lookup-secret` by `{{N8N_LOOKUP_SECRET}}` (see `2026-09-17-n8n-workflows-versioned-secret-placeholder.md`).
- Deploy order when app and n8n change together: APP before n8n.

## Consequences
See the incidents in `2026-10-01-n8n-sliding-wait-debounce.md`, `2026-09-30-n8n-audio-broken-error-outputs.md` and `2026-09-17-domain-change-silent-outage.md`.
