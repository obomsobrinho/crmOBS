# Domain change silently took the channel down
- Date: 2026-09-17
- Status: Accepted
- Area: n8n

## Context
`crm-obs.vercel.app` started answering 404 ("deployment could not be found"), and BOTH nodes that call the app (`Atendente` and `Sobe mídia recebida`) pointed there. The agent went mute and messages from the period were not recorded.

## Decision
Both nodes now point to `https://atendimento.obomsobrinho.com.br`.

## Consequences
Changing the domain requires touching n8n. `git grep` for the old domain finds all the places (the Supabase e-mail logo was also on it).
