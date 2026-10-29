"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Paginação numerada (29/10/2026, dono, nas tabelas da prospecção): "Mostrando
 * 11 a 20 de 137" à esquerda e Anterior, as páginas e Próxima à direita. As
 * páginas mostram a primeira, a última e duas em volta da atual, com "…" no
 * buraco. A página ativa usa o `chip` aceso (`aria-pressed`) e `aria-current`.
 * Quem chama guarda a página e lê o pedaço dela; esta peça só desenha.
 */

/** As páginas visíveis: 1 … 4 5 [6] 7 8 … 14. `null` é o "…". */
export function paginasVisiveis(atual: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const meio = [atual - 1, atual, atual + 1].filter((p) => p > 1 && p < total);
  const lista: (number | null)[] = [1];
  if (meio[0] > 2) lista.push(null);
  lista.push(...meio);
  if (meio[meio.length - 1] < total - 1) lista.push(null);
  lista.push(total);
  return lista;
}

function Paginacao({
  pagina,
  porPagina,
  total,
  aoMudar,
  className,
  ...props
}: Omit<React.ComponentProps<"nav">, "children"> & {
  /** A página atual, a partir de 1. */
  pagina: number;
  porPagina: number;
  total: number;
  aoMudar: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const de = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const ate = Math.min(total, pagina * porPagina);
  return (
    <nav
      {...props}
      data-slot="paginacao"
      aria-label="Páginas"
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
    >
      <p className="text-legenda tabular-nums text-ink-3" data-slot="paginacao-texto" aria-live="polite">
        {total === 0 ? "Nenhum resultado" : `Mostrando ${de} a ${ate} de ${total}`}
      </p>
      {paginas > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-chrome"
            aria-label="Página anterior"
            disabled={pagina <= 1}
            onClick={() => aoMudar(pagina - 1)}
            data-slot="paginacao-anterior"
          >
            <ChevronLeft size={14} />
          </Button>
          {paginasVisiveis(pagina, paginas).map((p, i) =>
            p === null ? (
              <span key={`v${i}`} aria-hidden className="w-6 text-center text-legenda text-ink-3">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant="chip"
                size="chip"
                className="min-w-[var(--h-chrome)] justify-center tabular-nums"
                aria-pressed={p === pagina}
                aria-current={p === pagina ? "page" : undefined}
                aria-label={`Página ${p}`}
                onClick={() => aoMudar(p)}
                data-slot="paginacao-pagina"
                data-pagina={p}
              >
                {p}
              </Button>
            ),
          )}
          <Button
            variant="outline"
            size="icon-chrome"
            aria-label="Próxima página"
            disabled={pagina >= paginas}
            onClick={() => aoMudar(pagina + 1)}
            data-slot="paginacao-proxima"
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </nav>
  );
}

export { Paginacao };
