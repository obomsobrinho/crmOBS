# Dates on screen always use timeZone America/Sao_Paulo
- Date: 2026-09-27
- Status: Accepted
- Area: ui

## Context
A component renders first on the server (UTC) and `suppressHydrationWarning` keeps the server text. Without a zone, 17:47 became 20:47 on the phone.

## Decision
Every date rendered on screen passes `timeZone: "America/Sao_Paulo"`, using `FUSO` from `lib/format.ts`.

## Consequences
Same applies to classification of day/hour in business numbers (use Intl with the zone, never UTC), see the dashboard ADRs.
