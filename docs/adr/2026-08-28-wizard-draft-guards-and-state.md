# Wizard draft in the browser, four guards on /montagem, onboarding state module
- Date: 2026-08-28
- Status: Accepted
- Area: onboarding

## Context
Part of the rebuild of montagem/publish (step 2 of the beta MVP).

## Decision
- Browser draft (`components/agente/rascunho.ts`, key `montagem:{clientId}`): the assistant writes to the server ONCE, when leaving "o que ele sabe" (step 2). If `agent_config_updated_at` is newer than the draft, the server wins. A draft does not cross devices. It is also why `/montagem` loads the wizard with `ssr: false` (`components/MontagemCliente.tsx`).
- Four guards on `/montagem`: blocked account goes to `/assinatura`, attendant to `/inbox`, whoever already published to `/agente`, and whoever is in `prompt_mode = 'avancado'` also, because they have a hand-written persona and the assistant saves through the guided path. The last one is not redundant: a new tenant can enter advanced mode via `/agente` BEFORE publishing.
- `lib/onboarding.ts` (PURE module) has `PASSOS_MONTAGEM` (the 4 steps, with the sentence on why each matters) and `montagemState()` (where to resume and whether it is over). Signals in the database: `evolution_instance`, `agent_config_updated_at`, `onboarding_tested_at` and `agent_published_at`. `getMyClient()` brings `montagem` ready (scalars only, NEVER `persona`/`agent_config`).
- `OnboardingBar` NO LONGER EXISTS. It became `components/AvisoMontagem.tsx`: ONE LINE, no numeral, no list, no expand, on every app page while the agent is not live, owner only. The account progress counter exists in one place only, inside the assistant.

## Consequences
Any new onboarding signal goes through `montagemState`, not through ad hoc checks in pages.
