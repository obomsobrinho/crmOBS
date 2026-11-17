"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampoBusca } from "@/components/ui/campo-busca";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Paginacao } from "@/components/ui/paginacao";
import { LIMITE_DA_LEITURA_MS } from "@/features/campanhas/api/fonte";
import { POR_PAGINA_DE_CAMPANHAS } from "@/features/campanhas/regras";
import { cn } from "@/lib/utils";
import type { Pagina } from "./tipos";

// AS TABELAS de Campanhas (campanhas, buscas, leads): a barra de cima (busca
// digitando e o botão de filtro, igual a Clientes), o cabeçalho de colunas e a
// paginação numerada embaixo (29/10/2026, dono: páginas de 10, "Mostrando 11 a
// 20 de 137"). Cada página é uma leitura da fonte (página e total por contagem no
// servidor; no preview, a fonte de mentira em memória responde igual).

/** A mesma página da rota (`features/campanhas/regras.ts`), para o rodapé nunca discordar do servidor. */
export const POR_PAGINA = POR_PAGINA_DE_CAMPANHAS;


/** O prefixo de TODA leitura de Campanhas no cache de dados: invalidar ele relê o que está na tela. */
export const CHAVE_DE_CAMPANHAS = ["campanhas"] as const;
/** A chave de uma leitura (os parâmetros dela em texto, como sempre foi). */
export const chaveDaLeitura = (chave: string) => [...CHAVE_DE_CAMPANHAS, "leitura", chave] as const;

/** Uma leitura que não volta vira falha com "Tentar de novo", nunca um "Carregando" eterno. */
function comPrazo<T>(p: Promise<T>): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => rejeitar(new Error(`leitura passou de ${LIMITE_DA_LEITURA_MS} ms`)), LIMITE_DA_LEITURA_MS);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(relogio));
}

/**
 * UMA LEITURA da fonte, pelo cache de dados (passo 2 de docs/plano-dados-e-estado.md):
 * a mesma `chave` não lê de novo por 30 s, então trocar de aba e voltar de Nova busca
 * abrem do cache, sem requisição. Enquanto uma chave nova chega, a anterior continua
 * na tela (a tabela não pisca). `mudar` corrige o que está na tela sem ler de novo
 * (marcar um lead muda só aquela linha). Campanhas não tem realtime: a volta do foco
 * relê o que estiver velho.
 *
 * `inicial` (o que o servidor já leu) entra como dado fresco: o navegador NÃO lê de
 * novo o que o servidor acabou de mandar (era a leitura dupla, B3).
 */
export function useLeitura<T>(chave: string, ler: () => Promise<T>, inicial: T | null = null) {
  const qc = useQueryClient();
  const lerAtual = useRef(ler);
  useEffect(() => {
    lerAtual.current = ler;
  });
  const queryKey = useMemo(() => chaveDaLeitura(chave), [chave]);
  const q = useQuery({
    queryKey,
    queryFn: () =>
      comPrazo(lerAtual.current()).catch((e: unknown) => {
        console.error("campanhas, leitura:", e);
        throw e;
      }),
    initialData: inicial ?? undefined,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    // Já espera o prazo de 20 s; repetir dobraria a espera do "Tentar de novo".
    retry: false,
  });
  const recarregar = useCallback(() => void q.refetch(), [q]);
  const mudar = useCallback(
    (f: (d: T) => T) => qc.setQueryData<T>(queryKey, (d) => (d === undefined ? d : f(d))),
    [qc, queryKey],
  );
  return {
    dados: (q.data ?? null) as T | null,
    erro: q.isError,
    carregando: q.isPending || q.isPlaceholderData,
    recarregar,
    mudar,
  };
}

/**
 * Uma PÁGINA da fonte (10 por página, total contado no servidor). Trocar o recorte
 * (`chave`) volta para a página 1; uma `versao` nova (depois de uma escrita) relê a
 * MESMA página; uma página que ficou além do fim (um filtro que encolheu a lista)
 * volta para a última.
 */
export function usePaginaDaFonte<T>(
  chave: string,
  ler: (pagina: number) => Promise<Pagina<T>>,
  versao = 0,
  /** A primeira página que o servidor já leu (só para o recorte padrão). */
  inicial: Pagina<T> | null = null,
) {
  const [pagina, setPagina] = useState(1);
  const [chaveVista, setChaveVista] = useState(chave);
  if (chave !== chaveVista) {
    setChaveVista(chave);
    setPagina(1);
  }
  // O que o servidor leu vale SÓ para a chave que ele leu (o recorte padrão, página 1).
  // Com o cache, passar para outra chave faria a página 2 nascer com os dados da 1.
  const chaveDaPagina = `${chave}|${pagina}|${versao}`;
  const [chaveDoServidor] = useState(chaveDaPagina);
  const lida = useLeitura(chaveDaPagina, () => ler(pagina), chaveDaPagina === chaveDoServidor ? inicial : null);
  const total = lida.dados?.total ?? 0;
  const ultima = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (lida.dados && !lida.carregando && pagina > ultima) setPagina(ultima);
  const { mudar } = lida;
  const mudarItem = useCallback(
    (f: (item: T) => T) => mudar((d) => ({ ...d, itens: d.itens.map(f) })),
    [mudar],
  );
  return {
    itens: lida.dados?.itens ?? [],
    pagina,
    setPagina,
    total,
    lido: lida.dados !== null,
    erro: lida.erro,
    recarregar: lida.recarregar,
    mudarItem,
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

/**
 * O botão de apagar no fim de uma linha (fora da grade, ao lado do botão da linha). O `comAcao` do
 * cabeçalho reserva a largura dele: 28 do botão, 12 da margem e 20 do `px-5`.
 */
export function BotaoDeApagarDaLinha({ rotulo, aoClicar, slot }: { rotulo: string; aoClicar: () => void; slot: string }) {
  return (
    <Button variant="danger-ghost" size="icon-chrome" aria-label={rotulo} onClick={aoClicar} className="mr-3 shrink-0" data-slot={slot}>
      <Trash2 aria-hidden />
    </Button>
  );
}

/** A grade das colunas: só no desktop largo; abaixo dele cada linha empilha. `comAcao` = a linha tem o `BotaoDeApagarDaLinha`. */
export function CabecalhoDaTabela({ grade, colunas, comAcao = false }: { grade: string; colunas: string[]; comAcao?: boolean }) {
  return (
    <div aria-hidden className={cn("hidden border-b border-line px-5 py-2.5 text-rotulo uppercase text-ink-3", comAcao && "pr-[60px]", grade)}>
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
  lido,
}: {
  pagina: number;
  total: number;
  aoMudar: (p: number) => void;
  slot: string;
  /** Sem a primeira leitura não há o que paginar: nada de "Nenhum resultado" embaixo de "Carregando". */
  lido: boolean;
}) {
  if (!lido) return null;
  return (
    <div className="border-t border-line-soft px-5 py-3" data-slot={`${slot}-rodape`}>
      <Paginacao pagina={pagina} porPagina={POR_PAGINA} total={total} aoMudar={aoMudar} />
    </div>
  );
}

/**
 * O meio da tabela: a primeira leitura ("Carregando"), a falha com "Tentar de novo",
 * o vazio do recorte, ou as linhas.
 */
export function CorpoDaTabela({
  lido,
  erro,
  recarregar,
  vazio,
  quantas,
  children,
}: {
  lido: boolean;
  erro: boolean;
  recarregar: () => void;
  vazio: string;
  quantas: number;
  children: React.ReactNode;
}) {
  if (erro && !lido)
    return (
      <EstadoVazio tamanho="compacto" texto="Não deu para carregar agora.">
        <Button variant="outline" size="control" className="mt-2" onClick={recarregar}>
          Tentar de novo
        </Button>
      </EstadoVazio>
    );
  if (!lido) return <EstadoVazio tamanho="compacto" texto="Carregando…" />;
  if (quantas === 0) return <EstadoVazio tamanho="compacto" texto={vazio} />;
  return children;
}
