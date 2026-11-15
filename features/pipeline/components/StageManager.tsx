"use client";

import { useState } from "react";
import { Settings2, Plus, X, ArchiveRestore, Trash2, GripVertical, Archive } from "lucide-react";
import {
  stageColor,
  STAGE_COLOR_KEYS,
  type Stage,
  type StagePatch,
} from "@/lib/pipeline";
import { chaveDoRotulo } from "@/lib/rotulos";
import { Button } from "@/components/ui/button";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function StageManager({
  aberto,
  stages,
  onClose,
  onAdd,
  onPatch,
  onDelete,
  onMove,
  onReorder,
}: {
  aberto: boolean;
  stages: Stage[];
  onClose: () => void;
  onAdd: (name: string) => void;
  onPatch: (id: number, patch: StagePatch) => void;
  onDelete: (id: number) => void;
  /** Caminho de teclado: sobe ou desce um lugar. */
  onMove: (id: number, dir: -1 | 1) => void;
  /** Caminho de mouse: solta o arrastado na posição do alvo. */
  onReorder: (fromId: number, toId: number) => void;
}) {
  const [newName, setNewName] = useState("");
  // Quem está sendo arrastado e sobre quem ele está. O segundo existe só para
  // desenhar a linha de inserção: sem retorno visual, arrastar é adivinhação.
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const ordered = [...stages]
    .filter((s) => !s.archived)
    .sort((a, b) => a.position - b.position);
  const archived = stages.filter((s) => s.archived);

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent tamanho="gestao">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Settings2 size={18} className="text-brand-ink" />
            <DialogTitle>Estágios do pipeline</DialogTitle>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-chrome" aria-label="Fechar">
              <X size={18} />
            </Button>
          </DialogClose>
        </div>

        <AreaRolavel className="flex min-h-0 flex-1 flex-col gap-4 p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAdd(newName);
              setNewName("");
            }}
            className="flex gap-2"
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Novo estágio (ex.: Proposta enviada)"
              aria-label="Nome do novo estágio"
              maxLength={40}
              className="flex-1"
            />
            <Button type="submit" size="field" disabled={!newName.trim()}>
              <Plus size={15} /> Criar
            </Button>
          </form>

          <ul className="flex flex-col gap-2">
            {ordered.map((s, i) => (
              <StageRowItem
                key={s.id}
                stage={s}
                canUp={i > 0}
                canDown={i < ordered.length - 1}
                onMove={onMove}
                onPatch={onPatch}
                arrastando={arrastando === s.id}
                alvo={sobre === s.id && arrastando !== null && arrastando !== s.id}
                onDragStart={() => setArrastando(s.id)}
                onDragEnter={() => setSobre(s.id)}
                onDragEnd={() => {
                  setArrastando(null);
                  setSobre(null);
                }}
                onDropOn={() => {
                  if (arrastando !== null) onReorder(arrastando, s.id);
                  setArrastando(null);
                  setSobre(null);
                }}
              />
            ))}
          </ul>

          {archived.length > 0 && (
            <div>
              <div className="mb-2 text-rotulo uppercase text-ink-3">
                Arquivados
              </div>
              <ul className="flex flex-col gap-2">
                {archived.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 rounded-lg border border-line bg-bloco px-3 py-2"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full opacity-60"
                      style={{ background: stageColor(s.color) }}
                    />
                    <span className="flex-1 truncate text-apoio text-ink-2">
                      {s.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="chrome"
                      onClick={() => onPatch(s.id, { archived: false })}
                    >
                      <ArchiveRestore size={13} /> Restaurar
                    </Button>
                    {/* ⚠️ APAGAR DE VEZ (21/09/2026, pedido do dono: o funil
                        dele estava com dezenas de "Teste e2e ... renomeado"
                        arquivados e sem como sumir). Arquivar tirava da tela e
                        deixava para sempre nesta lista, que virou depósito.
                        Só aqui, no arquivado, e nunca na coluna viva: arquivar
                        primeiro é o que torna a decisão deliberada. */}
                    <Button
                      variant="danger-ghost"
                      size="icon-chrome"
                      aria-label={`Apagar ${s.name}`}
                      title="Apagar de vez"
                      onClick={() => onDelete(s.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogDescription className="text-legenda text-ink-3">
            Os estágios Novo, Qualificado e Aguardando atendimento são usados pela
            IA para mover o card sozinha. Você pode renomeá-los e reordená-los.
          </DialogDescription>
        </AreaRolavel>
      </DialogContent>
    </Dialog>
  );
}

function StageRowItem({
  stage,
  canUp,
  canDown,
  onMove,
  onPatch,
  arrastando,
  alvo,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDropOn,
}: {
  stage: Stage;
  canUp: boolean;
  canDown: boolean;
  onMove: (id: number, dir: -1 | 1) => void;
  onPatch: (id: number, patch: StagePatch) => void;
  arrastando: boolean;
  alvo: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
}) {
  const [name, setName] = useState(stage.name);

  function commitName() {
    const clean = name.trim();
    if (clean && clean !== stage.name) onPatch(stage.id, { name: clean });
    else setName(stage.name);
  }

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // O HTML exige carga no dataTransfer para o arraste começar no Firefox.
        e.dataTransfer.setData("text/plain", String(stage.id));
        onDragStart();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        e.preventDefault();
        onDropOn();
      }}
      // A linha inteira é arrastável, então a mãozinha é dela também, e não só
      // do punho: quem pega a linha pela borda não descobria que dava para
      // arrastar. O punho segue existindo para dizer ONDE pegar e para operar por
      // teclado.
      className={`flex cursor-grab items-center gap-2 rounded-lg border bg-bloco px-2 py-2 transition-colors active:cursor-grabbing ${
        arrastando ? "opacity-50" : ""
      } ${alvo ? "border-brand-ink ring-1 ring-[var(--brand-ink)]" : "border-line"}`}
    >
      {/* Punho de arraste. Substituiu as duas setas, mas ELE mesmo responde a
          seta para cima e para baixo: arraste nativo do HTML não funciona por
          teclado, e trocar as setas por arraste puro tiraria a reordenação de
          quem não usa mouse. Um controle, dois jeitos de operar. */}
      <Button
        variant="ghost"
        size="none"
        aria-label={`Reordenar ${stage.name}. Arraste, ou use as setas para cima e para baixo.`}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" && canUp) {
            e.preventDefault();
            onMove(stage.id, -1);
          } else if (e.key === "ArrowDown" && canDown) {
            e.preventDefault();
            onMove(stage.id, 1);
          }
        }}
        className="cursor-grab rounded p-1 text-ink-3 active:cursor-grabbing"
      >
        <GripVertical size={14} />
      </Button>

      {/* Amostra de cor, não botão do sistema: aqui a cor É o conteúdo, então
          nenhuma variante do Button se aplica (todas pintariam por cima). */}
      {/* eslint-disable-next-line no-restricted-syntax -- ver a nota acima: a cor é o conteúdo */}
      <button
        type="button"
        aria-label="Trocar cor"
        title="Trocar cor"
        onClick={() => {
          const i = STAGE_COLOR_KEYS.indexOf(chaveDoRotulo(stage.color));
          const next = STAGE_COLOR_KEYS[(i + 1) % STAGE_COLOR_KEYS.length];
          onPatch(stage.id, { color: next });
        }}
        className="h-4 w-4 shrink-0 rounded-full ring-1 ring-line"
        style={{ background: stageColor(stage.color) }}
      />

      <Input
        variant="limpo"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        maxLength={40}
        className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-apoio transition-colors hover:border-line"
      />

      {stage.isDefault ? (
        <span className="shrink-0 rounded-full bg-[var(--active-bg)] px-2 py-0.5 text-legenda text-ink-2">
          default
        </span>
      ) : (
        <Button
          variant="ghost"
          size="icon-chrome"
          onClick={() => onPatch(stage.id, { archived: true })}
          aria-label="Arquivar estágio"
          title="Arquivar"
        >
          <Archive size={14} />
        </Button>
      )}
    </li>
  );
}
