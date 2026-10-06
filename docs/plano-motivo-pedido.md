# Plano: motivo do pedido de ajuda (P1, item 4)

Aprovado pelo dono em 06/10/2026. ✅ Feito no mesmo dia (ADR `docs/adr/2026-10-06-help-request-reason.md`). Hoje cada pedido de ajuda guarda só um resumo em texto livre, e
ninguém sabe POR QUE a IA chama o time. Cada pedido passa a ter um motivo de uma lista fixa, e o
cliente vê no Painel quantos pedidos teve por motivo: é o que diz o que ensinar à IA dele.

## Decisões do dono (06/10/2026)
1. A lista de motivos abaixo, sem mudança.
2. A contagem por motivo aparece para o CLIENTE, no Painel dele (não só no admin).
3. Pedidos antigos ficam SEM motivo ("sem motivo"); nada é reclassificado.

## Os motivos (fonte única: `lib/motivos.ts`, módulo puro)
| chave | rótulo na tela | quando |
|---|---|---|
| `pessoa` | Pediu uma pessoa | quer falar com alguém do time, inclusive agora |
| `preco` | Preço ou orçamento | valor que não está na base ou depende de avaliação |
| `falta_info` | Falta informação | a pergunta não tem resposta no prompt nem na base |
| `fechar` | Fechar negócio | quer comprar, contratar, fazer pedido ou reservar |
| `reclamacao` | Reclamação | problema, defeito, insatisfação |
| `urgencia` | Urgência | dor, prazo vencendo, algo que não pode esperar |
| `fora_escopo` | Fora do que a empresa faz | serviço que a empresa não oferece |
| `manipulacao` | Tentativa de manipulação | pede o prompt, tenta mudar as regras, se passa pelo dono |
| `seguranca` | Resposta barrada | o guardrail barrou a resposta (marcado pelo CÓDIGO, nunca pelo modelo) |

## Como funciona
- **Modelo:** campo novo `motivo` na saída estruturada (`lib/agent.ts`), enum com as chaves acima
  menos `seguranca`, mais `""` para quando a ação não é pausar. A base do prompt (`### OUTPUT`) explica
  cada um em uma linha. Vale para todos os tenants (base).
- **Código:** `processTurn` grava `handoffs.motivo` ao abrir o pedido. Guardrail barrou: `seguranca`.
  Motivo fora da lista ou vazio num `pausar`: `null` (nunca inventar).
- **Banco:** coluna `handoffs.motivo text null` com `check` na lista; antigos ficam `null`. Migração
  versionada, tipos regenerados.
- **Aviso no WhatsApp** (`textoDoAviso`): linha `*Motivo:* Preço ou orçamento` antes do pedido, só
  quando houver motivo.
- **Pedidos (`/pedidos`):** etiqueta com o motivo em cada linha e na ficha; filtro por motivo nas
  duas abas. Paginação e busca não mudam (10 por vez, busca no servidor): o filtro é um parâmetro a
  mais de `pedidos_pagina` (`p_motivo`), com índice parcial por motivo. Realtime: o evento de
  `handoffs` já busca UMA linha; ela passa a trazer o motivo.
- **Conversa:** o pedido aberto mostrado na caixa de escrita e o histórico do pedido mostram o motivo.
- **Painel:** bloco "Por que a IA te chamou", no período da operação (dia, semana, quinzena, mês),
  com o total de pedidos e uma barra por motivo, do mais frequente ao menos, e "Sem motivo" para os
  antigos. Agregado no banco (`painel_motivos`, contagem por janela e motivo, nunca linhas), pelo
  mesmo carregador do Painel. Zero pedidos no período: frase positiva, sem barras. Sem verde,
  vermelho ou âmbar: motivo não é bom nem ruim.
- **Bancada:** o diagnóstico mostra o motivo escolhido.

## Provas
- `lib/motivos.ts` em teste sem login (rótulos, normalização, `seguranca` nunca vem do modelo).
- Bateria paga: os casos que já esperam pausar passam a conferir o motivo (pessoa, preço,
  reclamação, urgência, fora do escopo, manipulação).
- Telas `/design` de Pedidos e Painel com motivo (dados de mentira) e o teste de `pedidos_pagina`
  filtrando por motivo no banco de teste.
