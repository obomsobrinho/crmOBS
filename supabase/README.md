# supabase/

The repo is the record of the database schema. Production is the Supabase project
the app talks to; there is no staging.

## Layout
- `migrations/`: one file per schema change, named `<YYYYMMDDHHMMSS>_<snake_name>.sql`
  (UTC). The first 47 files are the migrations that were applied directly to the
  remote project before this folder existed, copied unchanged from
  `supabase_migrations.schema_migrations` (statements joined in order).
- `backups/`: exports of tables that were dropped from the database (prompt text,
  no secrets). Each file recreates its table; nothing here runs automatically.

## How a change is made
1. Write a new file in `migrations/` with a timestamp later than every existing
   file. Idempotent where possible (`if not exists`, `drop ... if exists`), with a
   comment header that says WHY, not only what.
2. Commit it in the same delivery as the code that depends on it.
3. The orchestrator applies it to the remote project with the Supabase MCP
   `apply_migration` after review (the applied version and name must match the
   file). Agents never apply DDL themselves.

Never run DDL by hand in the SQL editor: the change would exist in production and
not in the repo. Read-only queries are fine.

## Order matters
Files that depend on deployed code say so in their header (for example
`20261001160400_revoke_pending_instruction_update.sql` must wait for the route that
replaces the browser write).

## Checking drift
`list_migrations` (Supabase MCP) must list the same versions as the files here.
