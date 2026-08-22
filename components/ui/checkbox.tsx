"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Caixa de marcar.
 *
 * Os dois usos do produto eram `<input type="checkbox">` com
 * `accent-[var(--accent)]`. A propriedade `accent-color` pinta o preenchimento
 * e nada mais: a moldura, o raio e o desenho do tique continuam sendo do
 * sistema operacional, então a caixa era a única peça da tela que mudava de
 * forma entre Windows, macOS e Linux.
 *
 * O par de cores no estado marcado é `fill`/`on` da marca, o mesmo do botão
 * principal e da pílula de não lidas. No estado vazio a moldura é
 * `--line-strong`, e não `--line`: uma caixa vazia precisa se anunciar, senão
 * some na superfície do bloco.
 *
 * `Check` em 11px com traço 3: o ícone mora dentro de uma caixa de 16px, e no
 * tamanho padrão do lucide ele encostaria nas quatro bordas.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-line-strong transition-colors",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center"
      >
        <Check size={11} strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
