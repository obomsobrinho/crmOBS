"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Abas, em duas formas.
 *
 * `sublinhado` (padrão) é a do composer, descrita abaixo. `segmentado` é o
 * alternador de modo do /agente: dois botões numa bandeja com moldura, e o
 * ativo ganha o fill da marca. Ele era um par de `<button>` solto, sem `role`
 * nenhum, e o ativo usava `brand-grad`, cujo escopo o próprio sistema fecha em
 * "superfície decorativa a partir de 28px". Trazê-lo para cá dá
 * `role="tablist"`, navegação por seta e foco itinerante de graça.
 *
 * ── sublinhado ──
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

const listaVariants = cva("flex items-center gap-1", {
  variants: {
    variant: {
      sublinhado: "",
      /** Bandeja com moldura, no mesmo fundo de campo do resto da casa. */
      segmentado: "w-fit rounded-lg border border-line bg-[var(--input-bg)] p-1",
    },
  },
  defaultVariants: { variant: "sublinhado" },
});

function TabsList({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof listaVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(listaVariants({ variant, className }))}
      {...props}
    />
  );
}

const gatilhoVariants = cva(
  "group/aba flex transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        sublinhado: [
          "flex-col items-center gap-1.5 px-2.5 pt-1 text-legenda",
          "text-ink-3 hover:text-ink-2",
          "data-[state=active]:font-semibold data-[state=active]:text-ink",
        ],
        segmentado: [
          "items-center gap-1.5 rounded-md px-3 text-apoio font-medium",
          "h-[var(--h-control)] text-ink-2 hover:text-ink",
          "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
        ],
      },
    },
    defaultVariants: { variant: "sublinhado" },
  },
);

function TabsTrigger({
  className,
  variant = "sublinhado",
  barra,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> &
  VariantProps<typeof gatilhoVariants> & {
    /** Cor da barra quando a aba está ativa. Só em `sublinhado`. */
    barra?: string;
  }) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      style={barra ? ({ "--aba-cor": barra } as React.CSSProperties) : undefined}
      className={cn(gatilhoVariants({ variant, className }))}
      {...props}
    >
      {children}
      {variant === "sublinhado" && (
        <span
          aria-hidden
          data-slot="tabs-trigger-bar"
          className="h-[3px] w-full rounded-t-[3px] bg-transparent transition-colors group-data-[state=active]/aba:bg-[var(--aba-cor)]"
        />
      )}
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
