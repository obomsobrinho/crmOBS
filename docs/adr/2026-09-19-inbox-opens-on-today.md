# The conversation list opens on "Hoje"
- Date: 2026-09-19
- Status: Accepted
- Area: inbox

## Context
The owner's list opened with 48 conversations.

## Decision
Three-position selector in the title row (`Hoje` / `7 dias` / `Tudo`, `data-slot="inbox-periodo"`); state chips unchanged. The window is ROLLING in the civil day of America/Sao_Paulo (`dentroDaJanela` / `diaSP`, `lib/inbox.ts`): "today" is today, not the last 24h (at 9am, 24 hours would bring half of yesterday).
- A conversation with an open `handoff_at` NEVER disappears because of the time filter (one line, `needsYou(it) ||`, in `components/ContactSidebar.tsx`). Otherwise the cut hides exactly what the product exists not to let be forgotten.
- Chip counts come from the window, not from the total.
- Search IGNORES the window (searching for someone and not finding them because of the date would be search lying).

## Consequences
Tests with login: the test tenant is the owner's parked number, so on a day with no new message "Hoje" is empty. A test that needs the list picks "Tudo" first (`resolver.auth.spec.ts` and `realtime.serial.spec.ts` already do).
