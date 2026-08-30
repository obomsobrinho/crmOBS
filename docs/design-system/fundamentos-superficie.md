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

A tela de atendimento tem tokens próprios (`--s-menu`, `--s-conteudo`, `--s-msg`, `--s-campo`,
`--s-bloco`), e a contenção é o ponto: **lista, conversa e painel dividem `--s-conteudo`**, e o
que separa as colunas é uma linha de 1px, **nunca meio tom**.

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

## Duplicação conhecida

⚠️ **`--raised` e `--s-conteudo` têm o MESMO valor nos dois temas** (`#ffffff` no claro, `#171717`
no escuro). Dois nomes, uma cor. O painel usa `bg-raised` (6 usos), o resto do app usa
`bg-conteudo` (18 usos). Medido em 30/08/2026, sem decisão ainda. Ver
[pendencias.md](pendencias.md).

## Utilitários de superfície sem nenhum uso

Existem no `@theme` e não são chamados por ninguém: `bg-sunken`, `bg-inset`, `bg-lista`,
`bg-composer`, `bg-sub`, `bg-painel`, `bg-chat`. Contados em 30/08/2026.

## Legado ainda em uso

`--surface` (4 usos) e `--panel` (1 uso, o badge "dia"). A migração deles está escrita e
**aguardando decisão do dono do produto**, porque mexe em pixels de uma tela já aprovada.

## Sombra

| token | claro | escuro |
| --- | --- | --- |
| `--panel-shadow` | `0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.04)` | `none` |
| `--bubble-shadow` | `0 1px 1.5px rgba(11,20,26,.1)` | `none` |

**No escuro não existe sombra**: a separação vem de superfície e linha. No claro a sombra é
obrigatória no balão, senão branco sobre a conversa dá 1,05:1 e some.

**Sombra de rolagem** (`.sombra-rolagem` / `.sombra-rolagem-topo`) acende sob o cabeçalho quando a
conversa passa por baixo, e acima da caixa de escrita enquanto sobra conversa embaixo. É o que
diferencia "acabou" de "tem mais, continue rolando". É classe própria, e não `shadow-[var(--x)]`,
porque o utilitário do Tailwind compõe a sombra a partir das partes dele e não aceita uma lista
pronta vinda de variável: o valor chegava zerado.

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
