# Fundamentos: superfície

## As quatro camadas

| token | claro | escuro | papel |
| --- | --- | --- | --- |
| `--canvas` | `#f4f4f4` | `#0a0a0a` | o fundo da janela |
| `--sunken` | `#ececec` | `#0d0d0d` | recuado: menu, área de mensagens |
| `--raised` | `#ffffff` | `#171717` | elevado: cartão |
| `--inset` | `#f4f4f4` | `#1f1f1f` | encaixado: campo, bloco dentro do cartão |

⚠️ **A hierarquia INVERTE entre os temas, e isso é a decisão, não um efeito colateral.** No claro
o cartão SOBE (branco) e a conversa recua; no escuro o cartão é mais claro que o fundo e a
conversa é o ponto mais escuro da tela. É o que faz a área de mensagens ler como fundo nos dois
temas **usando a mesma marcação**.

Um único `surface` não dava conta de menu, lista, conversa, composer e painel ao mesmo tempo.

## Superfícies nomeadas por função

A tela de atendimento tem tokens próprios (`--s-menu`, `--s-msg`, `--s-campo`, `--s-bloco`), e a
contenção é o ponto: **lista, conversa e painel dividem `--raised`**, e o que separa as colunas é
uma linha de 1px, **nunca meio tom**.

A versão anterior dava um cinza de matiz diferente para cada coluna (lavanda, quase branco,
cinza) e o resultado lia como escolha aleatória em vez de hierarquia. A mesma crítica derrubou o
`--s-bloco` lavanda: bloco e campo tinham 1 unidade de diferença, então a tela clara inteira lia
como roxo chapado.

**Escada de três degraus no claro:** cartão branco, bloco cinza (`--s-bloco` `#f4f4f4`), campo
branco com borda (`--input-bg` `#ffffff`).

## Cartão dentro de cartão: não

O atendimento tem **três** cartões (menu, lista de conversas, conversa com os detalhes do
contato). **Dentro de um cartão a separação é linha de 1px, nunca outro cartão.** É por isso que
`components/ui/card.tsx` não tem `CardHeader` nem `CardFooter`: eles empilhariam moldura dentro de
moldura.

## A faxina de 30/08/2026

Três coisas saíram, e nenhuma mudou um pixel (o retrato numérico de 12 telas nos dois temas,
4812 elementos, ficou idêntico fora o spinner que gira):

- **`--s-conteudo` deixou de existir.** Tinha o MESMO valor de `--raised` nos dois temas
  (`#ffffff` / `#171717`), e dois nomes para uma cor é como uma mudança de superfície passa a
  exigir dois lugares para não divergir. Ficou `raised`, que é o nome do SISTEMA; `conteudo` era
  da nomenclatura antiga, por função. Os 17 usos de `bg-conteudo` viraram `bg-raised` e a ponte do
  shadcn (`--card`, `--popover`) foi reapontada.
- **Oito utilitários sem nenhum consumidor**: `bg-sunken`, `bg-inset`, `bg-lista`,
  `bg-lista-sel`, `bg-composer`, `bg-sub`, `bg-painel` e `bg-chat`. Utilitário disponível é
  convite a compor camada que o sistema não tem.
- **O legado `--surface` e `--panel`.** A tag do contato foi para `bg-raised` e o separador de dia
  da conversa foi para `bg-bloco`; os dois destinos já tinham exatamente o mesmo valor da origem.

## Textura

**Fundo de rede neural** (`components/FundoRede.tsx`, classe `.fundo-rede`, token `--rede-forca`).
Uma rede de nós ligados por fios, com ícones do domínio dentro de alguns nós, atrás da ÁREA DE
MENSAGENS e de mais nada: não entra em cabeçalho, lista nem coluna do cliente. Força 7,5% no claro e
5% no escuro, na cor da marca.

É o único lugar do sistema com textura, e ele obedece a seis regras. As duas últimas nasceram de um
segundo retorno do dono no mesmo dia, e as duas são a MESMA ideia dita de dois jeitos: **fundo é o
que passa por trás do conteúdo, e nunca deve ser visto sozinho.**

1. **SVG em `currentColor`, nunca imagem rasterizada.** Um raster não vira com o tema e ainda pesa
   no bundle para servir de textura de 7%.
2. **`<pattern>`, e não `background-image` com data URI.** Data URI não lê variável de CSS, então a
   alternativa seria repetir o SVG inteiro no `globals.css`, uma vez por tema.
3. **Não rola.** É absoluto no contêiner da conversa, irmão do ScrollArea, e o conteúdo passa por
   cima. Padrão que anda com a rolagem chama atenção, e a decisão é discrição.
4. **O balão vence o fundo, por construção.** Todo balão tem superfície OPACA, então o padrão só
   pinta o vão entre balões e nunca fica atrás de texto. Há teste travando isso.
5. **Dissolve nas quatro bordas** (`mask-image` com dois degradês cruzados por `mask-composite`).
   ⚠️ Na primeira versão ela ia de ponta a ponta e ACABAVA em corte seco onde a caixa de escrita
   começa. Como a conversa e o composer têm a MESMA superfície, a única coisa que mudava naquela
   linha era a textura ligar e desligar, e o resultado era uma faixa cinza atravessando o cartão,
   que o dono leu como sombra quebrada. Provado escondendo o SVG: a borda fica limpa.
6. **Tem a largura da COLUNA DE LEITURA** (960px, centrada), e não a do cartão. Em tela larga com as
   colunas laterais fechadas sobram centenas de pixels de superfície vazia dos dois lados, e lá a
   textura não fica atrás de nada: fica sozinha. Onde não há conteúdo, textura é sujeira.

**A regra que sai de (6) e vale além da textura: a sombra tem a largura de quem a projeta.** A de
cima é de ponta a ponta porque o cabeçalho é; a de baixo acompanha os 960px porque quem a projeta é a
caixa de escrita, branca e centrada. Na largura toda, ela atravessava as laterais vazias, onde acima
e abaixo existe a mesma superfície e nada que projete coisa nenhuma.

## Sombra

| token | claro | escuro |
| --- | --- | --- |
| `--panel-shadow` | `0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.04)` | `none` |
| `--bubble-shadow` | `0 1px 1.5px rgba(11,20,26,.1)` | `none` |

**No escuro não existe sombra**: a separação vem de superfície e linha. No claro a sombra é
obrigatória no balão, senão branco sobre a conversa dá 1,05:1 e some.

⚠️ **SOMBRA DE ROLAGEM NÃO EXISTE MAIS** (19/09/2026). Fica registrado porque foram três tentativas
no mesmo dia, e a última é a conclusão, não mais uma variação.

1. Eram duas `box-shadow`, uma no `<header>` da conversa e outra no bloco do composer. `box-shadow`
   pinta para FORA do elemento, então ela caía em cima do vizinho: com a faixa "O cliente quer"
   entrando entre o cabeçalho e a conversa (18/09), a sombra do cabeçalho, que tem `z-10`, era
   desenhada sobre uma superfície opaca com borda própria, e o resultado lia como faixa cinza.
2. Viraram um elemento absoluto por borda, DENTRO da área que rola, onde não têm como invadir
   ninguém. Resolveu o vazamento e não resolveu a leitura: a de baixo continuava lendo como risco
   solto, porque ali não há mudança de superfície nenhuma (conversa e composer são a mesma).
3. Saíram as duas. **Quem diz "tem mais conversa deste lado" é a DISSOLUÇÃO** (a prop `fade` do
   `ScrollArea`), que já só aparece do lado que tem conteúdo escondido. O que separa o cabeçalho da
   conversa é o `border-b` dele, que sempre esteve lá.

**Duas regras saem daí, e valem para qualquer borda de área rolável:**

- **Um sinal por fato.** Se a dissolução já diz que há conteúdo escondido, uma sombra em cima dela é
  ruído. Foi assim que ela foi parar em dois prints do dono.
- **A dissolução tem que ser MAIOR que o item que ela dissolve.** O padrão do `ScrollArea` é 28px e
  serve para lista de texto sobre superfície lisa; a conversa passa 80px porque o balão dela tem
  65px em média. Em 28px o balão ainda está em quase metade da opacidade quando a borda chega: ele
  não dissolve, ele é **fatiado**, com o corte reto no meio de uma linha de texto. Por isso `fade`
  aceita um número, e quem tem item alto e opaco passa o seu.

## Tema

Vem de **cookie**, escrito como `data-theme` no `<html>` (`app/layout.tsx`), e não de
`prefers-color-scheme`. Quem traduz isso para o `dark:` do Tailwind é a primeira linha do
`globals.css`:

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

Sem ela, `dark:` não casaria com nada e a camada base ficaria clara no escuro.

⚠️ **A ponte para os nomes do shadcn (`--background`, `--card`, `--primary`, ...) é escrita UMA
vez, só em `:root`, e NÃO tem cópia no bloco escuro.** `:root` e `[data-theme="dark"]` casam com o
mesmo elemento com a mesma especificidade, e o bloco escuro vem depois no arquivo: `var(--canvas)`
já resolve para o valor escuro. Uma lista só, impossível de sair de sincronia.
