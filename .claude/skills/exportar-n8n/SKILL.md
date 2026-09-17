---
name: exportar-n8n
description: Exportar ou reexportar os workflows do n8n para a pasta n8n/ sem vazar o x-lookup-secret nem a apikey da Evolution. Use antes de commitar qualquer mudança feita no n8n.
---

# Reexportar os workflows do n8n

⚠️ **Produção.** Nunca ativar nem modificar workflow ao vivo sem confirmação explícita do dono,
e sempre `validateOnly` antes de aplicar.

Os dois workflows versionados:

| Arquivo | Workflow | ID |
|---|---|---|
| `n8n/obs-atendimento.json` | OBS Atendimento | `sWzQUqqrTLcf6F45` |
| `n8n/crm-envio-manual.json` | CRM Envio Manual | `MkDoUMLyZZzZBrjQ` |

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

## Portão antes do commit

`git grep` do valor real de `N8N_LOOKUP_SECRET` e de `EVOLUTION_API_KEY` tem que devolver **zero**.
Se devolver qualquer coisa, não commite.

Dois nós continuam `disabled: true` de propósito desde 20/08/2026: `Pausa IA (handoff)` e
`Pausa IA (agendado)`. Se o export trouxer eles ativos, alguém religou; pergunte antes de gravar.
