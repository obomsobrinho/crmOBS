# Plano: página de pedidos abertos

Escrito e **aprovado pelo dono em 29/09/2026**, e executado no mesmo dia. É o item 2 do P0 do plano
vigente (`docs/proximos-passos.md`). Depende do item 1 (avisos no WhatsApp).

## Decisões do dono (29/09/2026, não reabrir)

1. **O "Abrir" do aviso leva à PÁGINA**, com a linha daquele pedido já aberta
   (`/pedidos?abrir={id}`). O `processTurn` passou a pegar o id do pedido no insert.
2. **Menu, opção A**: item "Pedidos" entre Painel e Conversas, com o número âmbar dos abertos. No
   celular entra na barra de baixo no lugar do Pipeline, que foi para "Mais".
3. **Login NÃO volta para o endereço pedido**, de propósito: é segurança, a pessoa entra e a página
   mostra a fila inteira, que ela precisa resolver de qualquer jeito.
4. **Ordem: do mais antigo para o mais novo** (confirmado depois de uma resposta ambígua).
5. Conta bloqueada vê a página em leitura, como o `/inbox`; atendente vê todos os pedidos;
   resolvidos recentes (histórico) ficam para o P1, junto do motivo do pedido.

## O problema

O aviso chega no WhatsApp do time, e a pessoa precisa de um lugar para AGIR sobre ele. Hoje o
pedido só existe dentro da conversa (caixa de escrita com a fila "1 de 2") e como filtro
"Esperando" na lista. Quem tem três pedidos em três conversas abre três conversas, uma por vez,
sem ver o conjunto nem qual espera há mais tempo.

## O que já existe e vai ser reusado (nada de caminho novo)

| Peça | Onde | Papel na página |
|---|---|---|
| Tabela `handoffs` | banco, realtime com replica FULL | fonte da lista: `closed_at is null`, ordem `opened_at` |
| `fecharPedido` | `lib/handoffs.ts` | quem fecha, via as rotas abaixo (a página nunca chama direto) |
| Orientar | `POST /api/conversations/orientar` `{ phone, instruction, pedidoId }` | fecha como `ia`, a IA responde na hora |
| Responder | `POST /api/send` `{ phone, text, pedidoId }` | fecha como `resolvido`, a IA fica pausada (quem respondeu assumiu) |
| Resolvido | `POST /api/conversations/resolve` `{ phone, pedidoId }` | fecha sem mandar nada |
| Caixa de escrita com pedido | `MessageComposer` prop `pedido` | as três saídas, com o mesmo desenho da conversa |
| Filtro "Esperando" | `ContactSidebar` (`needsYou`) | continua; a página não substitui, complementa |
| Limiar de espera | `ESPERA_AVISO_MS` (2h), `lib/painel.ts` | a partir dele a espera fica âmbar, igual ao painel |
| Número de avisos fora | `semNumeroDeAvisos`, `lib/avisos.ts` | vale aqui também (regra de toda lista) |

## A página

**Rota `/pedidos`**, dentro do `(app)`. Lê com a sessão do usuário (RLS por tenant), como o inbox.

**Uma linha por pedido aberto, de TODAS as conversas, do mais antigo para o mais novo.** Cada linha:
- **Espera** ("há 6h"), âmbar acima de 2h. É a primeira coluna porque é o que decide a ordem.
- **Cliente**: nome (`display_name`, senão `nomewpp`, pelo `cleanName`) ou telefone formatado.
- **Resumo** do pedido (o `summary` que a IA escreveu).
- **"2 de 3"** quando a mesma conversa tem mais de um pedido na fila.
- Link **"Abrir conversa"**.

**Agir na própria linha.** Clicar na linha a EXPANDE (uma por vez):
1. **As últimas mensagens da conversa** (até 6, só leitura, com as peles de balão do `Thread`), para
   quem vai orientar saber o que o cliente disse sem sair da página. É aqui que a página fica melhor
   que a Central de avisos do Deskcomm, que avisa e manda para outro lugar: aqui o contexto e a
   ação moram juntos.
2. **O mesmo `MessageComposer` com a prop `pedido`**: abre em "Orientar a IA", troca para
   Responder, e tem "Resolvido" ao lado. Nada de caixa nova (decisão do dono de 29/09 na bancada:
   "mostrar de um jeito na montagem e de outro quando funcionar não é bom"). Anexo e respostas
   rápidas seguem valendo, porque é o mesmo componente.
3. **Depois de agir, a página diz o que aconteceu** ("Orientado. A IA respondeu ao cliente.",
   "Marcado como resolvido.") e o pedido sai da lista. Se a rota de orientar devolver
   `enviado: false`, a frase diz que a IA usa a orientação na próxima mensagem do cliente (é o que a
   rota faz nesse caso), em vez de fingir que respondeu. ⚠️ Mudou do plano: mostrar O TEXTO que a IA
   mandou exigiria a rota de orientar devolver as mensagens; ficou para quando o histórico existir.

**Tempo real:** assina `handoffs` (INSERT e UPDATE) e re-busca; `.subscribe()` com callback,
primeira assinatura pulada, refetch no foco (as duas regras de realtime do `CLAUDE.md`).

**Vazio:** "Nenhum pedido esperando. Quando a IA pedir ajuda, ele aparece aqui e no WhatsApp de
avisos." Sem destino de avisos configurado, a mesma frase ganha o link para configurar (dono).

**Celular:** lista de uma coluna, a linha expandida ocupa a largura, a caixa de escrita no pé da
linha. Medido em 375.

## O link "Abrir" do aviso (DECISÃO SUA)

| Opção | Prós | Contras |
|---|---|---|
| **A. A conversa** (`/inbox/{telefone}`, o que o item 1 já manda hoje) | contexto completo; a caixa já mostra o pedido com as três saídas | não mostra os outros pedidos esperando |
| **B. A página, com a linha do pedido já aberta** (`/pedidos?abrir={id}`) | é o que o plano vigente diz ("o aviso leva direto para ela"); a pessoa age e já vê o que mais espera | precisa do id do pedido no aviso (hoje o insert em `handoffs` não devolve o id: ajuste de uma linha no `processTurn`) |

**Recomendo B.** O aviso fala de UM pedido, mas quem abre pelo celular quer resolver e saber se
tem mais; a linha aberta traz o contexto que faria falta, e "Abrir conversa" continua a um toque.

⚠️ **Achado que vale para as duas opções:** o login **não volta para o endereço pedido**. O
`proxy.ts` manda para `/login` sem guardar o caminho, e o login leva para a tela inicial. Quem
abrir o link do aviso deslogado no celular cai no painel, não no pedido. Proposta: o proxy passa
`?next=` e o login só aceita caminho interno (começa com `/` e não com `//`). Entra junto, se você
aprovar.

## Onde entra no menu (DECISÃO SUA)

| Opção | Como fica | Leitura |
|---|---|---|
| **A. Item próprio "Pedidos"** entre Painel e Conversas, com número âmbar dos abertos | no celular, entra na barra de baixo no lugar do Pipeline (que vai para "Mais") | a coisa que o produto existe para não deixar esquecer fica a um toque, com contador |
| **B. Dentro de Conversas**, como uma segunda visão no topo da lista ("Conversas \| Pedidos") | sem item novo no menu | menos espalhado, mas some para quem não abre Conversas |
| **C. Fora do menu**: entra pelo aviso, pelo número "esperando" do cabeçalho do painel (vira link) e pelo chip "Esperando" | nada muda no menu | mais enxuto, e depende de a pessoa lembrar que existe |

Recomendo **A**, com o contador âmbar (que é cor de estado, e aqui o estado é "tem gente
esperando"). Em qualquer opção, o "N esperando" do cabeçalho do painel vira link para a página.

## Perguntas menores (decisão sua, com a minha sugestão)

1. **Conta bloqueada (assinatura):** a página abre só para leitura, como o `/inbox`, ou fecha como
   as páginas pagas? Sugestão: leitura, igual ao inbox (as rotas já respondem 402 a qualquer ação).
2. **Atendente vê todos os pedidos** ou só os das conversas dele e sem responsável? Sugestão:
   todos, igual ao filtro "Esperando" de hoje.
3. **Resolvidos recentes** (últimas 24h) recolhidos no pé da página, para conferir o que a IA fez
   com cada orientação? Sugestão: não agora; entra com o "motivo do pedido" (P1, item 3).

## Fora deste passo

- Radar de conversas esfriando (sacada 5 do Deskcomm): é o P3, item 14. A página só trata pedido
  aberto pela IA.
- Motivo do pedido e "salvar orientação como regra": P1, itens 4 e 5 (renumerados em 30/09, quando a tela de Clientes entrou como item 3).
- Qualquer mudança no n8n.

## Testes

- `sem-login`: preview `/design/pedidos` com dado falso (três pedidos, dois na mesma conversa,
  um acima de 2h): ordem, "2 de 3", âmbar, linha expande com contexto e a caixa com as três saídas,
  vazio, sem travessão e sem segmento, 375 e 1440.
- `logado-serial` (semente de sempre, telefone impossível): pedido semeado aparece; **Resolvido**
  pela página fecha no banco pelo `POST /resolve`; **orientar** pela página fecha como `ia` pelo
  `POST /orientar` (o envio vai pelo n8n "CRM Envio IA": sem `N8N_IA_SEND_WEBHOOK_URL` no ambiente
  local a rota cai na orientação pendente, que é o que o teste confere, e nada vai ao WhatsApp).
  **Responder** pela página não é testado: o `/api/send` manda WhatsApp de verdade pelo n8n.
- Se B for escolhido: aviso com `?abrir={id}` abre a linha certa; login com `?next=` volta para ela
  e recusa `//exemplo.com`.
- Depois de rodar: apagar a conversa `5500000000001` (SQL no topo de `e2e/semente.ts`).
