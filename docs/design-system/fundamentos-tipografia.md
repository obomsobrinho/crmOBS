# Fundamentos: tipografia

Duas famílias, herdadas da OBS sem discussão:

| variável | família | uso |
| --- | --- | --- |
| `--font-sans` | **Manrope** | corpo, o padrão do `<body>` |
| `--font-display` | **Space Grotesk** | `h1`, `h2`, `h3` (regra global) e numeral |

`h1`, `h2` e `h3` já recebem `font-display` e `letter-spacing: -0.01em` por regra global. Para
numeral fora de heading, `font-display` precisa ser escrito na classe.

## Papéis de TEXTO

Tamanho e entrelinha **travados juntos**, para que o mesmo tamanho nunca apareça com dois ritmos.
Piso absoluto da interface: **12px**.

| papel | tamanho / entrelinha | peso | uso |
| --- | --- | --- | --- |
| `text-titulo` | 18 / 24, `-0.01em` | 600 | **título da PÁGINA** ("Painel", "Pipeline", "Agente de IA") |
| `text-cartao` | 16 / 22 | 600 | **título de CARTÃO ou de bloco** ("Movimento", "A operação") |
| `text-corpo` | 15 / 22 | herda | texto de leitura, mensagem |
| `text-apoio` | 13 / 18 | herda | o mais usado da interface |
| `text-legenda` | 12 / 16 | 500 | legenda, metadado |
| `text-rotulo` | 12 / 16, `0.08em` | 600 | **RÓTULO**: caixa alta, `--ink-3` |

### A hierarquia de título, em três níveis

Esta é a regra que o painel fechou em 30/08/2026, e vale no produto inteiro:

1. **`text-titulo` (18)** = título da página. Um por tela.
2. **`text-cartao` (16, caixa normal, `--ink`)** = título de um bloco **com estrutura própria**:
   faixa de cabeçalho com divisor, lista, gráfico. Ex.: "Movimento", "Assuntos em alta",
   "A operação".
3. **`text-rotulo` (12, CAIXA ALTA, `--ink-3`)** = **rótulo de um valor** ("ATENDIDAS SEM VOCÊ"
   rotula o número), ou cabeçalho de um **cartão simples** que vai direto ao conteúdo
   ("PRECISA DE VOCÊ", "A ÚLTIMA RESPOSTA DO AGENTE"), ou de um **sub-bloco recolhível**
   ("LIMITES E QUANDO CHAMAR O TIME").

⚠️ **Os níveis 2 e 3 não são intercambiáveis.** O nível 3 é feito para ser discreto e não competir
com o número ou o conteúdo que apresenta; usá-lo num cartão com gráfico e rodapé faz o nome do
cartão sumir. O nível 2 num rótulo de indicador briga com o próprio numeral.

⚠️ **`text-cartao` chama-se `cartao` e NÃO `bloco` por causa de uma colisão real.** Existe
`--color-bloco` (a superfície `--s-bloco`), e diante de `text-bloco` o Tailwind resolve **cor**,
não tamanho: a regra emitida era `.text-bloco { color: var(--s-bloco) }`. Os três títulos do
painel nasciam com peso 400 e 16px só por herança, e ninguém via porque o `text-ink` ao lado
devolvia a cor certa. **Nome de papel tipográfico não pode repetir nome de cor.**

## Degraus de NUMERAL

**Não são papéis tipográficos.** Escopo fechado, no precedente do `--brand-grad-end`: valem só
para o valor de um cartão de indicador (`StatValor`) e para o numeral do painel. Nunca para texto
corrido, título, rótulo ou botão.

| papel | tamanho / entrelinha | uso |
| --- | --- | --- |
| `text-manchete` | 68 / 68, `-0.03em` | a manchete de valor do painel |
| `text-destaque` | 44 / 48, `-0.025em` | o número do movimento |
| `text-numero` | 32 / 36, `-0.02em` | cartão de indicador |
| `text-titulo` | 18 / 24 | numeral compacto |

Existem porque o painel tinha **dez números e todos em 24px**: a manchete se distinguia apenas por
cor de fundo, e sem hierarquia de numeral a tela lia chapada. Com os degraus, o olho sabe qual
número é o principal antes de ler qualquer palavra.

## `tailwind-merge` precisa ser ENSINADO

⚠️ Por padrão o `tailwind-merge` resolve `text-*` assim: se o valor for um tamanho que ele conhece
(`xs`, `sm`, `lg`...), é fonte; **senão, é cor**. Como `corpo`, `apoio` e `legenda` não são
tamanhos conhecidos, ele os classificava como COR, entrava em conflito com `text-ink-2` e
**descartava a cor em silêncio**. O sintoma era um botão nascer com a tinta errada sem ninguém ter
escrito isso em lugar nenhum.

Os nomes estão registrados no grupo `font-size` do `extendTailwindMerge`, em `lib/utils.ts`.
**Papel novo entra nessa lista no mesmo commit**, senão repete o bug.

## Uso medido, 30/08/2026

`text-apoio` 165 · `text-legenda` 154 · `text-titulo` 28 · `text-rotulo` 21 · `text-corpo` 18 ·
`text-destaque` 3 · `text-cartao` 3 · `text-numero` 2 · `text-manchete` 1.

⚠️ Existiu um `text-display` (24/28). Foi **removido em 30/08/2026** por não ter nenhum
consumidor: ele nasceu quando o painel usava 24px em dez números ao mesmo tempo, a hierarquia de
numeral resolveu aquilo e o papel ficou órfão.
