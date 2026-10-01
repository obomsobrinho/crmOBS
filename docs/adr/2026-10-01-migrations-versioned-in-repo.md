# Database migrations live in the repo; default privileges give anon nothing
- Date: 2026-10-01
- Status: Accepted
- Area: security

## Context
The 47 migrations of the product existed only in the remote Supabase project
(`supabase_migrations.schema_migrations`). Schema, RLS, grants and SECURITY DEFINER
functions were never reviewed in a diff and could not be rebuilt from the repo
(audit R-10). Four of them were after-the-fact cleanups of the same default: tables
and functions created in `public` were born with `arwdDxtm` / `X` for `anon` and
`authenticated` (`pg_default_acl`, audit R-11), which is how `_persona_backup_*`
became readable by the public key. TRUNCATE (which ignores RLS) was granted to
`authenticated` on most tables and the browser never uses it (audit R-36 / SEC-11).

## Decision
- All 47 applied migrations were copied unchanged into `supabase/migrations/`
  (character counts checked against the database). From now on every DB change is a
  new file there, committed in the same delivery as the code, applied by the
  orchestrator with `apply_migration`. Never DDL by hand in the SQL editor.
- A migration revokes the default privileges of `anon` on tables, sequences and
  functions in `public`, and TRUNCATE of `authenticated` on tables, for the roles
  that create objects. It also removes TRUNCATE from existing tables and
  INSERT/UPDATE/DELETE of `authenticated` on `chat_messages` and `user_clients`
  (only service_role writes them).
- Left alone on purpose: the global default of PUBLIC execute on functions (changing
  it affects every schema). The repo rule stays: each function migration revokes
  from `anon, public` and grants explicitly.
- Persona backup tables were exported to `supabase/backups/` (md5 verified) and
  dropped (owner decision). `conversation_notes` UPDATE/DELETE now require the
  author or a `dono` of the tenant (owner decision). The browser write of
  `conversations.pending_instruction*` is revoked by a migration that must wait for
  the server route that replaces it.

## Consequences
- `list_migrations` and the folder must match; a mismatch is drift to fix.
- Any new table needs its own `grant` lines: defaults no longer cover it.
- The first 47 files carry the dates they had when applied, so their order in the
  folder is the order they ran.
