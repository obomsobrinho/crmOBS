"use client";

import { KanbanSquare, Search, Settings2 } from "lucide-react";
import { memberName, type Member } from "@/lib/team";
import type { Stage } from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** O cabeçalho do funil: título, busca, filtros e a gestão de estágios. */
export function PipelineFiltros({
  shownCount,
  isOwner,
  search,
  setSearch,
  buscaAberta,
  setBuscaAberta,
  attFilter,
  setAttFilter,
  stageFilter,
  setStageFilter,
  members,
  activeStages,
  esperandoCount,
  soEsperando,
  onAlternarEsperando,
  onGerenciar,
}: {
  shownCount: number;
  isOwner: boolean;
  search: string;
  setSearch: (v: string) => void;
  buscaAberta: boolean;
  setBuscaAberta: (v: boolean | ((v: boolean) => boolean)) => void;
  attFilter: string;
  setAttFilter: (v: string) => void;
  stageFilter: string;
  setStageFilter: (v: string) => void;
  members: Member[];
  activeStages: Stage[];
  esperandoCount: number;
  soEsperando: boolean;
  onAlternarEsperando: () => void;
  onGerenciar: () => void;
}) {
  return (
    <>
      {/* Cabeçalho + filtros */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 max-md:gap-2 max-md:px-4 max-md:py-3">
        <div className="mr-1 flex items-center gap-2 max-md:mr-auto">
          <KanbanSquare size={20} className="text-brand-ink" />
          <h1 className="text-titulo">Pipeline</h1>
          <span className="text-legenda tabular-nums text-ink-3">{shownCount}</span>
        </div>

        {/* Celular: busca e gestão viram ÍCONES na linha do título (desenho
            do mobile); a busca abre o campo embaixo. */}
        <Button
          variant="ghost"
          size="none"
          onClick={() => setBuscaAberta((v) => !v)}
          // Nome diferente do campo de propósito: o campo já se chama "Buscar
          // cards", e dois alvos com o mesmo nome confundem leitor de tela e teste.
          aria-label="Abrir a busca"
          aria-pressed={buscaAberta}
          className="size-11 rounded-lg text-ink-2 md:hidden"
        >
          <Search size={19} />
        </Button>
        {isOwner && (
          <Button
            variant="ghost"
            size="none"
            onClick={() => onGerenciar()}
            aria-label="Gerenciar estágios"
            className="size-11 rounded-lg text-ink-2 md:hidden"
          >
            <Settings2 size={19} />
          </Button>
        )}

        {/* Mesmo campo com lupa da lista de conversas: moldura no degrau de
            controle, ícone em tinta fraca e o Input sem moldura própria. */}
        <div
          className={cn(
            "flex h-[var(--h-control)] items-center gap-2 rounded-lg border border-line bg-[var(--input-bg)] px-3 transition-colors focus-within:border-brand-line max-md:order-last max-md:h-11 max-md:w-full",
            !buscaAberta && !search && "max-md:hidden"
          )}
        >
          <Search size={15} className="shrink-0 text-ink-faint" />
          <Input
            variant="limpo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome ou telefone"
            aria-label="Buscar cards"
            className="w-44 text-apoio max-md:w-full"
          />
        </div>

        <Select value={attFilter} onValueChange={setAttFilter}>
          <SelectTrigger
            aria-label="Filtrar por atendente"
            // Pílula no celular (desenho do mobile).
            className="max-md:h-9 max-md:rounded-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os atendentes</SelectItem>
            <SelectItem value="none">Sem atendente</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>
                {memberName(m.email)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={stageFilter} onValueChange={setStageFilter}>
          {/* Some no celular: lá a faixa de estágios JÁ é o filtro. */}
          <SelectTrigger aria-label="Filtrar por estágio" className="max-md:hidden">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estágios</SelectItem>
            {activeStages.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* "Esperando você", com a contagem (desenho de 18/09/2026). Fica ao lado
            dos outros recortes porque é o mesmo gesto, e some quando não há
            nenhum: um filtro que sempre mostra zero só ocupa espaço. */}
        {esperandoCount > 0 && (
          <Button
            variant="outline"
            onClick={onAlternarEsperando}
            aria-pressed={soEsperando}
            className={cn(
              "gap-1.5 text-warn-ink max-md:h-9 max-md:rounded-full",
              soEsperando
                ? "border-warn-line bg-warn-surface"
                : "hover:bg-warn-surface"
            )}
          >
            Esperando você
            <span className="tabular-nums">{esperandoCount}</span>
          </Button>
        )}

        {isOwner && (
          <Button
            variant="outline"
            onClick={() => onGerenciar()}
            className="ml-auto max-md:hidden"
          >
            <Settings2 size={15} /> Gerenciar estágios
          </Button>
        )}
      </div>
    </>
  );
}
