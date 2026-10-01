# n8n workflows are versioned in n8n/ with the secret replaced by a placeholder
- Date: 2026-09-17
- Status: Accepted
- Area: n8n

## Context
n8n is production. The two workflows are versioned in `n8n/` (`obs-atendimento.json`, 50 nodes, and `crm-envio-manual.json`, 11 nodes; exported 17/09/2026, read-only). `n8n/README.md` says how to restore. (A third file, `crm-envio-ia.json`, exists later for the "CRM Envio IA" flow.)

## Decision
`x-lookup-secret` is in plain text in TWO nodes of OBS Atendimento (`Atendente` and `Sobe mídia recebida`). On export both become the marker `{{N8N_LOOKUP_SECRET}}`. Re-exporting without that swap commits the secret. The skill `exportar-n8n` does the export safely.

## Consequences
Never paste the secret value in the repo or in chat. Also protect the Evolution apikey on export.
