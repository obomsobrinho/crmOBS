# Plano: ajustes do atendimento (19/09/2026)

Cinco ajustes que o dono levantou depois de usar a tela redesenhada. **As quatro decisões dele já
estão travadas neste documento**, então este plano é para executar, não para reabrir.

Ordem sugerida: 5, 1, 3, 2, 4. Do que muda comportamento para o que muda pixel, porque o primeiro
tem consequência em banco e os últimos não.

---

## 1. A sombra de rolagem está bugada (cabeçalho e chat)

**Print:** `docs/esbocos/bug-sombra-rolagem.png`.

**Sintoma:** o dono mandou print do campo de escrita com uma faixa cinza clara grande acima dele,
com borda visível, em vez de uma sombra. Ele diz que acontece nos dois lugares: no cabeçalho da
conversa e na área de mensagens.

**Onde mora:**
- `components/Thread.tsx`, duas aplicações: `sombra-rolagem` no `<header>` quando `rolou`, e
  `sombra-rolagem-topo` no bloco do composer quando `temMais`.
- `app/globals.css`, tokens `--sombra-rolagem` e `--sombra-rolagem-topo` (valores diferentes por tema).
- `components/ui/scroll-area.tsx`, a máscara `fade` (gradiente com `ESMAECIMENTO`), que atua na MESMA
  região e pode estar somando com a sombra.

⚠️ **São DUAS sombras, e o dono localizou as duas** (19/09, depois do print): uma **em cima do
cabeçalho** e outra **logo abaixo da faixa "O cliente quer"**. Ele confirmou que **acontece nos dois
temas** e que **resolver no claro resolve no escuro**, então não é calibragem de token por tema.

Duas sombras em sequência apontam para empilhamento: o `<header>` e a faixa do entendimento são
irmãos, os dois `shrink-0` com `z-10`, e a faixa entrou DEPOIS (18/09), entre o cabeçalho e a área
rolável. A sombra que era do cabeçalho passou a cair sobre a faixa, e a faixa virou uma segunda borda
com sombra própria. Conferir também se o `fade` do `ScrollArea` (máscara com `ESMAECIMENTO`) está
somando com elas na mesma região: três degradês empilhados explicam a "faixa cinza com borda" do
print melhor que qualquer valor de token.

**Quem deve ter sombra é UM elemento só**, o último antes da área que rola. Provável conserto: a
sombra sai do cabeçalho e passa para a faixa quando ela existe, em vez de os dois a desenharem.

**Como fechar:** a sombra é sinal de "tem conteúdo além da borda". Ela pode sumir, mas a informação
não: se o degradê não funcionar sobre a superfície nova, trocar por uma linha de 1px que aparece só
quando há conteúdo cortado é aceitável e mais honesto que uma sombra que lê como caixa.

**Teste:** medir, com a conversa rolada, que o elemento de sombra não tem `height` maior que alguns
pixels e que a cor dele não é sólida. Teste que só conta a classe não pega nada, que é como o defeito
chegou até aqui.

---

## 2. Filtro por período na lista de conversas

**Decisão do dono:** **"Hoje" é o padrão ao abrir**, mais um seletor com **Hoje / 7 dias / Tudo**.
Os chips de estado que já existem (Todas, Esperando, Sem resposta, Suas) continuam.

**Motivo dele:** "não faz sentido eu querer ficar vendo todas as conversas". Hoje a lista abre com 48.

⚠️ **Regra que NÃO está em aberto e é a parte perigosa deste item: quem espera por você nunca some
pelo filtro de tempo.** Uma conversa com handoff aberto desde ontem tem que aparecer mesmo no recorte
"Hoje", senão o recorte esconde exatamente o que o produto existe para não deixar esquecer. O grupo
"Esperando você" ignora a janela; os outros dois grupos a respeitam.

**Onde mora:** `components/ContactSidebar.tsx` (o `results` e a barra de filtros). O dado é
`InboxItem.lastMessageAt` mais `handoffAt`.

**Cuidados:**
- A janela é rolante e em **America/Sao_Paulo**, como todo o resto do projeto ("hoje" é o dia civil
  daqui, não as últimas 24h). Já existe precedente em `lib/periodo.ts` e `lib/valor.ts`.
- A contagem dos chips passa a ser DENTRO da janela, senão o chip diz 12 e a lista mostra 3.
- A busca ignora a janela: quem digita um nome quer achar a pessoa, não filtrar por data.
- O seletor de período é controle novo na faixa; ele e os chips não podem virar duas fileiras que
  empurram a busca para baixo (o desenho já tinha esse problema, e a busca subiu por causa disso).

**Teste:** com dado falso de ontem e de hoje, o padrão mostra só o de hoje; a conversa com handoff de
ontem aparece assim mesmo; trocar para "Tudo" traz o resto; o número do chip bate com o que a lista
mostra.

---

## 3. A edição dos dados do contato não parece editável

**Sintoma do dono:** "custei perceber que podia digitar ali".

**Decisão:** ele autorizou resolver sem revisão prévia.

**Direção:** o campo tem que ter cara de campo antes do clique, e não virar campo só depois dele.
Moldura leve, altura de controle, placeholder que diz o que fazer ("Adicionar"), e cursor de escrita
no hover. Vale para o nome, para os campos personalizados e para o "+ Adicionar campo".

**Onde mora:** `components/ContactFields.tsx`.

⚠️ **Não desfazer a tabela de pares** que a rodada de 18/09 entregou (rótulo à esquerda, valor à
direita, fio por linha): o alinhamento à direita é o que faz os valores formarem uma segunda margem.
O ajuste é de affordance, não de arranjo.

**Teste:** o campo tem moldura e placeholder antes de qualquer interação, medido por estilo
computado, e não só depois do foco.

---

## 4. Fundo de rede neural atrás das mensagens

**Decisão do dono:** **só atrás das mensagens, bem discreto, nos dois temas** (no escuro mais apagado
ainda). Não entra em cabeçalho, lista nem painel do cliente.

**Esboço:** `docs/esbocos/fundo-rede-neural.webp`, que ele gerou (rede de nós com ícones do domínio: robô, balão de conversa,
etiqueta, funil, cérebro, gráfico, fone, pessoa, raio, check). Ele disse que é esboço e que aceita
ideia melhor.

**Direção:** SVG que se repete como `background-image`, desenhado com `currentColor` ou token, nunca
imagem rasterizada (tem que virar em tema claro/escuro e não pode pesar no bundle).

**Cuidados:**
- **Contraste dos balões vence o fundo.** Se o padrão comprometer a leitura do texto dentro de um
  balão, ele perde, não o texto.
- O padrão não pode "andar" com a rolagem de um jeito que chame atenção: fundo fixo na área, com o
  conteúdo rolando por cima.
- `prefers-reduced-motion` não se aplica (é estático), mas **teste de contraste sim**.

**Teste:** o fundo existe atrás da área de mensagens e NÃO existe no cabeçalho, na lista nem no
painel do cliente; o texto do balão mantém contraste.

---

## 5. IA e humano não podem atender a mesma conversa

**Decisão do dono, e é a mais importante deste plano:** **assumir PAUSA a IA**, e **religar a IA
limpa o responsável**. Os dois estados deixam de coexistir **no banco**, não só na tela.

**Por quê:** hoje dá para ter a conversa atribuída a alguém com a IA ligada, e a tela mostra as duas
coisas. O dono: "se eu ativei o atendimento da IA isso fica com ela e não comigo".

**O que já acontece hoje e ajuda:** responder manualmente pelo CRM já pausa a IA (nó
`Pausar IA (Franck digitou)` do n8n). Ou seja, a atribuição passa a se comportar como o envio manual
já se comporta.

**Onde mora:**
- `components/ConversationView.tsx`: `assign` (atribuir) e `toggleIa` (chave da IA).
- `lib/crm.ts`: `quemAtende` já devolve `ia` quando não está pausada, então a REGRA de exibição já
  está certa; o que muda é o estado no banco.
- Escrita: `dados_cliente.atendimento_ia` (browser, grant de coluna) e `conversations.assigned_user_id`
  (browser, grant de coluna). Os dois já são escritos pelo browser hoje, então não precisa de rota nova.

⚠️ **Consequências que precisam estar no código com comentário, porque surpreendem:**
1. **Resolver um handoff religa a IA** (`POST /api/conversations/resolve`). Pela regra nova, resolver
   passa a limpar o responsável junto. Se isso não for feito, o estado contraditório volta pela porta
   dos fundos.
2. **Atribuir a um colega** (não a si mesmo) também pausa a IA. É o mesmo gesto: a conversa passou a
   ser de uma pessoa.
3. **Soltar a conversa** (tirar o responsável) NÃO religa a IA sozinha. Quem religa é a chave, de
   propósito: soltar sem religar é um estado legítimo ("ninguém atende"), e é o estado que o projeto
   já mostra como dívida visível.

**Teste:** atribuir com a IA ligada deixa a IA pausada e o responsável definido; religar a IA deixa o
responsável nulo; e a tela nunca mostra os dois ao mesmo tempo, em nenhum dos dois caminhos.

---

## Como fechar cada item

Verificação, sempre com `E2E_PORT=3000` (há dev server na 3000; subir outro falha):

```
npx tsc --noEmit
npx eslint .
npm run build
E2E_PORT=3000 npx playwright test --project=sem-login
E2E_PORT=3000 npx playwright test --project=setup --project=logado --project=atendente --project=logado-serial --workers=2
```

Linha de base em 19/09/2026: **143 sem login**, **26 com login e 1 pulado**.

⚠️ `npm run test:e2e:ia` **não entra**: nada aqui toca a base do prompt, o guardrail ou o modelo, e
são 12 chamadas pagas.

**Commit por item fechado**, na linguagem do repositório (o porquê, o que mudou, como foi provado).
**Não dar push sem o dono pedir**: push dispara deploy na Vercel.

---

## Execução (19/09/2026)

Os cinco entraram, na ordem sugerida (5, 1, 3, 2, 4), um commit por item, sem push. Verificação a
cada item: `npx tsc --noEmit`, `npx eslint .`, `npm run build` e as duas suítes. Fecharam em **160
sem login** (eram 143, mais 17 novos em `e2e/atendimento.design.spec.ts`) e **26 com login, 1
pulado**, igual à linha de base. `npm run test:e2e:ia` não entrou, como combinado.

Testes antigos que afirmavam o comportamento anterior foram ATUALIZADOS com o motivo escrito
dentro, nenhum apagado: o marcador do campo de nome (`telas.design.spec.ts`) e os dois que
procuravam o texto "6h" (`handoff.design.spec.ts`, `ajustes.design.spec.ts`), que passaram a
afirmar a FORMA do tempo no chip de espera. Dois testes com login (`resolver.auth.spec.ts`,
`realtime.serial.spec.ts`) passaram a escolher "Tudo" antes de usar a lista: o tenant de teste é o
número parado do dono, e num dia sem mensagem nova eles falhariam acusando defeitos que não existem.

### O que foi além do que o plano pedia, e por quê

- **Item 5 pegou um TERCEIRO caminho que o plano não lista: orientar a IA pelo coach.**
  `instruct` grava `atendimento_ia = 'reativada'`, ou seja, religa a IA. Pelo mesmo argumento que o
  plano usa para o botão Resolvido ("senão o estado contraditório volta pela porta dos fundos"), ele
  larga o responsável junto. É a porta que ninguém lembra que religa.
- **Item 5 mexeu no mock da `/design`.** Ele montava a conversa com `atendimentoIa="ativa"` E um
  responsável, que é exatamente o estado que o produto não produz mais, e ainda discordava da
  própria lista ao lado (que já pintava aquele contato como "Você assumiu · IA pausada").
- **Item 3 devolveu a moldura ao "+ Adicionar campo"**, revertendo uma decisão de 18/09. O argumento
  de então era que num bloco de linhas sem moldura nenhuma o botão emoldurado seria o elemento mais
  pesado; com as linhas emolduradas o argumento se inverteu.
- **Item 2 reescreveu as datas do mock da lista** para serem relativas a agora e ancoradas na
  meia-noite de São Paulo. Com as datas fixas de julho, a lista abriria permanentemente vazia; com
  "x horas atrás", cairia em ontem se o preview fosse aberto às 01h.

### Uma pergunta para o dono, e ela não travou nada

**O período escolhido não é lembrado entre sessões.** Quem abrir o CRM sempre começa em "Hoje", mesmo
que tenha passado o dia inteiro em "Tudo". Isso é intencional por enquanto, porque o plano trava
"Hoje é o padrão ao abrir" e guardar a escolha (em `localStorage`) contradiz isso na segunda visita.
Se a intenção era "Hoje na primeira vez, depois o que eu deixei", é uma linha de código, mas é
decisão de produto e não de aplicação: fica aqui em vez de eu resolver sozinho.

---

## Segunda rodada do item 4 (19/09/2026)

O dono voltou com um print do composer: "o sombreamento de cima ficou bom, mas do chat ainda está
ruim, as laterais estão ruins".

⚠️ **Não era a sombra, era a TEXTURA.** Provado escondendo o SVG no navegador: com
`display:none` no `.fundo-rede`, a borda acima da caixa de escrita fica limpa, sem faixa nenhuma. A
conversa e o composer têm a MESMA superfície (`bg-msg`), então na linha onde uma acaba e a outra
começa a única coisa que mudava era a textura ligar e desligar. Um corte seco de textura sobre
superfície contínua lê como faixa cinza atravessando o cartão, e foi isso que ele viu.

E "as laterais" é o mesmo defeito pelo outro eixo: em 1920 com as colunas laterais fechadas, a
conversa passa de 1690px enquanto a coluna de leitura tem 960, então sobravam ~365px de superfície
vazia dos dois lados com textura em cima e nada por cima dela. **Fundo é o que passa por trás do
conteúdo; onde não há conteúdo, é só sujeira.**

Três mudanças:

1. **A textura dissolve nas quatro bordas** (`mask-image` com dois degradês cruzados por
   `mask-composite: intersect`). Ela some antes de chegar na borda, e não existe linha para ver.
2. **A textura tem a largura da coluna de leitura** (960px, centrada). As calhas ficam limpas.
3. **A sombra de baixo tem a largura de quem a projeta**, que é a caixa de escrita (960px, branca,
   centrada), e não a do cartão. A de cima continua de ponta a ponta porque o cabeçalho também é.

**Sobre o componente pronto: não existe.** O shadcn tem um utilitário `scroll-fade` (máscara por
scroll-driven animations, sem JS), que é o mesmo trabalho que a prop `fade` do nosso `ScrollArea` já
faz e que não resolveria nada disto: o defeito não era o esmaecimento, era a textura. E não há
componente de padrão de fundo. Adotar o `scroll-fade` seria trocar código nosso equivalente por uma
dependência, então ficou de fora.

Testes: o que afirmava "a textura tem a largura da área" foi ATUALIZADO com o motivo (o que ele
sempre quis dizer é "cobre a conversa e nada além dela", agora medido como contenção), e entraram
três novos: a máscara existe nos dois eixos e cruza, em 1600 com a coluna do cliente fechada a
textura fica em 960 centrados dentro de uma área maior, e a sombra de baixo tem exatamente o
retângulo da caixa de escrita enquanto a de cima tem o do cabeçalho.

---

## Terceira rodada do item 1 (19/09/2026)

"Está bem mais ou menos." O print mostrava o balão sendo **fatiado** por uma linha reta na borda da
caixa de escrita.

⚠️ **O esmaecimento estava ligado, só que curto demais.** Medido: `ESMAECIMENTO` do `ScrollArea` é
28px e o balão desta tela tem **65px** em média (o do print tinha 77). Em 28px o balão ainda está em
quase metade da opacidade quando a borda chega, então ele não dissolve, ele é cortado. **A regra que
saiu disso: a dissolução tem que ser MAIOR que o item que ela dissolve.** 28px serve para lista de
texto sobre superfície lisa, que é o resto da aplicação; não serve para um item alto, opaco, com cor
e borda próprias.

Três mudanças:

1. **`fade` do `ScrollArea` aceita número.** A conversa passa 80px; todo o resto segue nos 28.
2. **A sombra de baixo saiu inteira**, e `temMais` com ela. Quem avisa que sobrou conversa embaixo é
   a dissolução, que já só aparece quando há conteúdo escondido. Duas marcas para o mesmo fato, no
   mesmo lugar, era o que ele lia como sujeira. A de cima ficou, porque lá existe mudança real de
   superfície (cabeçalho branco, conversa não) e ele já tinha dito que essa estava boa.
3. **A caixa de escrita ganhou respiro no topo** (`pt-3`). Sem ele a caixa branca começava no ponto
   exato em que a conversa termina, e as duas coisas viravam uma linha só.

Testes: entrou um que mede a dissolução contra a altura média do balão (é a regra, não o número), e
os que afirmavam a sombra de baixo foram atualizados ou substituídos, com o motivo escrito dentro.
