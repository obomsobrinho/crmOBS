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

**Suspeita a confirmar antes de mexer:** a rodada de design de 18/09 acrescentou sombra de painel na
casa do composer e mudou superfícies; a sombra de rolagem provavelmente está sendo desenhada sobre
uma superfície que agora tem outra cor, e o que era degradê virou bloco. **Reproduzir nos DOIS temas
antes de alterar valor**, porque os tokens são diferentes por tema e o print veio do claro.

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
