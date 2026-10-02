"use client";

import { Check } from "lucide-react";
import { prettyPhone } from "@/lib/format";
import { stageColor, type PipelineCard, type Stage } from "@/lib/pipeline";
import { Button } from "@/components/ui/button";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/** A folha de mover (celular): escolhe o estágio de destino do card. */
export function MoverSheet({
  movendo,
  activeStages,
  estagioDoCard,
  onFechar,
  onMover,
}: {
  movendo: PipelineCard | null;
  activeStages: Stage[];
  estagioDoCard: (card: PipelineCard) => string | null;
  onFechar: () => void;
  onMover: (phone: string, toKey: string) => void;
}) {
  return (
    <>
      {/* A FOLHA DE MOVER (celular). Chama o MESMO `moveCard` do arrastar:
          mesma escrita de `stage` e `stage_source='human'`, então a IA
          continua sem desfazer. Arrastar segue só no desktop.
          ⚠️ O desenho tem "Desfazer" aqui e ele NÃO entrou: é decisão pendente
          do dono (PENDENTE 3 do plano do mobile). */}
      <Sheet open={movendo !== null} onOpenChange={(v) => !v && onFechar()}>
        <SheetContent lado="baixo" aria-describedby="mover-sub">
          <div className="border-b border-line px-4 pb-3 pt-3">
            <SheetTitle className="text-cartao">
              Mover {movendo ? movendo.name || prettyPhone(movendo.phone) : ""}
            </SheetTitle>
            <p id="mover-sub" className="text-legenda text-ink-3">
              Vira &quot;Movido pelo time&quot;, e a IA não desfaz.
            </p>
          </div>
          {/* A lista de estágios cresce com o funil: rola, e dissolve nas bordas. */}
          <AreaRolavel className="flex flex-col p-2">
            {movendo &&
              activeStages.map((s) => {
                const atual = estagioDoCard(movendo) === s.key;
                return (
                  <Button
                    key={s.key}
                    variant="linha"
                    size="linha"
                    data-slot="mover-estagio"
                    disabled={atual}
                    onClick={() => {
                      const phone = movendo.phone;
                      onFechar();
                      onMover(phone, s.key);
                    }}
                    // O estágio atual não é recusa, é "você já está aqui": sem
                    // o fade de desabilitado e sem realce de hover.
                    className="disabled:cursor-default disabled:opacity-100 disabled:hover:bg-transparent"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: stageColor(s.color) }}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{s.name}</span>
                    {atual && (
                      <span className="flex items-center gap-1 text-legenda text-ink-3">
                        <Check size={13} /> atual
                      </span>
                    )}
                  </Button>
                );
              })}
          </AreaRolavel>
        </SheetContent>
      </Sheet>
    </>
  );
}
