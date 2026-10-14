---
paths:
  - "app/admin/**"
  - "app/api/admin/**"
  - "app/design/admin/**"
  - "components/admin/**"
  - "lib/admin*.ts"
  - "proxy.ts"
---
# Admin (/admin, product owner only)

- Admin = a user id listed in the server env `ADMIN_USER_IDS` (comma-separated `auth.users.id`), decided ONLY by `ehAdmin` (`lib/admin-acesso.ts`, pure). Never a DB column a tenant could change, never an id written in code. Without the env var nobody is admin.  (why: docs/adr/2026-10-13-ai-usage-cap-in-tokens.md)
- Three locks: `proxy.ts` answers 404 for `/admin` and `/api/admin/*` to anyone else (no login included); the page calls `notFound()` and every admin route answers 404 through `adminDaSessao` (`lib/admin.ts`); a route that WRITES passes `revalidar: true` (`getUser()`). 404, never 403: do not reveal it exists. Admin routes do not use `sessaoDaRota` (the admin acts across tenants, not as a member of one).  (why: docs/adr/2026-10-13-ai-usage-cap-in-tokens.md)
- Reads and writes go through `service_role` on the server only (`lib/admin.ts`, admin routes); the browser talks only to `/api/admin/*`. Never import `lib/supabase/service` in `components/admin/**`.  (why: docs/adr/2026-10-13-ai-usage-cap-in-tokens.md)
- Every admin change and its `admin_acoes` row (`quem`, `acao`, `alvo`, `antes`, `depois`, `em`) happen in ONE SQL function, one transaction (cap: `admin_mudar_limite_ia`, which locks the `clients` row and clears stale notice marks). Never two writes from the route. No admin action without a trace.  (why: docs/adr/2026-10-13-ai-usage-cap-in-tokens.md)
- The Empresas list follows the production loading rules: `admin_empresas_pagina` (keyset by name and id, 10 per page, trigram search on `sem_acento(name)`, joins only after the limit), `usePaginada` with infinite scroll, server search with debounce, no realtime (an "Atualizar" button). Row math (state, %, estimated cost) only through `paraEmpresa`/`comLimite` (`lib/admin-empresas.ts`) over `lib/custo-ia.ts`.  (why: docs/adr/2026-10-13-ai-usage-cap-in-tokens.md)
- Validate every id or cursor param with `ehUuid` (400 on malformed, never 500). The page size `n` is clamped only in SQL.  (why: docs/adr/2026-10-13-ai-usage-cap-in-tokens.md)
- `/admin` is not in any tenant menu and lives outside `app/(app)`. Preview with fake data at `/design/admin`, which is `notFound()` in production.
