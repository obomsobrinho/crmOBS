# clients.account_type identifies the tester, it never authorizes access
- Date: 2026-08-28
- Status: Accepted
- Area: billing

## Context
The free beta (5 to 10 testers) needed a way to tell testers from internal and paying accounts. `trial_ends_at` null unlocks access but identifies nobody. Migration `mt_clients_account_type`.

## Decision
Add `clients.account_type` (`interno` / `beta` / `pago`, CHECK in the database, nullable, no default).
- It IDENTIFIES, it does NOT AUTHORIZE. `accessState` keeps deciding access only from `subscription_status` and `trial_ends_at`.
- `null` = not classified, on purpose. Guessing a default for whoever came through `/cadastro` would invent a fact.
- Marking is manual (`update clients set account_type = 'beta'`). With 5 to 10 testers an admin screen costs more than it solves.
- It is the column the queries in `docs/instrumentacao-beta.md` filter on.

## Consequences
- Mixing the two concerns (identity and access) is how a paying customer ends up locked out. Never read `account_type` inside `accessState`.
- Code must treat `null` as a valid, unclassified value.
