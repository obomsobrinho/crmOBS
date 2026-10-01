# Self-service signup: no password field, provision_tenant, abuse brake
- Date: undated (Fase 4, before 2026-09-27)
- Status: Accepted
- Area: onboarding

## Context
Public `/cadastro` creates accounts. Passwords must never pass through our server, and no account may be left half created.

## Decision
- `/cadastro` (public) sends `{companyName, email}` to `POST /api/signup` (`app/api/signup/route.ts`). The form does NOT ask for a password on purpose.
- The route uses `auth.admin.inviteUserByEmail` (same proven path as the team invite). The person opens the link, lands on `/auth/confirm`, picks the password in `/definir-senha`, then goes to `/connect`. E-mail confirmation is mandatory by construction.
- The tenant is created by `public.provision_tenant(user_id, company_name, trial_ends_at)` (**security definer**, only service_role executes): `clients` + `user_clients` (role dono) + initial funnel in ONE transaction, **idempotent** by `user_id`.
- If it fails after the user was created, the route **deletes the user** (never an account without tenant nor a tenant without owner).
- Abuse brake: 5 attempts per hour and 20 per day per IP, counted in `signup_attempts` (serverless has no shared memory); failed attempts count too. `signup_attempts` has RLS on with no policy plus `revoke`, service_role only.
- `/recuperar-senha` and the password change in `/perfil` talk to Supabase Auth directly from the browser (the change checks the current password first, because `updateUser` does not ask for it).

## Consequences
- Signup and invite depend on SMTP configured in the Supabase project.
- They also depend on the Auth URL Configuration, see `2026-09-27-supabase-auth-redirect-urls.md`, and on the link flow, see `2026-09-25-auth-email-link-implicit-flow.md`.
