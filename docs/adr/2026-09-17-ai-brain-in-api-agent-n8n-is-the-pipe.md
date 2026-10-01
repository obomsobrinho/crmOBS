# The agent brain runs in POST /api/agent; n8n is only the pipe
- Date: 2026-09-17
- Status: Accepted (cutover applied and active)
- Area: n8n

## Context
The agent brain used to live inside n8n.

## Decision
The brain left n8n and runs in `POST /api/agent` (stateless; persona + history from `chat_messages` + AGORA + RAG retrieval + guardrail; output `{ output: { messages, action, summary, preferencia_horario }, diagnostics }`). The `Atendente` node of the active workflow "OBS Atendimento" is an HTTP Request (POST) to `https://atendimento.obomsobrinho.com.br/api/agent` with header `x-lookup-secret` (value only in env, never in code or chat). It depends on `OPENAI_API_KEY` in the app environment (Vercel); without it the route answers 501. Model: `gpt-5.4-mini`.

Other n8n facts that still hold:
- Bot "OBS Atendimento" resolves the tenant by the payload `instance` (node `Resolve tenant` to Supabase), stamps `client_id`, memory isolated by `client_id:telefone`.
- Date/time: the `### AGORA` block (America/Sao_Paulo, pt-BR) gives the agent the current date; `buildPersona` references that "seção AGORA" (never say again that the agent does not know the date).
- "CRM Envio Manual": manual send from the CRM, routed by `instance`/`client_id`.

## Consequences
Business logic changes happen in the app, not in n8n.
