# Production domain must be in Supabase Auth Redirect URLs and Site URL
- Date: 2026-09-27
- Status: Accepted
- Area: onboarding

## Context
Owner finding: the e-mail link only returns to `redirectTo` if it is in the "Redirect URLs" list. Otherwise Supabase sends to "Site URL", which was `http://localhost:3000`, so production signup landed on localhost.

## Decision
The production domain (`https://atendimento.obomsobrinho.com.br/**`) must be in the Redirect URLs list AND be the Site URL.

## Consequences
- Verify without sending e-mail: `auth.admin.generateLink` with the production `redirectTo`, then check where the `action_link` redirects.
- A domain change (see the n8n domain incident) also means revisiting this list.
