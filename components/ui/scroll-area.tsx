"use client";

import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Quantos pixels o conteúdo leva para se dissolver na borda, por padrão.
 *
 * ⚠️ 28px serve para LISTA (texto sobre superfície lisa) e NÃO serve para a
 * conversa, onde cada item é um balão opaco de 65px em média, com cor de fundo e
 * borda próprias. Em 28px o balão ainda está em quase metade da opacidade quando
 * a borda chega: ele não dissolve, ele é FATIADO, e foi exatamente isso que o
 * dono viu no print de 19/09. Por isso `fade` aceita um número, e a conversa
 * passa o dela.
 */
const ESMAECIMENTO = 28;

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
 *    Viewport, mas a conversa precisa dele: é nesse elemento que o Thread mede
 *    a posição para decidir o auto-scroll e para acender a sombra de rolagem.
 *    Sem esta prop, a alternativa seria caçar o nó por seletor, que quebra na
 *    primeira mudança interna do Radix.
 *
 * 2. `fade`. Sem ele o conteúdo é fatiado numa linha reta contra o cabeçalho e
 *    contra a caixa de escrita. Com ele, dissolve na borda e some ATRÁS dela.
 *    Só desbota o lado que tem conteúdo escondido: no fim da lista o rodapé não
 *    desbota, senão o último item nasceria apagado sem motivo. A distância é
 *    28px por padrão e vem por número quando o conteúdo é alto (ver
 *    `ESMAECIMENTO`).
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
   * quem passa número é quem tem item alto e opaco (ver `ESMAECIMENTO`).
   */
  fade?: boolean | number;
}) {
  const interno = React.useRef<HTMLDivElement>(null);
  const [bordas, setBordas] = React.useState({ topo: false, fundo: false });
  const esmaecer = typeof fade === "number" ? fade : fade ? ESMAECIMENTO : 0;

  const medir = React.useCallback(() => {
    const el = interno.current;
    if (!el) return;
    const topo = el.scrollTop > 4;
    const fundo = el.scrollHeight - el.scrollTop - el.clientHeight > 8;
    setBordas((b) => (b.topo === topo && b.fundo === fundo ? b : { topo, fundo }));
  }, []);

  // Mede na montagem e sempre que o conteúdo mudar de tamanho. Só ouvir o
  // evento de rolagem não bastaria: numa lista que ainda não foi rolada, ou
  // que acabou de receber um item, não há evento nenhum e a máscara nasceria
  // errada.
  React.useEffect(() => {
    if (!esmaecer) return;
    const el = interno.current;
    if (!el) return;
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    const conteudo = el.firstElementChild;
    if (conteudo) observador.observe(conteudo);
    return () => observador.disconnect();
  }, [esmaecer, medir, children]);

  const mascara = React.useMemo<React.CSSProperties>(() => {
    if (!esmaecer || (!bordas.topo && !bordas.fundo)) return {};
    const paradas = [
      bordas.topo ? "transparent 0" : "#000 0",
      bordas.topo ? `#000 ${esmaecer}px` : null,
      bordas.fundo ? `#000 calc(100% - ${esmaecer}px)` : null,
      bordas.fundo ? "transparent 100%" : "#000 100%",
    ].filter(Boolean);
    const g = `linear-gradient(to bottom, ${paradas.join(", ")})`;
    return { maskImage: g, WebkitMaskImage: g };
  }, [esmaecer, bordas]);

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      type={type}
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        ref={juntarRefs(interno, viewportRef)}
        style={mascara}
        onScroll={(e) => {
          if (esmaecer) medir();
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
