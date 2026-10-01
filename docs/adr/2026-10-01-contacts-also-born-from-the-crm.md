# Contacts can be created from the CRM ("Novo cliente")
- Date: 2026-10-01
- Status: Accepted
- Area: inbox

## Context
Contacts used to be created only by n8n when a message arrived.

## Decision
`POST /api/contacts` (service_role; the browser still has no INSERT).
- The stored phone is the JID that Evolution returns (`/chat/whatsappNumbers`), NEVER the typed spelling: n8n finds the lead by the exact `remoteJid` and old numbers arrive without the ninth digit.
- An EMPTY `conversations` row is created alongside (tags and notes). It stays out of Conversas and Pipeline until the first message (`buildInbox`).
- The first message to someone who never wrote requires an acceptance (also checked in `/api/send`, 409) and PAUSES the AI like any manual send (owner decision, 2026-10-01).

## Consequences
- Any list over conversations must tolerate and hide empty conversations until the first message.
