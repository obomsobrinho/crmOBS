# feedback is write-only from the browser, with no read screen
- Date: 2026-08-28
- Status: Accepted
- Area: product

## Context
Beta reports table `feedback` (`mt_feedback`). One person attends ten companies.

## Decision
The only own-table the browser only WRITES. Columns: `client_id`, `user_id` (default `auth.uid()`), `message`, `path` (route where the person was, half of the value of the report), `user_agent`.
- ⚠️ No SELECT policy AND no SELECT grant for `authenticated`: not even the author rereads it from the browser. The owner reads by SQL (`docs/instrumentacao-beta.md`).
- No read screen on purpose: an internal page for one reader and ten rows is one more surface to maintain.
- UI is an item in the avatar menu (`components/NavRail.tsx` -> `components/FeedbackDialog.tsx`), never a floating button.
- The confirmation does not promise an answer ("Recebido, obrigado.").

## Consequences
- ⚠️ Nobody is notified when a report arrives. Assumed limitation: notifying would require touching n8n, which is production.
