"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { stageColor, type Stage } from "@/lib/pipeline";
import type { ContagensPipeline } from "@/lib/pipeline-fonte";

/** Celular: a faixa de estágios, um por vez (Tabs da base, lista `faixa`). */
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
    <Tabs
      value={estagioVisivel ?? ""}
      onValueChange={onEscolher}
      className="shrink-0 md:hidden"
    >
      <TabsList variant="faixa" aria-label="Estágios" data-slot="pipeline-faixa">
        {columns.map(({ stage }) => (
          <TabsTrigger key={stage.key} value={stage.key} variant="chip">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: stageColor(stage.color) }}
              aria-hidden
            />
            {stage.name}
            <span className="tabular-nums opacity-75">{numerosDe(stage.key).total}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
