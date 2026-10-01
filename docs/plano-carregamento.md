# Plano: carregamento de dados para produção

Decidido pelo dono em **01/10/2026**, depois de o banco (plano free do Supabase) travar por falta de
memória. A decisão dele, que vale para todo o resto: **estrutura de produção, não de beta.** "Depois,
em produção com 30 clientes, não tem como fazer alterações estruturais com facilidade."

## As regras (do dono, não reabrir)

1. **Lista grande é sempre paginada, de 10 em 10** (ou até encher a altura da tela), e carrega mais ao
   rolar, como o Instagram.
2. **Busca no servidor, sempre com debounce.**
3. **Realtime atualiza só a linha que mudou.** Não recarregar dado que não muda nada.
4. **Aba escondida não busca.** Anota que ficou para trás e revalida quando a pessoa volta.
5. **Conversas abrem em "hoje" mais os pedidos de ajuda nunca fechados** (handoff é prioridade).
6. **As mensagens de uma conversa só ao abrir a conversa.**

## O que o levantamento achou

- Cada mensagem que chegava fazia **toda aba com Conversas aberta** buscar a lista inteira (até 500
  conversas, TODOS os contatos do tenant e 300 resumos), inclusive aba escondida. O menu refazia as
  contagens em toda página. Num lote de 4 mensagens com resposta, ~10 recargas completas por aba.
- **22 regras de RLS recalculavam `auth.uid()` a cada linha** (lint `auth_rls_initplan`).
- O Painel baixa **todas as mensagens do tenant desde o início** para contar no servidor.

## Fases (cada uma fecha com teste e commit)

- ✅ **0. Banco:** RLS com `(select auth.uid())` (mesma regra, uma avaliação por consulta;
  `mt_rls_auth_uid_uma_vez`); índices de paginação por cursor e de busca de texto (`pg_trgm`,
  `unaccent` com `public.sem_acento` imutável; `mt_indices_paginacao_busca`).
- ✅ **1. Conversas:** `public.inbox_pagina` (10 por vez, cursor `(grupo, last_message_at, id)`,
  recorte, filtro e busca no banco, incluindo o conteúdo das mensagens) e `public.inbox_contagens`
  (chips e cabeçalhos de grupo), as duas `security invoker`. No navegador: `lib/inbox-lista.ts`
  (puro: item, ordem, `encaixar`, início da janela), `lib/inbox-fonte.ts` (banco ou memória para o
  preview), rolagem infinita por `IntersectionObserver`, busca com `useDebounce` (300ms), realtime
  filtrado pelo tenant que busca SÓ a linha (debounce de 500ms), aba escondida parada, revalidação
  ao voltar o foco no máximo a cada 10s. Provado em `e2e/realtime.serial.spec.ts` (25 conversas
  semeadas, contando as chamadas às funções).
- ✅ **2. Menu:** `lib/use-contagem-ao-vivo.ts` (só o tenant, uma contagem por rajada, nada em aba
  escondida). Achados no caminho, os três corrigidos:
  - **Realtime assinado antes da sessão entrava como anônimo** e ficava mudo (a RLS escondia todo
    evento). Toda assinatura passa por `assinarComSessao` (`lib/supabase/client.ts`).
  - **A exclusão do número de avisos no menu nunca casava** (comparava dígitos com o JID).
  - **Segurança:** `_persona_backup_20260820` estava sem RLS e LEGÍVEL pela chave pública (anon);
    o de 22/08 sem RLS. Os dois ganharam RLS e perderam os grants de `anon`/`authenticated`, e
    sobras de grant do `anon` em `conversations`, `chat_messages`, `pipeline_stages` e
    `dados_cliente` saíram (`mt_fecha_backups_e_sobras_anon`). Conferido pela API pública: 42501.
  - `inbox_pagina`/`inbox_contagens` viraram plpgsql (plano guardado): 1,5 ms e 0,1 ms por chamada.
- ✅ **3. Clientes:** `public.clientes_pagina`/`clientes_contagens` (plpgsql, `security invoker`;
  busca em nome, e-mail, tags, campos e telefone com e sem o nono dígito, igual a `casaBusca`),
  `lib/clientes-fonte.ts` (banco ou memória) e o gancho genérico `lib/use-paginada.ts` (primeira
  página do servidor, marcador do fim, revalidar ao voltar). O teto de 2.000 e o aviso de lista
  cortada saíram. Provado em `e2e/clientes.serial.spec.ts` (25 contatos semeados).
- **4. Conversa aberta:** últimas 30 mensagens, as antigas ao rolar para cima, mensagem nova pela
  linha do realtime.
- ✅ **5. Pipeline:** `public.pipeline_coluna`/`pipeline_contagens` (coluna efetiva = a de
  `stageColumns`), `lib/pipeline-fonte.ts`; cada coluna com os próprios 10 cards e o marcador do
  fim; números e subtítulo da coluna do banco (`resumoDosNumeros`); mover é otimista entre colunas;
  realtime busca SÓ o card. ⚠️ Achado: `pipeline_stages` e `conversation_notes` nunca estiveram na
  publicação do realtime; o Supabase recusava a assinatura e derrubava o canal INTEIRO (o realtime do
  Pipeline nunca funcionou, e o das notas também não). As duas entraram, com replica FULL.
- **6. Painel:** números calculados no banco (hoje ele baixa tudo e conta no servidor).

⚠️ **A ordem da lista existe em dois lugares:** no `order by` de `inbox_pagina` e em
`compararItens` (`lib/inbox-lista.ts`), que reposiciona a linha que o realtime atualizou. Mudou um,
muda o outro.
