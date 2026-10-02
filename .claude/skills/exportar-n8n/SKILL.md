---
name: exportar-n8n
description: Exportar ou reexportar os workflows do n8n para a pasta n8n/ sem vazar o x-lookup-secret nem a apikey da Evolution. Use antes de commitar qualquer mudança feita no n8n.
---

# Reexportar os workflows do n8n

⚠️ **Produção.** Nunca ativar nem modificar workflow ao vivo sem confirmação explícita do dono,
e sempre `validateOnly` antes de aplicar.

Os tres workflows versionados:

| Arquivo | Workflow | ID |
|---|---|---|
| `n8n/obs-atendimento.json` | OBS Atendimento | `sWzQUqqrTLcf6F45` |
| `n8n/crm-envio-manual.json` | CRM Envio Manual | `MkDoUMLyZZzZBrjQ` |
| `n8n/crm-envio-ia.json` | CRM Envio IA | `QbWUBuzXjvIEnQZN` |

Leia com `n8n_get_workflow` modo `active` (grafo publicado). Somente leitura.

## Antes de mudar qualquer coisa

Confira que o export no repositório bate com o que está no n8n. Se divergir, alguém mexeu fora do
repositório e o diff da sua mudança vai sair mentiroso.

## O que tirar do JSON antes de gravar

1. **`x-lookup-secret`**, que aparece em **DOIS** nós do OBS Atendimento: `Atendente` e
   `Sobe mídia recebida`. Nos dois, o valor vira o marcador `{{N8N_LOOKUP_SECRET}}`.
   Nunca escrever o valor real em arquivo, commit ou resposta.
2. **`pinData`** do `Webhook EVO`: carrega a apikey da Evolution e um telefone real.
3. Metadados que só sujam o diff: `versionId`, `activeVersionId`, `versionCounter`, `updatedAt`,
   `shared` (traz o e-mail do dono), `tags` vazias. Ficam apenas `id`, `name`, `active`, `nodes`,
   `connections`, `settings` e `meta`.
4. Telefone pessoal no texto do `Sticky README`.
5. **Caminho e id de cada webhook** (desde 02/10/2026 o caminho e um UUID secreto, tipo senha):
   `parameters.path` do no webhook vira `{{N8N_WEBHOOK_PATH_ATENDIMENTO}}` (`Webhook EVO`),
   `{{N8N_WEBHOOK_PATH_ENVIO_MANUAL}}` (`Webhook CRM`) ou `{{N8N_WEBHOOK_PATH_ENVIO_IA}}` (`Webhook IA`);
   o `webhookId` do no vira `{{N8N_WEBHOOK_ID_ATENDIMENTO}}`, `{{N8N_WEBHOOK_ID_ENVIO_MANUAL}}` ou
   `{{N8N_WEBHOOK_ID_ENVIO_IA}}` (reconstroi a URL). A referencia da credencial (`CRM webhook secret`,
   id e nome) pode ficar. `Webhook CRM` e `Webhook IA` ficam com `authentication: headerAuth`;
   `Webhook EVO` fica sem (a Evolution chama).

## Portão antes do commit

O valor real de `N8N_LOOKUP_SECRET`, `EVOLUTION_API_KEY`, `N8N_WEBHOOK_SECRET` e os tres segmentos UUID de `N8N_SEND_WEBHOOK_URL`, `N8N_IA_SEND_WEBHOOK_URL` e `N8N_BOT_WEBHOOK_URL` (lidos do `.env.local`, sem imprimir) tem que dar **zero** ocorrencias na arvore de trabalho fora dos arquivos `.env` (`git grep` ou script node). `npm run checar -- --estrito` tambem tem que passar.
Se achar qualquer coisa, não commite.

Dois nós continuam `disabled: true` de propósito desde 20/08/2026: `Pausa IA (handoff)` e
`Pausa IA (agendado)`. Se o export trouxer eles ativos, alguém religou; pergunte antes de gravar.
