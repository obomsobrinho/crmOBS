import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Cartão de indicador. UMA peça, em slots, para todo número grande do produto.
 *
 * POR QUE EXISTE: a mesma sopa de classe `rounded-xl border border-line bg-bloco
 * p-N` estava escrita à mão em onze lugares, e a única diferença entre elas era o
 * padding. Pela regra da casa, sopa repetida virou variante.
 *
 * E POR QUE AGORA: o painel tinha dez números e todos em `--text-display` (24px),
 * inclusive a manchete de valor, que só se distinguia por cor de fundo. Sem
 * hierarquia de numeral a tela lê chapada, e nenhuma cor de cartão conserta isso.
 * Daí a escala de três degraus no `tamanho`.
 *
 * O QUE ELE NÃO SABE: nada de negócio. Ele não sabe o que é delta, nem qual
 * direção é boa, nem quando colorir. Essa regra mora em `lib/delta.ts`, módulo
 * puro, pelo mesmo motivo de `lib/valor.ts` e `lib/billing.ts`: duas opiniões
 * sobre o mesmo número é o começo de um número inventado.
 *
 * `StatLegenda` é OBRIGATÓRIA por decisão de projeto. O defeito que ela conserta
 * estava na tela: "Leads qualificados 9" (7 dias) ao lado de "19 leads
 * qualificados em julho" (mês), com o período escrito só no título da seção. Um
 * cartão de indicador sem período mente sobre o próprio número.
 */
const statVariants = cva("flex flex-col rounded-xl border", {
  variants: {
    variant: {
      /** Indicador comum, DENTRO de um cartão de página. */
      bloco: "border-line bg-bloco",
      /**
       * Indicador solto SOBRE o canvas, sem cartão de página em volta. Usa
       * `--raised`, que é a única superfície acima do canvas nos DOIS temas
       * (branco no claro, #15161d no escuro).
       *
       * Existe porque `bg-bloco` no claro é `#f3f3f6`, exatamente igual ao
       * `--canvas`: um cartão `bloco` sobre o canvas ficaria invisível. É esta
       * variante que permite o padrão "página cinza com cartões brancos
       * flutuando", que é o que a referência do dono mostra nos dois temas.
       */
      elevado: "border-line bg-raised shadow-[var(--panel-shadow)]",
      /** Manchete: a única frase que a pessoa precisa ler nesta tela. */
      marca: "border-brand-line bg-brand-surface",
      /** Sem dado ainda. Tracejado é convite a preencher, não erro. */
      vazio: "border-dashed border-line-strong",
    },
    /** Geometria mora aqui: padding e respiro entre as peças. */
    tamanho: {
      manchete: "gap-2 p-6",
      padrao: "gap-1.5 p-5",
      compacto: "gap-1 p-4",
    },
  },
  defaultVariants: { variant: "bloco", tamanho: "padrao" },
});

function Stat({
  className,
  variant,
  tamanho,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof statVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      {...props}
      data-slot="stat"
      className={cn(statVariants({ variant, tamanho, className }))}
    />
  );
}

/** Linha do topo: rótulo à esquerda, selo de variação à direita. */
function StatTopo({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="stat-topo"
      className={cn("flex min-h-5 items-start justify-between gap-2", className)}
    />
  );
}

/**
 * `asChild` existe para o rótulo poder SER um `<h2>` quando o cartão é a seção
 * (a manchete do painel). Rótulo é aparência; o nível de título é estrutura do
 * documento, e um `<span>` deixaria a página sem sumário.
 */
function StatRotulo({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp
      {...props}
      data-slot="stat-rotulo"
      className={cn("text-rotulo uppercase text-ink-3", className)}
    />
  );
}

const valorVariants = cva("font-display tabular-nums", {
  variants: {
    tamanho: {
      manchete: "text-numero",
      padrao: "text-display",
      compacto: "text-titulo",
    },
  },
  defaultVariants: { tamanho: "padrao" },
});

/**
 * O numeral. Recebe `tamanho` por PROP e não lê o do `Stat` por seletor de
 * ancestral: é a mesma regra que fez `SwitchTrack` receber `checked` por prop,
 * porque depender de atributo do pai quebra assim que alguém envolve a peça em
 * outra coisa (um Tooltip, um Link).
 */
function StatValor({
  className,
  tamanho,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof valorVariants>) {
  return (
    <div
      {...props}
      data-slot="stat-valor"
      className={cn(valorVariants({ tamanho, className }))}
    />
  );
}

const fraseVariants = cva("", {
  variants: {
    tamanho: {
      manchete: "text-titulo",
      padrao: "text-apoio text-ink-2",
      compacto: "text-apoio text-ink-2",
    },
  },
  defaultVariants: { tamanho: "padrao" },
});

/**
 * A INTERPRETAÇÃO do número ("a IA resolveu sozinha"), não o período. É a peça
 * que separa um indicador de uma planilha, e a que faltava nos nossos cartões.
 */
function StatFrase({
  className,
  tamanho,
  ...props
}: React.ComponentProps<"p"> & VariantProps<typeof fraseVariants>) {
  return (
    <p
      {...props}
      data-slot="stat-frase"
      className={cn(fraseVariants({ tamanho, className }))}
    />
  );
}

/** O ESCOPO: de qual período é o número. Sempre presente. */
function StatLegenda({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      {...props}
      data-slot="stat-legenda"
      className={cn("text-legenda text-ink-3", className)}
    />
  );
}

export {
  Stat,
  StatTopo,
  StatRotulo,
  StatValor,
  StatFrase,
  StatLegenda,
  statVariants,
};
