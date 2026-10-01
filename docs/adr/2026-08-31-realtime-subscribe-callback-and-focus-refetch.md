# Realtime drops silently: subscribe with callback, refetch on reconnect and on focus
- Date: 2026-08-31
- Status: Accepted (extended by 2026-10-01-production-loading-and-realtime-rules.md)
- Area: realtime

## Context
Symptom: an unread badge of 4 stayed lit while the database was already at zero. The server counter was right all along (trigger `sync_conversation` only increments with a non-null `user_message` and a type other than `imported`, so replying never raises the number). What was missing: the list never noticed the WebSocket had died.

## Decision
Two rules for ANY screen that subscribes to realtime:
1. `.subscribe()` never without a callback. `CHANNEL_ERROR` and `TIMED_OUT` used to pass in silence. `SUBSCRIBED` arrives again on every automatic resubscription, and that is when to refetch, because nobody received events between the drop and the return. The FIRST subscription is skipped on purpose: the data just came from the server, and refetching would waste three queries on every inbox open.
2. Refetch when focus returns (`visibilitychange` + `focus`). This covers a socket killed by the OS while the machine slept, whose detection is slow.

Also: a table listened to by realtime must be in the `supabase_realtime` publication, otherwise the handler is dead and silent. `conversation_qualifications` was listened to by `ContactSidebar` and was NOT in the publication (migration `mt_realtime_conversation_qualifications` fixed it). Its `REPLICA IDENTITY` stays default (PK), not `FULL` like the other three, because the table is append-only and only INSERT matters. If an update or delete ever exists, it needs `FULL`, otherwise realtime RLS cannot evaluate the old row and the event is dropped.

## Consequences
- There is an e2e that fails if the initial load starts refetching (the skipped first subscription).
- A test that asserts ABSENCE of something counts requests, not pixels. The old e2e for "mark as read" only checked that a PATCH with status < 400 went out: it navigated by URL, never clicked the list and never looked at the badge, so it caught none of this.
- Tests that assert "this must NOT happen" cannot coexist with a concurrent writer; they live in `*.serial.spec.ts` (see testing rules).

## Evidence
Source of the diagnosis: badge showing 4 with DB at 0, 31/08/2026.
