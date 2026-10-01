# WhatsApp-down banner is checked in the browser, never in a Server Component
- Date: 2026-09-11
- Status: Accepted
- Area: ui

## Context
The app must say when WhatsApp dropped (item C3 of the demo plan). The state comes from the Evolution API.

## Decision
`components/WhatsAppBanner.tsx` sits in `app/(app)/layout.tsx` right below `BillingBanner` (same place and weight). It shows while the instance state differs from `open`: `close` red, `connecting` amber, `unknown` neutral, all three linking to `/connect`. The check runs in the BROWSER after load, every 60s and on focus return, never in a Server Component. Source: `GET /api/clients/[id]/whatsapp-status`. `estadoForcado` exists only for the `/design/conexao` preview and the test; the layout never passes it.

## Consequences
The layout runs on every navigation: one Evolution call per page would make the screen wait on a third-party API (finding A1). The e2e with login intercepts the route with `page.route` to force `close`, since a real drop cannot be provoked on the test tenant.
