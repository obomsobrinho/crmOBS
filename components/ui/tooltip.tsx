"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Tooltip.
 *
 * O Provider fica embutido em cada Tooltip de propósito: assim nenhuma tela
 * precisa lembrar de envolver a árvore, e o `app/layout.tsx` (que está fora do
 * escopo desta rodada) não é tocado. O custo é um contexto a mais por tooltip,
 * que é irrelevante perto de um `title` que não dá para estilizar.
 *
 * `delayDuration` é 300ms. O `title` nativo demora quase um segundo, que é a
 * queixa que originou a troca; 0ms faria a dica pular a cada passada do mouse
 * numa barra de ícones apertada como a do cabeçalho da conversa.
 *
 * As classes de animação (`animate-in`, `fade-in-0`, `zoom-in-95`,
 * `slide-in-from-*`) saíram: elas vêm do `tw-animate-css`, que não instalamos.
 * Movimento entra depois, com o Motion, e aí a decisão é uma só.
 */
function TooltipProvider({
  delayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  );
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "anim-flutuante z-50 w-fit max-w-64 rounded-md bg-ink px-2.5 py-1.5 text-legenda text-balance text-[var(--canvas)]",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-ink fill-ink" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
