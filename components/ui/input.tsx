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
