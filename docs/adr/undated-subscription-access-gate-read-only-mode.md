# Subscription access gate: pure rule, read-only mode, 4 server-side enforcement points
- Date: undated (Phase 4, subscription)
- Status: Accepted
- Area: billing

## Context
Phase 4 (subscription). The access rule must be identical on server and browser, and a blocked
account must not lose visibility of its conversations.

## Decision
- The access rule lives in `lib/billing.ts`, a **pure module** (zero imports, like `lib/agent-prompt.ts`),
  so server and browser use the SAME function:
  `accessState({subscription_status, trial_ends_at, grace_until})` returns
  `{blocked, reason, trialDaysLeft, warn, message}`. `getMyClient()` already returns `access`
  (the columns come in the same select).
- **A blocked account enters READ-ONLY MODE** (product owner decision), it is not expelled: messages keep
  arriving and the account follows the conversations, like an open WhatsApp Web, but cannot work.
- **Server-side gate at 4 points. Never just hide a button on the client:**
  1. `requireActiveTenant()` (`lib/auth.ts`) redirects to `/assinatura` on the paid pages
     (`/pipeline`, `/painel`, `/agente`, `/conhecimento`, `/equipe`). It sits in EACH page, not in the
     layout, because a Server Component layout does not know the current route. `/inbox`, `/perfil`
     and `/assinatura` stay open (`/assinatura` is outside the `(app)` route group).
  2. `processTurn` returns a **silent turn** (`silentTurn`: 200, empty `messages`,
     `diagnostics.subscriptionBlocked`) **before** the model and RAG, so the AI goes quiet, spends no
     token, and n8n **keeps saving** the customer message instead of erroring.
  3. `POST /api/send` returns **402**.
  4. UI: the `readOnly` prop removes the text box from `MessageComposer` and locks the AI switch (the
     `toggleIa` of `ConversationView` also guards, because the callback is shared with the side panel).
- **Blocks:** expired trial, `past_due` outside the grace period, `canceled`.
  **Deliberately does NOT block:** unknown status (the DB CHECK already guarantees the set, and
  locking out someone who pays is worse) and `trialing` without `trial_ends_at`.
- `signup_attempts` (abuse brake of the public signup): RLS on with no policy + `revoke`, service_role only.
- Subscription columns are written **only by service_role** (gateway webhook).

## Consequences
Any new paid page must call `requireActiveTenant()` itself. Any new write path for a tenant must honor
the blocked state server-side.
