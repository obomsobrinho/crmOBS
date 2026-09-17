---
name: consultas-beta
description: Rodar as consultas de instrumentação do beta (quem publicou o agente, dias de uso, IA contra time, quem sumiu, feedback dos testadores). Use quando o usuário perguntar como o beta está indo ou o que os testadores escreveram.
---

# Consultas do beta

**Não existe tela, e é decisão.** As cinco consultas estão em `docs/instrumentacao-beta.md`;
leia o arquivo e use o SQL de lá, não escreva SQL novo de cabeça.

Rodar pelo MCP do Supabase (`execute_sql`) ou pelo SQL Editor.

## Duas traduções que não são opcionais

1. **A regra de "resposta da IA" é a de `lib/mensagem.ts`**, e no SQL ela vira
   `is distinct from`, nunca `<>`. Com `<>` o `null` some da comparação e o número muda.
2. **Dia em `America/Sao_Paulo`**, nunca em UTC. Em UTC a mensagem da noite cai no dia seguinte.

Duas definições do mesmo número é como o produto começa a mentir.

## O que filtrar

`clients.account_type` marca o testador (`interno` / `beta` / `pago`). `null` é "não classificado"
de propósito, não chute um valor. Marcar é manual:
`update clients set account_type = 'beta' where id = ...`.

## `feedback`

Só o dono lê, por SQL: a tabela não tem policy nem grant de SELECT para `authenticated`, e nem o
autor relê pelo browser. **Ninguém é avisado quando um relato chega**, então essa consulta é a
única forma de saber que existe algo novo.
