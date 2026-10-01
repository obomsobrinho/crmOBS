# The CRM reads conversation data; n8n and service_role routes write it
- Date: undated
- Status: Accepted
- Area: n8n

## Context
The CRM sits on top of an existing n8n + Evolution API + Supabase stack.

## Decision
- Evolution API = WhatsApp connection (one instance per tenant).
- n8n = the pipe: receives the Evolution webhook, calls the agent and writes to Supabase with `service_role`. The CRM does NOT talk to Evolution day to day (only at onboarding, to create the instance and show the QR).
- CRM (Next.js) = interface. It READS Supabase with the USER SESSION (RLS per tenant) and, to send manually, fires an n8n webhook. It never writes directly to the conversation tables.

## Consequences
- Conversation tables are written only by n8n or `service_role` routes, except the browser column grants listed in `2026-08-22-conversations-column-grants.md`.
- See also `2026-09-17-ai-brain-in-api-agent-n8n-is-the-pipe.md`.
