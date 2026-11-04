# The campaign cron reads replies by every phone spelling, including the WhatsApp JID
- Date: 2026-11-04
- Status: Accepted
- Area: admin

## Context
The owner's test campaign of 04/11/2026 sent to two of his numbers; both replied (one asked for more
information, the other wrote "Sair"), but the campaign showed 0 replies and the SAIR was never
recorded (`prospeccao_leads.parou_em` stayed null). The cron (`prospeccao_tick_5m`) ran every 5
minutes with HTTP 200. `mensagensRecebidas` (`lib/prospeccao-cron.ts`) filtered `chat_messages.phone`
by digits only (`grafiasDeDigitos`), while n8n stores `phone` as a JID: all 484 rows of the table
were `55...@s.whatsapp.net`. For the lead who wrote "Sair", the cron's filter found 0 rows, and the
same filter with the JID found 1. The unit tests used digit only phones, so they never saw it.

## Decision
The cron filters by `grafiasDoTelefone` (`lib/clientes.ts`): with and without the ninth digit, with
and without the `@s.whatsapp.net` suffix. Matching inside `respostasDosEnvios` already compared by
`chaveTelefone`, which drops non digits. A spec now feeds a message in the JID format n8n writes.

## Consequences
Sends stay under observation for 14 days, so the first tick after the deploy marks the test leads as
answered and records the SAIR, with no manual data fix.
