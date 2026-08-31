"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Abas, em duas formas.
 *
 * `sublinhado` (padrão) é a do composer, descrita abaixo. `painel` é a bandeja
 * segmentada dos seletores de período.
 *
 * ⚠️ Existiu uma terceira, `segmentado`, com a aba ativa em roxo cheio. Ela foi
 * REMOVIDA em 30/08/2026 por não ter nenhum consumidor: o comentário aqui a
 * descrevia como "o alternador de modo do /agente", mas o `AgentConfigForm` usa
 * a variante padrão, e o alternador virou um botão. Variante sem uso é pior que
 * ausente, porque quem lê o design system a considera disponível e a adota sem
 * saber que ela nunca foi aprovada em tela nenhuma.
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
      /**
       * A do painel: bandeja com moldura, e a aba ativa na superfície de BLOCO,
       * nunca no fill da marca. Roxo cheio num seletor de período roubaria a cor
       * da série, que no painel é a única cor categórica que existe.
       *
       * A bandeja nasce na cor do CARTÃO, que é onde a operação a usa (ela
       * flutua sobre o canvas). Dentro de um cartão ela precisa recuar para o
       * canvas, e quem faz isso é o chamador, por className.
       */
      painel:
        "w-fit gap-[2px] rounded-[10px] border border-line bg-raised p-[3px]",
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
        painel: [
          "items-center rounded-[7px] px-3 py-[5px] text-apoio font-medium",
          "text-ink-2 hover:bg-bloco hover:text-ink",
          "data-[state=active]:bg-bloco data-[state=active]:font-semibold data-[state=active]:text-ink",
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

/**
 * Painel de uma aba.
 *
 * ⚠️ `data-[state=inactive]:hidden` NÃO é enfeite. Com `forceMount`, que é como
 * a tela do agente usa isto, o Radix mantém os painéis inativos montados E
 * VISÍVEIS: ele só põe o atributo `hidden` quando o conteúdo não está presente,
 * e com `forceMount` ele está sempre presente. Sem esta linha os três grupos do
 * formulário apareciam empilhados, ou seja, exatamente a página de rolagem única
 * que as abas vieram resolver.
 *
 * Esconder por CSS em vez de desmontar é o ponto: `AgentBulletList` guarda o
 * rascunho ainda não adicionado num estado do pai, e desmontar faria o texto
 * sumir da tela continuando a ser salvo.
 */
function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 data-[state=inactive]:hidden", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
