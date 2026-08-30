# Fundamentos: cor

Valores em `app/globals.css`, blocos `:root` (claro) e `[data-theme="dark"]` (escuro).

## A regra que evita 18 falhas de contraste

**Cada matiz tem QUATRO papéis, e é a escolha do papel que garante contraste.**

| papel | o que é | exemplo de classe |
| --- | --- | --- |
| `fill` | fundo cheio | `bg-brand`, `bg-warn` |
| `on` | tinta **sobre** o fill | `text-[var(--brand-on)]` |
| `ink` | a cor como **texto ou ícone** sobre superfície | `text-brand-ink`, `text-warn-ink` |
| `surface` / `line` | fundo tingido e borda | `bg-human-surface`, `border-human-line` |

⚠️ **NUNCA usar `fill` como cor de texto. NUNCA usar `ink` como fundo.** Foi exatamente isso que
produziu as 18 reprovações WCAG AA da rodada anterior: o roxo de acento pintando texto pequeno
(inclusive o indicador de status da IA, o mais importante da tela) e branco sobre verdes claros.

Na prática: `text-brand-ink`, não `text-accent`. `text-warn-ink`, não `text-warn`.

Um caso já corrigido, que mostra o custo: `--danger-fill` usado como TEXTO dava ~3,2:1 no escuro.
Virou o par `danger-surface` / `danger-ink`, que dá 9,0:1, em 7 lugares.

## Semântica

Não muda de significado em lugar nenhum:

| matiz | significa |
| --- | --- |
| **roxo** | marca e IA |
| **verde** | humano ("você" respondeu) e ação de enviar |
| **âmbar** | precisa de você (IA pausada, aviso) |
| **vermelho** | erro e bloqueio |

**Verde, âmbar e vermelho são cores de ESTADO.** Nunca decorativas, nunca cor de acento da marca.
É por causa dessa regra que o painel não usa biblioteca de gráfico: sobra **uma** cor categórica
(a marca) mais o cinza, e duas séries é o teto da paleta.

## Tinta, em quatro níveis

| token | claro | escuro | uso |
| --- | --- | --- | --- |
| `--ink` | `#171717` (15,8:1) | `#f5f5f5` (15,0:1) | texto principal |
| `--ink-2` | `#525252` (8,1:1) | `#b4b4b4` (9,3:1) | texto secundário |
| `--ink-3` | `#6e6e6e` (5,5:1) | `#8c8c8c` (5,7:1) | **piso de texto**, mínimo 12px |
| `--ink-faint` | `#a3a3a3` | `#5c5c5c` | **NUNCA texto**: só ícone e divisor |

Os nomes `text-ink-muted` e `text-ink-dim` **não existem mais** como utilitário: eram aliases e
saíram em 17/08/2026. As variáveis `--ink-muted` / `--ink-dim` seguem no CSS só para não quebrar
consumidor legado.

## As quatro matizes

Cada uma existe nos quatro papéis. Os valores de contraste estão anotados no próprio
`globals.css`, ao lado de cada token.

| | fill (claro / escuro) | ink (claro / escuro) |
| --- | --- | --- |
| marca | `#6b21e8` / `#7b35f0` | `#5b17d4` / `#b98cff` |
| humano | `#2fb872` / `#22c55e` | `#10714a` / `#4ade80` |
| aviso | `#b45309` / `#f9a63a` | `#8f4308` / `#fbbf5c` |
| bloqueio | `#c81e1e` / `#cc2b2b` | `#b91c1c` / `#ff9b9b` |

**O par de enviar é separado de propósito** (`--send-fill` / `--send-on`), e ele **inverte por
tema**: no claro a tinta é branca, então o verde precisa ser um degrau mais escuro (`#1a8f52`,
4,1:1); no escuro o verde fica claro (`#22c55e`) e a tinta escura (7,6:1). Branco sobre o verde
claro daria 1,99:1.

## Linhas

| token | claro | escuro | uso |
| --- | --- | --- | --- |
| `--line` | `oklch(0 0 0 / 8%)` | `oklch(1 0 0 / 10%)` | **borda de cartão** |
| `--line-soft` | `oklch(0 0 0 / 6%)` | `oklch(1 0 0 / 6%)` | **divisor interno**: cabeçalho, rodapé, separador de lista |
| `--line-strong` | `oklch(0 0 0 / 18%)` | `oklch(1 0 0 / 22%)` | foco, hover de controle, guia, borda tracejada |

`--line-soft` entrou em 30/08/2026 com o painel. A diferença entre ela e `--line` é o que faz um
cartão ter contorno **sem parecer uma tabela**.

## O azul

`--brand-grad-end` (`#4464d4`) existe **só porque a logo termina nele**. Escopo fechado: gradiente
de marca, símbolo e superfície decorativa a partir de 28px. Não pinta texto, não pinta ícone, não
pinta estado. O único lugar autorizado é a classe `.brand-grad`.

Isso é uma pendência de marca, não uma decisão fechada. Ver [pendencias.md](pendencias.md).

## Avatar

Nunca branco sobre cor cheia (dava 2,80:1). São 8 pares de **fundo tingido mais tinta do mesmo
matiz** (`--av-N-bg` / `--av-N-fg`), escolhidos por `avatarPair()` em `lib/inbox.ts`.

## Aliases legados que ainda existem

`--accent`, `--ia`, `--warn`, `--danger`, `--ink-muted`, `--ink-dim` continuam declarados, alguns
**de propósito nos valores antigos**: componentes que ainda usam `--ia` como cor de TEXTO ficariam
piores com o fill novo, que é mais claro. Quem for texto migra para `-ink` na rodada das telas.

Os utilitários `@theme` correspondentes (`--color-accent`, `--color-ia`, `--color-ink-muted`,
`--color-ink-dim`) **foram removidos** em 17/08/2026, junto com `.btn-primary`, `.glass`, `.panel`
e `--radius-2xl`.
