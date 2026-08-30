# Fundamentos: animação

⚠️ **Animação é CSS da casa.** Sem `tw-animate-css`, sem Motion. O pacote de animação do shadcn é
exatamente este punhado de keyframes, a casa já tinha `msg-in` no mesmo padrão, e o combinado é não
empilhar duas bibliotecas. Fica compatível com Motion depois, porque Motion serviria para gesto e
layout, não para aparecer e desaparecer de popover.

## Duas curvas, e elas não são intercambiáveis

| token | valor | significa |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | curva de **INTERFACE**: algo abrindo, um fundo entrando |
| `--ease-dado` | `cubic-bezier(0.165, 0.84, 0.44, 1)` | curva de **DADO**: um número correndo, uma barra crescendo |

A de dado desacelera muito mais no fim, então o valor final **assenta** em vez de chegar. Trocar
uma pela outra muda a sensação, não só o número.

## Durações

| token | valor | uso |
| --- | --- | --- |
| `--dur-fast` | 120ms | hover, mudança de cor de controle |
| `--dur` | 200ms | padrão |
| `--dur-slow` | 240ms | entrada de mensagem |
| `--dur-cartao` | 320ms | entrada de cartão do painel |
| `--dur-numero` | 900ms | numeral correndo até o valor |
| `--dur-barra` | 700ms | barra crescendo |
| `--dur-troca` | 420ms | troca de período dentro de um bloco |

Na entrada da tela do painel, cartão, número e barra **começam juntos**. O escalonamento vem de
`--passo`, definido inline por quem chama.

## Classes

| classe | o que faz |
| --- | --- |
| `.msg-in` | entrada de mensagem na conversa |
| `.anim-flutuante` | entrada e saída de popover, dropdown, dialog |
| `.anim-fundo` | o fundo escurecido do dialog |
| `.anim-lateral` | entrada e saída do `sheet` |
| `.painel-cartao` | entrada do cartão do painel |
| `.painel-barra` | barra do gráfico de hora |
| `.painel-area` | a área do gráfico de movimento |
| `.painel-hora`, `.painel-balao`, `.painel-guia`, `.painel-pressiona` | mouse nos gráficos |

## Duas armadilhas do Tailwind v4

⚠️ **O Tailwind v4 emite `-translate-x-1/2` como a propriedade `translate`, separada do
`transform`.** Um keyframe que repita o translate **soma** em vez de substituir. Foi assim que o
modal andou 256px na primeira tentativa.

Consequência prática: `.anim-flutuante` **não pode mexer em `translate`**, e é por isso que o
`sheet` tem animação própria (`.anim-lateral`), que PODE mexer, porque o painel encosta em
`right-0` e não usa translate para se posicionar.

⚠️ **A barra cresce em `height`, não em `scaleY`.** Com `scaleY` o raio de 3px do topo chega
esmagado. O keyframe lê `var(--altura)`, que a coluna define inline.

## Radix e desmontagem

O Radix marca `data-state` no elemento e **espera o `animationend`** antes de desmontar. Por isso a
saída funciona sem `forceMount`.

## Movimento reduzido

`@media (prefers-reduced-motion: reduce)` leva tudo ao valor final no primeiro quadro.

⚠️ **Hover e acordeão CONTINUAM funcionando, só sem transição: quem pediu menos movimento não
pediu menos informação.** O balão ainda aparece, o realce ainda acontece. As classes que perdem só
a `transition` são `.painel-transicao`, `.painel-hora`, `.painel-balao`,
`.painel-dia .painel-guia` e `.painel-corpo`.
