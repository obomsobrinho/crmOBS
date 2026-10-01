# Free beta MVP: scope, menu order and non-reopenable decisions
- Date: 2026-08-26
- Status: Accepted
- Area: product

## Context
Launch is a FREE beta with people the owner knows (lawyer, pediatrician, barber, engineer, clinic, shop), paid by him. Billing is built and PARKED on purpose. Six steps in order (details in `docs/proximos-passos.md`): (1) dashboard done, (2) agent steps done, (3) the 4 gaps done, (4) design and mobile in Claude Design, (5) apply the design, (6) tests.

## Decision (locked, do not reopen)
- `/agente` is TWO surfaces (WooCommerce setup pattern): the `/montagem` assistant and the permanent three-tab screen (done 28/08/2026). The assistant absorbed the onboarding bar (one progress counter per account) and disappears after the first publication, which made the "save and continue" vs "saving is publishing" collision vanish by construction.
- Painel is the FIRST menu item; the landing screen depends on role AND setup (`app/page.tsx`): owner who has not published goes to `/montagem`, published owner to `/painel`, attendant to `/inbox`.
- Menu (`components/NavRail.tsx`, 27/08/2026): Painel, Pedidos (added 29/09/2026), Conversas, Pipeline, Agente (owner-only), Equipe. "Em breve" is Agenda and Follow-up. Campanhas LEFT: keeping it promised mass sending over QR (the ban scenario the project decided not to run) and attracts the wrong customer in the beta.
- `clients.account_type` (`interno`/`beta`/`pago`) marks the tester (done 28/08/2026): `trial_ends_at` null frees access but identifies nobody.
- Mixed audience: no fixed screen text may assume appointment, patient or scheduling. The segment language is carried by the preset.

## Consequences
Phase 4 billing (Asaas) exists but is not exposed to testers. Do not suggest deploy, self-service signup or sales before Phase 4 (decision: build to parity before publishing and selling).
