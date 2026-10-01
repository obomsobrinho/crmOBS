# /montagem wizard round of 26/09/2026 (owner requests, one by one)
- Date: 2026-09-26
- Status: Accepted
- Area: onboarding

## Context
First-impression pass on the assistant, requested item by item by the owner.

## Decision
- Step 3 = "Converse com o seu agente": the test bench LIVES in the step (no card, no button). The page does NOT scroll (`h-dvh`, only the conversation scrolls; e2e measures at 375 and 1440). "Recomeçar conversa" sits next to the title (icon only on mobile).
- Step 4 in the WhatsApp Web mold (`ConnectWhatsApp`): three numbered steps on the left, the code on the right, below it the mode switch plus the risk notice (which moved into the card). The button says what it does: "Gerar QR code", never again "Conectar WhatsApp". One sentence only in the subtitle; the box "Conectar não liga o agente" was removed as repetition. The QR is redrawn in the brand purple (`QrDaMarca`, canvas by luminosity, falls back to the original image on failure).
- Generating the QR still requires a click: generating it automatically would create the instance in Evolution just by opening the step (pending owner decision).
- The exit says what is left for later and lives in the footer, next to the main action (at the top on mobile): "Terminar depois", "Testar depois", "Conectar depois", "Ativar depois". Removed: "Sair e continuar depois", the step 2 "Deixar para depois" (did the same as Continuar) and the notice "Retomamos de onde você parou" (nobody understood it).

## Consequences
Bug fixed in the same round: switching preset with a filled form did nothing, because the assistant did not render the `ConfirmModal` that `choosePreset` expects. It renders it now.
