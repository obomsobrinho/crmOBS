"use client";

import { cn } from "@/lib/utils";
import { stageColor, resumoDosNumeros, type PipelineCard, type Stage } from "@/lib/pipeline";
import type { ContagensPipeline } from "@/lib/pipeline-fonte";
import type { Member } from "@/lib/team";
import { AreaRolavel, DISSOLVER_LISTA } from "@/components/ui/dissolver-rolagem";
import { CardItem } from "./CardItem";
import { FimDaColuna } from "./FimDaColuna";
import type { ColunaCarregada } from "./colunas";

/** Uma coluna do funil: cabeçalho, resumo, cards e o fim que carrega a próxima página. */
export function ColunaDoPipeline({
  stage,
  cards: colCards,
  coluna,
  numeros,
  dragOverKey,
  setDragOverKey,
  escondidaNoCelular,
  membersById,
  onMoverCard,
  onAbrir,
  onMoverNoCelular,
  carregarMais,
}: {
  stage: Stage;
  cards: PipelineCard[];
  coluna: ColunaCarregada | undefined;
  numeros: ContagensPipeline["porColuna"][string];
  dragOverKey: string | null;
  setDragOverKey: (v: string | null | ((k: string | null) => string | null)) => void;
  escondidaNoCelular: boolean;
  membersById: Record<string, Member>;
  onMoverCard: (phone: string, toKey: string) => void;
  onAbrir: (phone: string) => void;
  onMoverNoCelular: (card: PipelineCard) => void;
  carregarMais: (key: string) => Promise<void>;
}) {
  const over = dragOverKey === stage.key;
  return (
    // `bg-msg`: a coluna é a bandeja recuada e o card é o que sobe
    // dentro dela. Antes coluna e página dividiam `--surface`, então no
    // escuro a coluna sumia no fundo e o card é que era o poço escuro,
    // que é a hierarquia ao contrário.
    <div
      key={stage.key}
      // Marcadores para o e2e. A coluna não tinha como ser encontrada a
      // não ser por classe de layout, e teste preso a classe quebra na
      // primeira mudança de estilo sem que nada de verdade tenha
      // quebrado.
      data-slot="pipeline-coluna"
      data-stage={stage.key}
      onDragOver={(e) => {
        e.preventDefault();
        if (dragOverKey !== stage.key) setDragOverKey(stage.key);
      }}
      onDragLeave={(e) => {
        // só limpa se saiu de fato da coluna (não ao passar por um filho)
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragOverKey((k) => (k === stage.key ? null : k));
      }}
      onDrop={(e) => {
        e.preventDefault();
        const phone = e.dataTransfer.getData("text/plain");
        setDragOverKey(null);
        if (phone) void onMoverCard(phone, stage.key);
      }}
      className={cn(
        `flex w-72 shrink-0 flex-col rounded-xl border bg-msg transition-colors ${
          over
            ? "border-brand-ink ring-1 ring-[var(--brand-ink)]"
            : "border-line"
        }`,
        // Celular: só a coluna escolhida na faixa, na largura toda.
        "max-md:w-full max-md:flex-1 max-md:rounded-none max-md:border-0",
        escondidaNoCelular && "max-md:hidden"
      )}
    >
      <div className="border-b border-line px-3 py-2.5 max-md:px-4">
        {/* O nome já está na faixa de cima; no celular fica só o
            resumo do estágio. */}
        <div className="flex items-center gap-2 max-md:hidden">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: stageColor(stage.color) }}
            aria-hidden
          />
          <span className="truncate text-apoio font-semibold">
            {stage.name}
          </span>
          <span className="ml-auto text-legenda tabular-nums text-ink-3">
            {numeros.total}
          </span>
        </div>
        {/* Subtítulo da coluna (desenho de 18/09/2026): quantos esperam
            você e há quanto tempo está o mais parado. É o que transforma
            uma pilha de cards em "onde o funil travou", que é a pergunta
            que a tela existe para responder. Some sozinho quando não há o
            que dizer, em vez de virar uma linha vazia em toda coluna. */}
        {(() => {
          const resumo = resumoDosNumeros(numeros);
          return resumo ? (
            <div
              data-slot="pipeline-coluna-resumo"
              className="mt-0.5 truncate text-legenda text-ink-3"
              suppressHydrationWarning
            >
              {resumo}
            </div>
          ) : null;
        })()}
      </div>
      {/* Regra da casa: area rolavel dissolve nas bordas. Degrau de
          LISTA, porque o item aqui e um card de tres linhas.
          ⚠️ COMPONENTE e nao o hook: esta area e UMA POR ESTAGIO, e
          chamar o hook dentro do map seria hook em laco. */}
      <AreaRolavel
        tamanho={DISSOLVER_LISTA}
        className="flex min-h-0 flex-1 flex-col gap-2 p-2"
      >
        {colCards.length === 0 && (
          // "Nenhuma conversa aqui" e não "Vazio": vazio descreve a caixa,
          // a frase descreve o funil, e é o funil que a pessoa está lendo.
          <div className="px-2 py-6 text-center text-legenda text-ink-3">
            Nenhuma conversa aqui
          </div>
        )}
        {colCards.map((c) => (
          <CardItem
            key={c.phone}
            card={c}
            member={c.assignedUserId ? membersById[c.assignedUserId] : null}
            onOpen={() =>
              onAbrir(c.phone)
            }
            onMover={() => onMoverNoCelular(c)}
          />
        ))}
        {/* O fim da coluna: quando aparece, vem a próxima página DELA. */}
        {coluna?.temMais && (
          <FimDaColuna onVisivel={() => void carregarMais(stage.key)} />
        )}
        {coluna?.carregando && (
          <div className="px-2 py-2 text-center text-legenda text-ink-3">Carregando…</div>
        )}
      </AreaRolavel>
    </div>
  );
}
