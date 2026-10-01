# Plans table, null plan means no limit, owner does not count as a seat
- Date: undated (Phase 4, plans)
- Status: Accepted
- Area: billing

## Context
Commercial plan definitions exist before checkout exists.

## Decision
- The price table lives in `lib/billing.ts` (`PLANS`: Essencial R$ 197 / Profissional R$ 347 /
  Avançado R$ 597). `clients.billing_plan` stores only WHICH plan (CHECK in the DB).
- **`null` = no plan chosen (trial or internal account) and there is NO limit.** `planFor` returns
  `null` on purpose: guessing a plausible plan would create a limit nobody bought (first symptom: OBM
  getting a 409 on a legitimate invite).
- **The owner does NOT count as an attendant:** `billableSeats(total)` = `total - 1`. It is `- 1` and not
  "discount whoever has the owner role", otherwise inviting a second owner would give a free seat.
- **Only the attendant limit is ENFORCED** (`seatState` + 409 in `POST /api/team/invite`, counting
  `user_clients` via service_role because the policy only shows the browser its own row). Extra
  attendant is SOLD as an add-on (R$ 67 up to the 3rd, R$ 47 from the 4th), so this 409 is a
  **temporary** wall: until checkout exists, charging the add-on is manual, and freeing the seat
  before charging would be a free seat.
- `funnels`, `conversations` and `features` are in `PLANS` as commercial definition and are **NOT
  enforced**: more than 1 funnel does not exist (`pipeline_stages` is one funnel per tenant),
  conversation limit needs measurement (Phase 5), per-attendant report does not exist, and assignment
  is not yet locked by plan. `numbers` is 1 in all plans because multiple numbers is in "do not build".
- Downgrading a plan **removes nobody**: whoever exceeds the included count becomes add-on and the
  screen warns. See `docs/proximos-passos.md`.

## Consequences
Never invent a default plan. A new plan limit must be justified by something actually sold.
