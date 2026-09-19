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

## Sombra

| token | claro | escuro |
| --- | --- | --- |
| `--panel-shadow` | `0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.04)` | `none` |
| `--bubble-shadow` | `0 1px 1.5px rgba(11,20,26,.1)` | `none` |

**No escuro não existe sombra**: a separação vem de superfície e linha. No claro a sombra é
obrigatória no balão, senão branco sobre a conversa dá 1,05:1 e some.

**Sombra de rolagem** (`.sombra-rolagem`, com `data-borda="topo|fundo"` e `data-visivel="sim|nao"`)
acende na borda de cima da conversa quando ela passa por baixo do cabeçalho, e na de baixo enquanto
sobra conversa atrás da caixa de escrita. É o que diferencia "acabou" de "tem mais, continue
rolando".

⚠️ **Não é `box-shadow`, e isso mudou em 19/09/2026 por causa de um defeito.** Eram duas sombras de
caixa, uma no `<header>` da conversa e outra no bloco do composer. `box-shadow` pinta para FORA do
elemento, então ela caía em cima de quem estivesse ao lado: com a faixa "O cliente quer" entrando
entre o cabeçalho e a conversa (18/09), a sombra do cabeçalho, que tem `z-10`, era desenhada sobre
uma superfície opaca com borda própria, e o resultado lia como uma faixa cinza com borda, não como
sombra. Hoje é **um elemento absoluto por borda, DENTRO da própria área que rola**: 8px de degradê
translúcido (`--sombra-rolagem-cor`, um valor por tema), que não tem como invadir o vizinho. Quem
desenha a divisão continua sendo o `border-b` do cabeçalho.

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
