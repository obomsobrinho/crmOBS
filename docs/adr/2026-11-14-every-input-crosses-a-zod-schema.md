# Every server input crosses a Zod schema (with the owner's adjustments)

Status: Accepted (owner, 11/11/2026, adjusted the same day)
Area: data, billing, n8n

## Context

The 62 routes checked bodies by hand with `typeof`; webhooks from n8n, Asaas, Apify and the crons were parsed by hand; the API answered in three error shapes.

## Decision

- Route bodies and query strings go through `lerCorpo` / `lerConsulta` (`lib/rota.ts`) with the area's schema; a failure answers 400 `{ error, codigo: "entrada_invalida" }`. Every app-called route answers status plus `{ error, codigo? }` (`erroDaRota`).
- Asaas, Apify and the crons start in shadow mode (`conferirNaSombra`: log, never refuse) and refuse only after a week with zero mismatches. The Asaas webhook is in shadow mode since Step 1 (`lib/asaas-esquema.ts`).
- The n8n webhooks validate and log, never refuse (except a missing field the handler cannot work without, with a notice): the caller is the owner's own flow behind a secret, and a refusal would stop attendance silently.
- URL parameters go through nuqs parsers only (`lib/url.ts`), no Zod behind them. `lib/env.ts` comes in Step 5, validated once against the Vercel list.
- New or complex forms use react-hook-form with the Zod resolver and `components/ui/form.tsx`.

## Consequences

- Routes converge to the single error shape area by area; a final sweep in Step 5 covers the rest.
