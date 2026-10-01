# Auth e-mail link arrives in the implicit flow: /auth/concluir
- Date: 2026-09-25
- Status: Accepted
- Area: onboarding

## Context
Owner finding: the Supabase e-mail template sends the session after the `#` (`#access_token=...`), and the `#` never reaches the server. `/auth/confirm` fell to `/login?erro=convite` and the invitee saw a login instead of creating the password.

## Decision
Without `code` nor `token_hash`, `/auth/confirm` redirects to **`/auth/concluir`** (the `#` is inherited through the redirect). That page, in the browser, does `setSession`, erases the token from the address bar and continues to `next`. The login shows "Esse link expirou ou já foi usado" when it arrives with `?erro=convite`.

## Consequences
- The link is valid ONCE: opening it with the server down spends it.
- E-mail-free test: `auth.admin.generateLink` with the service key returns the same link.
