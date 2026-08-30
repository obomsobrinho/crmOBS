# Fundamentos: geometria

## Raio

| token | valor | uso |
| --- | --- | --- |
| `--radius-sm` | 6px | anel de foco |
| `--radius-md` | 8px | peça pequena |
| `--radius-lg` | 10px | raio **interno**: bloco dentro do cartão, campo, pílula retangular, botão |
| `--radius-xl` | 14px | raio de **cartão** |

⚠️ **A escala é LITERAL de propósito.** O padrão do shadcn deriva tudo de `--radius` por
`calc(var(--radius) * 0.6)`, o que daria 7,2px e 9,6px onde a casa tem 6px e 8px. Os componentes
da base pedem `rounded-sm` / `md` / `lg` / `xl` e caem aqui, que é o comportamento certo.

`--radius: 12px` existe só para o componente que eventualmente leia `var(--radius)` direto. **A
escala de verdade são os `--radius-*` literais.**

⚠️ O comentário de `components/ui/button.tsx` diz que `rounded-lg` é 12px. **O token é 10px.** É
comentário velho, não código errado.

Medido em 30/08/2026: **14px é o raio de cartão em todas as telas** (`/painel`, `/inbox`,
`/pipeline`, `/agente`, `/equipe`, `/perfil`). Sem divergência.

## Altura de controle

**Quatro degraus, e não sete controles todos em 40px.** Quem for do mesmo degrau tem a MESMA
altura, sempre; o que muda é o peso visual.

| token | altura | quem usa |
| --- | --- | --- |
| `--h-field` | 40px | campo de digitar, **o único que pode crescer** |
| `--h-primary` | 36px | ação principal de um bloco (assumir, convidar) |
| `--h-control` | 32px | ação secundária, aba, enviar, chip de filtro |
| `--h-chrome` | 28px | botão só de ícone da moldura (clipe, painel, tema) |

`components/ui/button.tsx` expõe cada degrau como `size`, mais `icon-control` (32 quadrado),
`icon-chrome` (28 quadrado) e `none` (para quem tem geometria própria).

## Respiro de cartão

Não há um token, e há divergência medida em 30/08/2026:

| onde | padding |
| --- | --- |
| painel: cartão de indicador, verbatim, assuntos | **22px** |
| painel: manchete | `32px 28px` |
| painel: fila | `20px 22px` |
| `/agente`, `/equipe`: cartão de página | **24px** |
| bloco dentro do cartão (`agente/ui.tsx`, `TeamManager`) | **16px** (`p-4`) |

O 22 vem da prancha do painel; o 24 é o que as outras telas já usavam. Ver
[pendencias.md](pendencias.md).

## Foco

**Nunca no componente. É global**, em `globals.css`:

```css
*:focus-visible {
  outline: 2px solid var(--brand-ink);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

Ancorado em `--brand-ink` para funcionar também sobre superfície tingida.

**Campo de texto é a exceção e NÃO usa o anel.** Um retângulo destacado em volta de um campo que
já é um retângulo lê como erro, e era ele que aparecia a cada clique. O foco continua visível: a
moldura do próprio campo assume `--brand-line`. Botão e link seguem com o anel, porque não têm
moldura para acender.

## Cursor

O Tailwind v4 não põe `cursor: pointer` em `<button>` por padrão. O reset está em `@layer base`, e
**a camada importa mais que a especificidade**: o Tailwind emite os utilitários dentro de
`@layer utilities`, e regra SEM camada vence qualquer regra em camada. Solto fora da camada, o
reset ganhava de todo `cursor-*` de classe, e foi o que aconteceu com o card do pipeline
(`cursor-grab` aplicado, mãozinha de clique na tela). O `:where()` fica junto para o reset também
não ganhar por especificidade dentro da própria camada.

## Scrollbar

8px, em overlay, `--line-strong` no polegar e `--ink-faint` no hover, trilho transparente, sem
setas. A nativa com setinhas denuncia UI crua.
