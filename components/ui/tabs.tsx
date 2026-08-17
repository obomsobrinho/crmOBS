"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Abas com sublinhado.
 *
 * A ativa é rótulo em negrito com uma barra sólida de 3px embaixo, sem fundo
 * nenhum; a barra é quem carrega a cor do modo. Pílula e bloco cheio de cor já
 * foram tentados e os dois gritavam mais que o campo de escrita.
 *
 * A barra é desenhada pelo próprio TabsTrigger, e a cor chega por `barra`, que
 * vira a variável --aba-cor. Antes essa cor ia por `style` inline no elemento,
 * e era o único lugar da tela que pintava estado assim.
 *
 * Nada do visual padrão do shadcn sobrou: fundo de lista, pílula da ativa,
 * pseudo-elemento `after`, anel de foco e o `size-4` forçado nos ícones. O que
 * se aproveita aqui é o motor: `role="tablist"` de verdade (antes existia
 * `role="tab"` sem lista), navegação por seta e foco itinerante.
 *
 * ⚠️ NÃO existe `TabsContent` no composer, e é de propósito: os três modos
 * dividem UM editor só, e envolvê-lo em painéis o desmontaria a cada troca de
 * aba, perdendo foco e posição do cursor. O custo é que o `aria-controls` que
 * o Radix põe no gatilho aponta para um id que não existe. Decisão tomada:
 * aceitar. Ainda é melhor do que antes, quando não havia nem lista de abas.
 */
function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  barra,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  /** Cor da barra quando a aba está ativa. Ex.: "var(--human-fill)". */
  barra?: string;
}) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      style={barra ? ({ "--aba-cor": barra } as React.CSSProperties) : undefined}
      className={cn(
        "group/aba flex flex-col items-center gap-1.5 px-2.5 pt-1 text-legenda transition-colors",
        "text-ink-3 hover:text-ink-2",
        "data-[state=active]:font-semibold data-[state=active]:text-ink",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <span
        aria-hidden
        data-slot="tabs-trigger-bar"
        className="h-[3px] w-full rounded-t-[3px] bg-transparent transition-colors group-data-[state=active]/aba:bg-[var(--aba-cor)]"
      />
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
