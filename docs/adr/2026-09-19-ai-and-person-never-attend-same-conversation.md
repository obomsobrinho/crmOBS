# AI and a person never attend the same conversation, enforced in the database
- Date: 2026-09-19
- Status: Accepted
- Area: agent-ai

## Context
"A human took over" was already the display rule (`quemAtende`, `lib/crm.ts`) and already held in manual send. What was missing was the ASSIGN gesture, so a conversation could be assigned to a person and still have the AI on.

## Decision
- Assigning pauses the AI (also when transferring to a colleague: same gesture, the conversation now belongs to a person).
- Turning the AI back on drops the assignee, on all THREE paths that give the conversation back to the AI: the header switch, orienting the AI through the coach (which reactivates), and `POST /api/conversations/resolve`, which now clears `assigned_user_id` together with `handoff_at`.
- ⚠️ RELEASING the conversation does NOT turn the AI back on, on purpose: "nobody attends" is a legitimate state and the list already shows it as visible debt.
- The writer is the browser (`components/ConversationView.tsx`, column grants that already existed); no new route was needed.

## Consequences
- ⚠️ Leaving any of the three paths out restores the contradictory state through the back door; the coach is the one nobody remembers reactivates.
