# Plano: fechar o P0 (ajustes do teste do dono + fatia B de Clientes)

Escrito em **30/09/2026** e **aprovado pelo dono no mesmo dia** (D3 ainda aberta). Junta os 7 itens que o dono achou no
teste com o que falta do P0 (fatia B da tela de Clientes, `docs/plano-clientes.md`).

## Decisões do dono (30/09/2026, não reabrir)

1. **D1:** o pedido deixa **orientar e resolver** ali mesmo; o que sai é o CHAT. O detalhe tem cara
   de ficha de pedido, profissional, e não de uma segunda tela de Conversas. Responder é na conversa.
2. **D2:** o seletor tem que ser o **mesmo componente das abas do Painel** (`Tabs variant="painel"`).
   Vale para avisos e para o período da lista de conversas; chips de filtro com contagem ficam.
3. **D3 (foto): em aberto.** O mercado copia a imagem: o Chatwoot baixa a foto do link e guarda no
   próprio armazenamento (`Avatar::AvatarFromUrlJob`, lido em 30/09/2026), e só baixa de novo quando o
   link muda.
4. **D4:** a regra da faixa de chips vale para Clientes também.
5. **D5:** resolvidos dos últimos 30 dias, mais recente primeiro, com busca por cliente.

## O que o levantamento achou, item por item

| # | Item do dono | O que existe hoje | Proposta |
|---|---|---|---|
| 1 | Pedidos com histórico de resolvidos, em lista, e o selecionado ao lado | `/pedidos` lista só os abertos; a tabela `handoffs` já guarda os fechados (`closed_at`, `closed_how`, `closed_by`, `instruction`) | Lista à esquerda com **Abertos / Resolvidos** e o pedido selecionado à direita, no molde de Clientes. Nenhuma tabela nova |
| 2 | Não abrir o chat dentro do pedido; só o resumo, e "Abrir conversa" para ver o chat | A linha aberta mostra as últimas mensagens e a caixa de escrita inteira | O detalhe mostra o pedido, não a conversa: cliente, o que pediu (resumo), há quanto tempo, "2 de 3 nesta conversa" e **Abrir conversa**. No resolvido: como fechou (a IA com orientação, ou resolvido por alguém), a orientação dada, quem e quando. Ver D1 |
| 3 | A aba de avisos no Agente não segue o padrão do Painel | O "Um número / Um grupo" é um seletor feito à mão (`chip-ativo`), copiado do período da lista de conversas. O Painel usa `Tabs variant="painel"` da camada base | Trocar por `Tabs variant="painel"`. **O mesmo seletor à mão existe em mais 3 lugares** (período da lista de conversas, Clientes e bancada): ver D2 |
| 4 | Número de avisos sem máscara | `Input` livre com placeholder "11 91234-5678" | Máscara `(11) 91234-5678` enquanto digita (só Brasil, porque o 55 já é automático). A regra da máscara vai para um módulo puro e serve também ao "Novo cliente" da fatia B |
| 5 | O que é a lista de grupos | Ela lista os grupos do WhatsApp **em que o número conectado ao agente participa** (a Evolution devolve os grupos do próprio número). Não lista grupos do seu celular pessoal | Trocar o texto de ajuda por algo que diga isso sem ambiguidade: "Os grupos em que o número do agente está. Para usar um grupo novo, adicione o número do agente nele e toque em Atualizar", com o botão Atualizar ao lado |
| 6 | Foto de perfil em Conversas e Clientes | Nada. A Evolution tem `fetchProfilePictureUrl` (devolve o link da foto no WhatsApp) | Possível, com três pontos de atenção: o link do WhatsApp **expira** (dias), quem esconde a foto na privacidade não tem foto, e uma consulta por contato na abertura da lista seria lenta. Ver D3 |
| 7 | Com um filtro só, a faixa de chips não faz sentido | Chips com zero somem, menos "Todas"; sobra a faixa com um chip só | Se só sobrar "Todas", a faixa inteira some. Ver D4 para Clientes |

## Fatias, na ordem proposta (cada uma fecha com teste e commit)

- ✅ **F1, acertos pequenos (itens 3, 4, 5 e 7), feita em 30/09/2026:** abas no padrão, máscara, texto do grupo com
  Atualizar, faixa de chips. Um commit.
- ✅ **F2, página de pedidos refeita (itens 1 e 2), feita em 30/09/2026:** Abertos e Resolvidos, lista mais detalhe ao lado,
  sem chat. As ações continuam passando pelas MESMAS rotas (`/orientar`, `/resolve`); nenhum caminho
  novo.
- **F3, fatia B de Clientes:** "Novo cliente" (rota service_role, telefone com a máscara da F1),
  conversa vazia no cadastro (D6), iniciar conversa com os dois pesos de alerta, a primeira mensagem
  para quem nunca falou não pausa a IA (D7). Teste sem envio real.
- **F4, foto de perfil (item 6):** depois de D3.

Com F1 a F3 o P0 fecha. F4 pode ficar para o começo do beta se o limite apertar.

## Decisões do dono

**D1. O que o detalhe do pedido ABERTO deixa fazer.** O chat sai (item 2). A caixa de escrita tinha
três saídas: Orientar a IA, Responder e Resolvido.
- **A.** Ficam **Orientar a IA** e **Resolvido**; Responder sai (responder é na conversa, pelo
  "Abrir conversa"). Recomendo: orientar é o gesto de quem resolve pedido sem entrar na conversa, e
  é o que o aviso no WhatsApp leva a fazer.
- **B.** Ficam as três, como hoje.
- **C.** Só Resolvido e Abrir conversa, como o Deskcomm (lá não existe orientar).

**D2. O seletor feito à mão existe em 4 lugares** (avisos, período da lista de conversas, filtros de
Clientes e bancada).
- **A.** Trocar só o de avisos agora e anotar os outros.
- **B.** Trocar todos os que são seletor de uma opção (avisos, período das conversas) por
  `Tabs variant="painel"`. Os chips de filtro com contagem (Conversas e Clientes) **não** são abas e
  ficam. Recomendo B: é o que "seguir um padrão" pede.

**D3. Foto de perfil.**
- **A. Guardar o link e renovar quando vencer:** coluna nova em `dados_cliente` (link e data da
  busca), buscado em segundo plano pela lista, renovado depois de alguns dias; link quebrado cai na
  inicial, como hoje. Recomendo: barato, sem guardar imagem de ninguém.
- **B. Copiar a imagem para o nosso Storage:** nunca quebra, mas guarda foto de pessoa (dado
  pessoal, LGPD) e custa armazenamento.
- **C. Deixar para depois do beta.**

**D4. A regra da faixa de chips vale para Clientes também?** Hoje Clientes mostra os 4 chips mesmo
com zero. Recomendo a mesma regra das Conversas (chip com zero some, e a faixa some se sobrar só
"Todos"), para as duas listas se comportarem igual.

**D5. Histórico de resolvidos: até onde?** Recomendo os últimos **30 dias**, do mais recente para o
mais antigo, com a busca por cliente. Tudo desde sempre fica pesado sem trazer uso.
