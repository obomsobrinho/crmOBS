# The route schema sweep keeps every status, sentence and check order

Date: 2026-11-16. Status: Accepted. Area: data, billing. Step 5 of `docs/plano-dados-e-estado.md` (the Zod sweep), under `docs/adr/2026-11-14-every-input-crosses-a-zod-schema.md`.

## Context

After Step 4, 43 of the 63 routes in `app/api` read their input by hand (`req.json()` in a `try`, `searchParams.get`). The owner's order for the sweep: no route changes what it accepts, its status or its sentence; a schema holds only what the handler reads; without certainty about what arrives, shadow mode. Many handlers check fields only after reading the database or Evolution (the notices group against the WhatsApp list, the plan and CPF after reading the account, the agent config through `compilePersona`), and several answer with extra fields (`campo`, `fields`, `faltas`) or a status other than 400 (413 for a long audio).

## Decision

- A session route reads through `lerCorpo`/`lerConsulta` with `motivo: true`; the schema decides only what the handler decided BEFORE any read (the JSON, the mode, `enabled`, the plan, the cursor, the cap), with the same sentence as the issue message. Every later check stays in the handler, in the same order; the fields it checks pass through unchanged (`campo<T>()`, `lib/esquema.ts`), typed as the route already declared them.
- `corpoJson(forma, fraseSemJson)` (`lib/esquema.ts`) is the body of a route that answered its own sentence when `req.json()` failed. A JSON `null`, which used to crash with 500 on the first field read, now gets the same 400 sentence; a number, string or array still becomes `{}` and each field says its reason, as before. Extra keys pass through (`looseObject`).
- `lerCorpo` gained `semJson`: the sentence for a non-JSON body when the route hands the whole body to a pure rule with its own sentence for `null` (`PUT .../conta` over `pedidoDeAcao`).
- A multipart route whose broken form had its own sentence keeps its `formData()` and runs the field through `.safeParse` (`playground/transcrever`: "envio inválido", then the schema's "áudio vazio", then the 413 in the handler).
- Optional bodies never refuse: `connect-whatsapp` (no body is the QR) and the subscription cancel (no reason is an empty reason).
- Public or machine callers go to shadow mode (`conferirNaSombra`, logs only): `POST /api/signup` and the Apify webhook query (`?busca=`, built by us).
- Schemas live with their area: `features/<area>/schemas.ts` for migrated areas, `lib/<area>-schemas.ts` until the area moves (team, agent, billing, signup). Each schema file has a Vitest file proving the sentences.
- `npm run checar` fails on an `app/api` route that reads a body, form or query without a schema helper, and on a route without any that is not in `ISENTAS` with the reason (14 routes: GET or POST with no input besides the session and the route id).

## Consequences

- Error bodies of the converted routes gain `codigo: "entrada_invalida"` next to the same `error`; the screens read only `error`.
- A refused input now leaves one `entrada recusada:` log line with the path and the reasons (never values).
- The schemas of routes with late checks are thin on purpose: tightening one (moving a database-dependent check into it) is a behavior change and needs its own delivery.
- `lib/env.ts` is NOT part of this sweep: it waits for the owner to confirm the Vercel variable list (spec 2.9).
