# clients.account_type removed with the end of the beta
- Date: 2026-10-16
- Status: Accepted (owner decision of 16/10/2026). Supersedes `docs/adr/2026-08-28-account-type-identifies-not-authorizes.md`.
- Area: billing, data, admin

## Context
`clients.account_type` (`interno` / `beta` / `pago`, nullable) was created on 28/08/2026 to tell the free testers from internal and paying accounts. It identified and never authorized: `accessState` never read it. Its only readers were the beta queries of `docs/instrumentacao-uso.md` and, later, a subtitle and a header line in the central. The beta is over, and the access states (Vitalício, manual block, deactivation, trial, subscription) cover every real distinction.

## Decision
- Two steps, because the deployed code still selects the column. Step 1 (this delivery): no code reads or writes it (`lib/admin-empresas.ts`, the LGPD export list `COLUNAS_DO_CLIENTE`, the preview data, the generated types, every screen of the central). `admin_empresas_pagina` keeps returning it until step 2, and the code ignores the extra field.
- Step 2: `supabase/migrations/20261017000000_drop_clients_account_type.sql`, written but NOT applied. The architect applies it AFTER the deploy of step 1. It recreates `admin_empresas_pagina` without the column (same body, grants and precedence), drops the check and drops the column. The generated types are regenerated in the same step.
- The beta queries of `docs/instrumentacao-uso.md` stop filtering by type and list every company; a name filter is applied by hand when needed.
- `admin_bloqueados_sem_beta` (no caller since 15/10/2026) goes in its own migration, `20261017000100_drop_admin_bloqueados_sem_beta.sql`, also applied after the deploy.

## Consequences
- No "type of account" appears anywhere in the central (header, Visão geral, Plano card, list subtitle: the list says only "Plano X" or "Sem plano").
- The LGPD export of `cliente.csv` no longer has the column; `e2e/central-clientes-conta.design.spec.ts` still compares the list with the generated types, so the export and the types lose it together.
- Never reintroduce a column to mark testers; if a distinction is needed again, it is its own decision with its own evidence.
