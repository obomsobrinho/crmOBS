"use client";

import { cn } from "@/lib/utils";
import { stageColor, type Stage } from "@/lib/pipeline";
import type { ContagensPipeline } from "@/lib/pipeline-fonte";

/** Celular: a faixa de estágios, um por vez. */
export function FaixaDeEstagios({
  columns,
  estagioVisivel,
  numerosDe,
  onEscolher,
}: {
  columns: { stage: Stage }[];
  estagioVisivel: string | null;
  numerosDe: (key: string) => ContagensPipeline["porColuna"][string];
  onEscolher: (key: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Estágios"
      data-slot="pipeline-faixa"
      className="flex shrink-0 gap-2 overflow-x-auto border-b border-line px-4 py-2.5 [scrollbar-width:none] md:hidden"
    >
      {columns.map(({ stage }) => {
        const ativo = stage.key === estagioVisivel;
        return (
          // eslint-disable-next-line no-restricted-syntax -- aba em pílula com tokens de chip próprios (data-slot do e2e); nenhuma variante do Button a reproduz igual
          <button
            key={stage.key}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onEscolher(stage.key)}
            className={cn(
              "flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-apoio transition-colors",
              ativo
                ? "border-[var(--chip-ativo-bg)] bg-[var(--chip-ativo-bg)] font-semibold text-[var(--chip-ativo-fg)]"
                : "border-line bg-[var(--chip-bg)] text-ink-2"
            )}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: stageColor(stage.color) }}
              aria-hidden
            />
            {stage.name}
            <span className="tabular-nums opacity-75">{numerosDe(stage.key).total}</span>
          </button>
        );
      })}
    </div>
  );
}
