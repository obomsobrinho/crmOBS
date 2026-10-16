---
name: consultas-uso
description: Rodar as consultas de métricas de uso por empresa (quem publicou o agente, dias de uso, IA contra time, quem sumiu, feedback dos usuários). Use quando o usuário perguntar como está o uso de cada empresa ou o que os usuários escreveram no canal de feedback.
---

# Consultas de uso por empresa

**Não existe tela, e é decisão.** As cinco consultas estão em `docs/instrumentacao-uso.md`;
leia o arquivo e use o SQL de lá, não escreva SQL novo de cabeça.

Rodar pelo MCP do Supabase (`execute_sql`) ou pelo SQL Editor.

## Duas traduções que não são opcionais

1. **A regra de "resposta da IA" é a de `lib/mensagem.ts`**, e no SQL ela vira
   `is distinct from`, nunca `<>`. Com `<>` o `null` some da comparação e o número muda.
2. **Dia em `America/Sao_Paulo`**, nunca em UTC. Em UTC a mensagem da noite cai no dia seguinte.

Duas definições do mesmo número é como o produto começa a mentir.

## O que filtrar

Nada por tipo de conta: `clients.account_type` saiu em 16/10/2026 (`docs/adr/2026-10-16-account-type-removed.md`). As consultas listam todas as empresas; filtre por
`c.name` ou `c.id` só quando o dono pedir uma empresa.

## `feedback`

Só o dono lê, por SQL: a tabela não tem policy nem grant de SELECT para `authenticated`, e nem o
autor relê pelo browser. **Ninguém é avisado quando um relato chega**, então essa consulta é a
única forma de saber que existe algo novo.
