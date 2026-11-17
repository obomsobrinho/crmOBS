import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Esqueleto (13/11/2026, passo 0 de docs/plano-dados-e-estado.md): o lugar de
 * um dado que ainda não chegou. Era um `div` com `animate-pulse` e a cor do chip
 * escrita à mão em cada `loading.tsx`; agora é uma peça só.
 *
 * `forma`:
 * - `linha`: uma linha de texto (o tamanho vem do `className`, `h-4 w-40`);
 * - `bloco`: um cartão ou uma área inteira (`rounded-xl`, cor mais suave);
 * - `circulo`: um avatar;
 * - `pilula`: um selo ou uma aba.
 *
 * Sempre `aria-hidden`: quem anuncia o carregamento é o contêiner (`aria-busy`).
 * O passo 1 (a Base) completa o padrão dos estados novos (seção 7.1 do plano).
 */
const esqueletoVariants = cva("animate-pulse bg-[var(--chip-bg)]", {
  variants: {
    forma: {
      linha: "rounded",
      bloco: "rounded-xl bg-[var(--chip-bg)]/50",
      circulo: "rounded-full",
      pilula: "rounded-full",
    },
  },
  defaultVariants: { forma: "linha" },
});

function Esqueleto({
  className,
  forma,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof esqueletoVariants>) {
  return <div aria-hidden className={cn(esqueletoVariants({ forma }), className)} {...props} data-slot="esqueleto" />;
}

export { Esqueleto, esqueletoVariants };
