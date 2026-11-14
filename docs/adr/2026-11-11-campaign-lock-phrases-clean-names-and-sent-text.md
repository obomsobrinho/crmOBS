# Campaign package: bot lock phrases, clean names, human opening and the sent text stored

Status: Accepted (owner, 11/11/2026)
Area: admin, agent-ai, data

## Context

The first real outbound campaign ("Campanha Lajinha primeira", 68 leads from a spreadsheet, 10 sends per day) produced in two days 20 delivered, 0 real conversations, 3 opt-outs and 7 auto-replies from other bots. Three defects on our side:

1. **The bot lock never fired.** The rule is 2 of 3 signals (fast, menu or automation pattern, repeated). Six replies arrived 1 to 5 s after the send (fast) but none had a word of the 07/11 list (digite, opção, aguarde, mensagem automática, retornaremos): one signal each, so Tony answered every bot. They were WhatsApp Business greetings ("X agradece seu contato. Como podemos ajudar?") and away messages ("No momento não estou disponível, mas retornarei em breve", "Recebemos a sua mensagem e entraremos em contato", "Dentro de alguns minutos estarei te respondendo"). Clínica AME sent 2 messages in the same second: the second had two signals, the first was a menu of ✅ lines without numbers (one signal), and the lock only acts when every message of the batch is automatic, so the person-in-the-batch protection let it through. The cron uses the same rule, so the bots counted as "respondeu".
2. **Company names went raw from Google into the message**: "Vi a Clínica Odontológica Mateus Machado | Implantes Dentários | Lajinha-MG", "Vi a Dr. Fabiano Alvim" (wrong article).
3. **The opening read as a mass send** ("Oi, tudo bem? ... Vi a {empresa} e ...").

## Decision

- **Lock (`lib/resposta-automatica.ts`)**: signal (b) also recognizes the away and greeting phrases seen in production (retornarei, entraremos/entrarei em contato, "no momento não estou/estamos disponível", "agradece seu contato", "obrigado(a) pelo contato", "recebemos sua mensagem", "estarei te respondendo", "seja bem-vindo", "fora do horário de atendimento") and a menu without numbers: 3 or more lines starting with an emoji or a bullet ("*" and "-" only with a space after, so a bold line is not a bullet). Everything decided on 07/11 stays: 2 of 3 signals, campaign conversations only, the fixed message once then silence, the whole-batch rule. A single away phrase is still not enough on its own (option A, owner's choice): the lawyer's away message that arrived 22 min later keeps reaching Tony.
- **Clean names (`nomeParaMensagem`, `lib/prospeccao.ts`, pure)**: "_" becomes a space; cut at "|" and at a loose hyphen, keep the first piece (the last one when the first is only category words such as "Clínica Odontológica"), pieces that are only the city or a UF go first; the lead's city (and a UF glued to it) leaves the end; ALL CAPS, all lowercase or a "_" handle becomes title case with "a, e, o, de, da, do, das, dos" lowercase; "Dr"/"Dra" get a period. Applied inside `textoParaLead`, so the cron, the Assistente preview and the contact origin use the same name. The 12 queued leads of the Lajinha list that change were also rewritten in `prospeccao_leads`, so the screen shows what the message shows; the 20 already sent keep their names.
- **Opening**: new field `{saudacao}` ("Bom dia" before noon, "Boa tarde" after, São Paulo time, at send time; the window closes at 18h). The three suggested variants use the company name as a vocative (no article to get wrong) and only "OBS" (never "OBS (O Bom Sobrinho)"). The exit line appended by code (`LINHA_DE_SAIDA`) became "Se não fizer sentido pra vocês, é só me avisar que eu não mando mais." Removing the exit line entirely was rejected: without a written exit, people press Report/Block, and reports are what most often bans a number on the unofficial API.
- **Stop phrases**: "não temos interesse", "não faz sentido" and "não mande mais" joined `FRASES_DE_PARADA` (the natural answers to the new exit line).
- **Sent text stored**: `prospeccao_campanha_leads.texto` (migration `20261112021321_prospeccao_texto_do_envio.sql`). The cron passes it to `prospeccao_registrar_envio` (`p_texto`); without it (the cron deployed before this change) the function stores the old rule's text (`prospeccao_texto_antigo`), which is what that cron sent. The 22 sends made before were backfilled with the text of the time. `origemDaCampanha` reads the stored text and only rebuilds it when the column is empty. Before, the text was rebuilt from the variant and the lead name, which would have shown the agent a text the lead never received as soon as the name rule or the exit line changed.

## Consequences

- The running campaign receives the clean name and the new exit line at its next send (both are applied by code at send time), still with its old variants, until it is paused and "Lajinha segunda" is created with the new variants.
- A name rule change no longer rewrites history: the agent reads what was stored.
- The persona of the OBS tenant had an example telling people to answer SAIR; it was changed together with the opening (owner reviewed the diff).

## Evidence

- Re-run with the 7 real replies of the Lajinha export through `decisaoDoTurno` (cases in `e2e/resposta-automatica.design.spec.ts`): before, 0 of 7 locked; after, 6 of 7 locked (Espaço Suellen Mota, Clínica AME, Dentista do Trabalhador, Clínica Mateus Machado, Dra. Hinglid, Espaço Costa), the 22-min away message still attended, the "Sair" of Dra. Mariana still attended and stopping the campaign, 0 of 10 typical human phrases locked even arriving 3 s after the send.
- The 12 changed names and the 34 unchanged ones of the queue are checked in `e2e/campanhas-lib.design.spec.ts`.
