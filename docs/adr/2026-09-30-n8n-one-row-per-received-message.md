# One chat_messages row per received message
- Date: 2026-09-30
- Status: Accepted
- Area: n8n

## Context
Trigger: "áudio, texto, áudio e imagem de uma vez". The 15s debounce used to write ONE row per batch, with the media of the first message only.

## Decision
`Salva recebida` (after `Push msg (Redis)`) writes EACH message immediately, with its own media and its arrival time on WhatsApp (`Dados.recebidoEm`, from `messageTimestamp`; without it the slow audio transcription scrambled the order). `Salva chat_messages` writes only the RESPONSE, in a separate row. The app follows: `semLoteAtual` (`lib/mensagem.ts`) removes from history the messages that already come in the request `message` (otherwise the AI read each twice), `HISTORY_ROWS` went to 24 (`lib/agent-turn.ts`), and the real agent phrase in the Painel builds the question from the messages between the two replies.

## Consequences
WARNING: deploy order is APP before n8n.

## Evidence
Proven with a simulated batch on the impossible phone number.
