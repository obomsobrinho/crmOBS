import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Campo de uma linha.
 *
 * Nenhuma classe de foco aqui, e isso é deliberado: o `globals.css` já trata
 * `input:focus` globalmente, tirando o anel e acendendo a moldura do próprio
 * campo em --brand-line. Repetir a regra no componente criaria dois donos para
 * a mesma decisão, e o do shadcn (`focus-visible:ring-[3px]`) desenharia um
 * segundo indicador por cima.
 *
 * Também saem daqui: `shadow-xs` (a casa não tem sombra em campo),
 * `text-base md:text-sm` (a escala tipográfica é nossa) e `dark:bg-input/30`.
 */
const inputVariants = cva(
  "w-full min-w-0 placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        /** Moldura própria, no degrau `field`. */
        caixa:
          "h-[var(--h-field)] rounded-lg border border-line bg-[var(--input-bg)] px-3 text-apoio transition-colors",
        /** Sem moldura e sem fundo: mora dentro de um bloco que já tem os dois. */
        limpo: "bg-transparent",
        /**
         * Campo dentro de uma tabela de pares (a coluna do cliente).
         *
         * Existe por um retorno do dono em 19/09/2026: "custei perceber que
         * podia digitar ali". A variante `limpo` é texto até alguém clicar, e
         * campo que só vira campo DEPOIS do clique não convida ninguém. Aqui a
         * moldura é discreta mas está lá antes de qualquer interação, no degrau
         * `control` (32px) em vez dos 40px do `caixa`, porque a coluna tem 292px
         * e a linha já carrega rótulo, valor e o gutter do botão de remover.
         *
         * ⚠️ A moldura é `line` (8%), a MESMA do `caixa`, e não `line-soft`.
         * Medido: no tema claro a coluna do cliente, `--input-bg` e `--s-campo`
         * são todos #fff, então o fundo não distingue nada e a borda é o único
         * sinal que sobra. Com `line-soft` ela some, e o campo volta a ser o
         * texto que ninguém percebeu que dava para editar.
         */
        sutil:
          "h-[var(--h-control)] rounded-md border border-line bg-[var(--input-bg)] px-2 text-apoio transition-colors hover:border-line-strong",
      },
    },
    defaultVariants: { variant: "caixa" },
  },
);

function Input({
  className,
  variant,
  type,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Input, inputVariants };
