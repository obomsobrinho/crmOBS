"use client";

import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import {
  DISSOLVER_PADRAO,
  SetaMais,
  rolarAteOFim,
  useDissolverRolagem,
} from "@/components/ui/dissolver-rolagem";

/** Junta o ref de quem usa com o ref interno, sem um perder o outro. */
function juntarRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T) => {
    for (const r of refs) {
      if (typeof r === "function") r(node);
      else if (r) (r as React.RefObject<T | null>).current = node;
    }
  };
}

/**
 * Área de rolagem.
 *
 * Três adaptações que esta casa exige, e sem elas o componente não serve:
 *
 * 1. `viewportRef`. O Radix esconde o elemento que rola de verdade dentro do
 *    Viewport, mas quem usa costuma precisar dele: é nesse elemento que a
 *    conversa mede a posição para decidir o auto-scroll. Sem esta prop, a
 *    alternativa seria caçar o nó por seletor, que quebra na primeira mudança
 *    interna do Radix.
 *
 * 2. `fade`. Sem ele o conteúdo é fatiado numa linha reta contra o vizinho. Com
 *    ele, dissolve na borda e some ATRÁS dela. Só desbota o lado que tem
 *    conteúdo escondido: no fim da lista o rodapé não desbota, senão o último
 *    item nasceria apagado sem motivo.
 *    ⚠️ A REGRA e o mecanismo moram em `components/ui/dissolver-rolagem.tsx`,
 *    porque metade das áreas roláveis desta casa é um `div` com `overflow-y-auto`
 *    e não este componente. Aqui ficou só a ligação.
 *
 * 3. A barra imita a nativa que o `globals.css` já estiliza: 8px de largura,
 *    polegar em --line-strong com raio total, --ink-faint no hover, sem setas e
 *    trilho transparente. E `type="always"`, porque o padrão do Radix é `hover`
 *    e a barra sumiria quando antes ela ficava sempre visível.
 *
 * O anel de foco do Viewport saiu, como em toda a base: o foco é global.
 *
 * ⚠️ Diferença conhecida: a barra nativa RESERVA os 8px no layout, a do Radix é
 * sobreposta. Onde havia rolagem, o conteúdo ganha essa largura de volta.
 */
function ScrollArea({
  className,
  children,
  viewportRef,
  viewportClassName,
  onViewportScroll,
  fade = false,
  seta = false,
  setaRotulo,
  type = "always",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportRef?: React.Ref<HTMLDivElement>;
  viewportClassName?: string;
  /**
   * O evento de rolagem NÃO sobe até o Root: `scroll` não borbulha, e o React
   * não o simula. Quem quiser saber a posição precisa ouvir o Viewport, que é
   * o elemento que rola de verdade. Daí esta prop existir em vez de um
   * `onScroll` no Root, que nunca dispararia.
   */
  onViewportScroll?: React.UIEventHandler<HTMLDivElement>;
  /**
   * Dissolve o conteúdo nas bordas em vez de cortá-lo numa linha reta.
   * `true` usa o padrão de 28px; um número diz em quantos pixels dissolver, e
   * quem passa número é quem tem item alto e opaco (ver a regra em
   * `dissolver-rolagem.tsx`).
   */
  fade?: boolean | number;
  /**
   * Mostra a seta de "tem mais coisa aqui embaixo", que ao ser clicada leva ao
   * fim. Só onde ROLAR É A NAVEGAÇÃO (ver a nota em `SetaMais`).
   */
  seta?: boolean;
  /** Nome acessível da seta, quando o padrão não descreve o conteúdo. */
  setaRotulo?: string;
}) {
  const dissolver = useDissolverRolagem<HTMLDivElement>(
    typeof fade === "number" ? fade : fade ? DISSOLVER_PADRAO : false,
    [children]
  );

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      type={type}
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        ref={juntarRefs(dissolver.ref, viewportRef)}
        style={dissolver.style}
        onScroll={(e) => {
          dissolver.medir();
          onViewportScroll?.(e);
        }}
        // `[&>div]:!block`: o Radix envolve o conteúdo num filho `display:table`
        // para medir a largura. Tabela CRESCE para caber o conteúdo, então
        // `truncate` para de truncar e o texto longo empurra o contêiner (a
        // lista de conversas ficava 298px dentro de 294px). Como aqui só se
        // rola na vertical, o bloco resolve e a reticência volta a funcionar.
        className={cn(
          "size-full rounded-[inherit] [&>div]:!block",
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
      {seta && (
        // Dentro do Root, que ja e `relative`: a seta se ancora na borda de
        // baixo da AREA, e nao do conteudo, senao ela rolaria junto.
        <SetaMais
          visivel={dissolver.temMais}
          rotulo={setaRotulo}
          onClick={() => rolarAteOFim(dissolver.ref.current)}
        />
      )}
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none select-none",
        orientation === "vertical" && "h-full w-2",
        orientation === "horizontal" && "h-2 flex-col",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-[var(--line-strong)] transition-colors hover:bg-[var(--ink-faint)]"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
