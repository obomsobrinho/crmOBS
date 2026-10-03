# A test phone never reaches Evolution
- Date: 2026-10-03
- Status: Accepted
- Area: n8n, testing, WhatsApp

## Context
On 2026-10-03 at 13:43 UTC the WhatsApp number of the test tenant (Evolution instance `OBM`) was restricted by WhatsApp: Evolution reported `disconnectionReasonCode 403`, "Connection Failure".

The probable cause under our control was the paid attendance battery (`npm run test:e2e:n8n`, `e2e/atendimento.n8n.spec.ts`). It simulates customers on the impossible phone `5500000000001` (DDD 00) by posting to the PRODUCTION webhook of "OBS Atendimento". The flow then sent the AI replies FOR REAL through Evolution to that nonexistent number, several sends per scenario, over several rounds. The earlier assumption ("Evolution refuses, nobody receives anything", docs/adr/2026-10-01-n8n-send-failure-continues.md) was true for the recipient but not for the sender: every attempt was a real send from the connected number, and repeated sends to numbers that do not exist look like spam to WhatsApp.

The app already kept the test phone away from Evolution in some places (`telefoneImpossivel`, `lib/avisos.ts`: help-request notices, profile photos, `/chat/whatsappNumbers` in `POST /api/contacts`), but the n8n flows and two app routes that hand messages to n8n did not.

## Decision
No automated test may cause an Evolution call for a test phone. The test exists to see the reply, not to deliver it on WhatsApp.

- ONE rule: a phone whose digits start with `5500` (DDD 00 does not exist in Brazil) is a test phone. In the app it is `telefoneImpossivel` (`lib/avisos.ts`); n8n repeats it.
- n8n: every Evolution node is reached only through the TRUE output of an IF named `Telefone real? ...` (`!String(phone).replace(/[^0-9]/g, '').startsWith('5500')`). "OBS Atendimento": `Telefone real? (envio)` before `Evolution send` (FALSE goes to `1s`, so the loop continues), `Telefone real? (agendado)` before `Notifica grupo`, `Telefone real? (falha)` before `Fallback ao cliente` (which also covers `Avisa falha no grupo`). "CRM Envio Manual": `Telefone real? (texto)` and `Telefone real? (mídia)`, FALSE goes straight to the save node. "CRM Envio IA": `Telefone real?`, FALSE goes to `Salva IA (chat_messages)`. Everything else (Supabase writes, `/api/agent`, debounce) runs unchanged, so the battery still proves the reply.
- App: `POST /api/send` answers 422 for a test phone; `/api/conversations/orientar` does not run the `retomada` turn for it (`motivo: "telefone_de_teste"`, the instruction stays pending).
- `npm run checar` (`scripts/checagens.mjs`) fails an n8n export where any Evolution node can be reached without crossing the TRUE output of such an IF.

## Consequences
- The battery proves the reply in the database and on screen, never on WhatsApp. Verify after a run in the n8n executions that no Evolution node ran for `5500...`.
- A new Evolution node in n8n needs its guard or the export fails the check.
- Group notices (`Notifica grupo`, `Avisa falha no grupo`) triggered by a test phone are skipped too: a test never notifies, same as `processTurn`.
