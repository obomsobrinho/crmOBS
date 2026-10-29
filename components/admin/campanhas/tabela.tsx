"use client";

import { useState } from "react";
import { CampoBusca } from "@/components/ui/campo-busca";
import { Paginacao } from "@/components/ui/paginacao";
import { cn } from "@/lib/utils";

// AS TABELAS de Campanhas (campanhas, buscas, leads): a barra de cima (busca
// digitando e o botão de filtro, igual a Clientes), o cabeçalho de colunas e a
// paginação numerada embaixo (29/10/2026, dono: páginas de 10, "Mostrando 11 a
// 20 de 137"). De verdade cada página é uma rota (página e total por contagem
// no servidor); no preview a página sai da memória pela mesma forma.

export const POR_PAGINA = 10;

/**
 * Uma página do recorte da memória. Trocar o recorte (`params`) volta para a
 * página 1; a página nunca passa da última (um filtro que encolhe a lista).
 */
export function usePaginaDaMemoria<T, P>({ params, filtrar }: { params: P; filtrar: (p: P) => T[] }) {
  const [pagina, setPagina] = useState(1);
  const [paramsVistos, setParamsVistos] = useState(params);
  if (params !== paramsVistos) {
    setParamsVistos(params);
    setPagina(1);
  }
  const lista = filtrar(params);
  const ultima = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const atual = Math.min(pagina, ultima);
  return {
    itens: lista.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA),
    pagina: atual,
    setPagina,
    total: lista.length,
  };
}

/** A barra de cima da tabela: à esquerda o que a tela quiser (as abas), à direita a busca e o filtro. */
export function BarraDaTabela({
  busca,
  aoBuscar,
  placeholder,
  rotuloDaBusca,
  filtro,
  children,
}: {
  busca: string;
  aoBuscar: (v: string) => void;
  placeholder: string;
  rotuloDaBusca: string;
  /** O `BotaoDeFiltro`. */
  filtro?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
      {children}
      <div className="ml-auto flex w-full min-w-0 items-center gap-2 sm:w-auto">
        <CampoBusca
          className="min-w-0 flex-1 sm:w-72 sm:flex-none"
          valor={busca}
          aoMudar={aoBuscar}
          placeholder={placeholder}
          rotulo={rotuloDaBusca}
          aoLimpar={() => aoBuscar("")}
          mostrarLimpar={busca !== ""}
        />
        {filtro}
      </div>
    </div>
  );
}

/** A grade das colunas: só no desktop largo; abaixo dele cada linha empilha. */
export function CabecalhoDaTabela({ grade, colunas }: { grade: string; colunas: string[] }) {
  return (
    <div aria-hidden className={cn("hidden border-b border-line px-5 py-2.5 text-rotulo uppercase text-ink-3", grade)}>
      {colunas.map((c, i) => (
        <span key={`${c}-${i}`}>{c}</span>
      ))}
    </div>
  );
}

/** O rodapé: a paginação numerada. */
export function RodapeDaTabela({
  pagina,
  total,
  aoMudar,
  slot,
}: {
  pagina: number;
  total: number;
  aoMudar: (p: number) => void;
  slot: string;
}) {
  return (
    <div className="border-t border-line-soft px-5 py-3" data-slot={`${slot}-rodape`}>
      <Paginacao pagina={pagina} porPagina={POR_PAGINA} total={total} aoMudar={aoMudar} />
    </div>
  );
}
