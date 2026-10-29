"use client";

import { useEffect, useRef, useState } from "react";
import { numeroBR } from "@/lib/format";
import { usePaginada } from "@/lib/use-paginada";
import { cn } from "@/lib/utils";

// AS TABELAS de Campanhas (campanhas, buscas, leads): cabeçalho de colunas, 10
// linhas por página com rolagem infinita e o rodapé "Mostrando 20 de 137". De
// verdade cada página é uma rota (keyset no servidor, busca com debounce e o
// total por contagem); no preview a página sai da memória pela MESMA porta
// (`usePaginada`), para a tela já nascer paginada.

export const POR_PAGINA = 10;

/**
 * A lista paginada do preview: `filtrar(p)` devolve o recorte inteiro da
 * memória e a página sai dele. Quando os dados mudam (`versao`), relê as linhas
 * já carregadas sem voltar para a primeira página.
 */
export function usePaginadaDaMemoria<T, P>({
  params,
  filtrar,
  chave,
  versao,
}: {
  /** Estável (useMemo): mudar a identidade volta para a primeira página. */
  params: P;
  filtrar: (p: P) => T[];
  chave: (t: T) => string;
  /** Muda quando os dados mudam (a lista da memória). */
  versao: unknown;
}) {
  const filtrarRef = useRef(filtrar);
  useEffect(() => {
    filtrarRef.current = filtrar;
  });
  const [inicial] = useState(() => filtrar(params).slice(0, POR_PAGINA));
  const pagina = useRef(async (p: P, depois: T | null, n: number) => {
    const lista = filtrarRef.current(p);
    const i = depois ? lista.findIndex((x) => chave(x) === chave(depois)) + 1 : 0;
    return lista.slice(i, i + n);
  });
  const lista = usePaginada<T, P>({
    inicial,
    temMaisInicial: filtrar(params).length > POR_PAGINA,
    params,
    buscar: (p, depois, n) => pagina.current(p, depois, n),
    chave,
    tamanho: POR_PAGINA,
    revalidarAoVoltar: false,
  });
  const { revalidar } = lista;
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    void revalidar();
  }, [versao, revalidar]);
  return { ...lista, total: filtrar(params).length };
}

/** A grade das colunas: só no desktop largo; abaixo dele cada linha empilha. */
export function CabecalhoDaTabela({ grade, colunas }: { grade: string; colunas: string[] }) {
  return (
    <div aria-hidden className={cn("hidden border-b border-line px-5 py-2.5 text-rotulo uppercase text-ink-3", grade)}>
      {colunas.map((c, i) => (
        <span key={`${c}-${i}`}>
          {c}
        </span>
      ))}
    </div>
  );
}

/** O fim da lista: o marcador da próxima página e "Mostrando 20 de 137". */
export function RodapeDaTabela({
  mostrando,
  total,
  temMais,
  carregando,
  fimRef,
  slot,
}: {
  mostrando: number;
  total: number;
  temMais: boolean;
  carregando: boolean;
  fimRef: React.RefObject<HTMLElement | null>;
  slot: string;
}) {
  return (
    <>
      {temMais && (
        <div
          ref={(el) => {
            fimRef.current = el;
          }}
          data-slot={`${slot}-mais`}
          aria-hidden
          className="h-px"
        />
      )}
      <p className="border-t border-line-soft px-5 py-3 text-legenda text-ink-3" data-slot={`${slot}-rodape`} aria-live="polite">
        {carregando ? "Carregando…" : `Mostrando ${numeroBR(mostrando)} de ${numeroBR(total)}`}
      </p>
    </>
  );
}
