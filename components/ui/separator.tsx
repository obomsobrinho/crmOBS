"use client";

import * as React from "react";
import { Separator as SeparatorPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Régua de 1px.
 *
 * A orientação é resolvida em JS, e não pelos modificadores
 * `data-[orientation=vertical]:h-full` que o shadcn usa. Motivo prático: o
 * `tailwind-merge` não considera `h-full` com modificador e `h-5` sem
 * modificador como conflitantes, então quem passasse `className="h-5"` (que é
 * o caso das duas réguas do cabeçalho da conversa) ficaria com as duas classes
 * valendo e a altura errada. Sem modificador, o merge funciona.
 */
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
