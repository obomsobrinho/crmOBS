# Connect WhatsApp by phone number (pairing code) and trimmed risk notice
- Date: 2026-09-24
- Status: Accepted
- Area: onboarding

## Context
On a phone the QR cannot be read on the same screen. The risk notice also needed trimming (owner request).

## Decision
- `POST connect-whatsapp` with `{ number }` returns the Evolution (2.3.7) `pairingCode`, typed in WhatsApp under Aparelhos conectados > Conectar com número de telefone. It is the DEFAULT on mobile and the alternative on desktop.
- The code is only born from the closed state: an instance stuck in `connecting` gets `logout` first, and an `open` instance is NEVER dropped (the route returns `connected`).
- The risk notice (`components/ConnectionRiskNotice.tsx`, in `/connect` and in the wizard connect step) was trimmed: dedicated number and visible block risk; the rest behind "Saiba mais". Content rules remain: NEVER promise protection against blocking and never use "não pague a API da Meta" (an e2e locks this).
- `ConnectWhatsApp` has `enquadramento` (`pagina`/`passo`) and `onConectado`: two FRAMES of the same component, because the QR, the pairing code and the polling must not exist twice.

## Consequences
Not proven with a real number until the owner tests it.
