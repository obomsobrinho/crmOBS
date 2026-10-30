"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CampoBusca } from "@/components/ui/campo-busca";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Paginacao } from "@/components/ui/paginacao";
import { LIMITE_DA_LEITURA_MS } from "@/lib/campanhas-fonte";
import { POR_PAGINA_DE_CAMPANHAS } from "@/lib/prospeccao";
import { cn } from "@/lib/utils";
import type { Pagina } from "./tipos";

// AS TABELAS de Campanhas (campanhas, buscas, leads): a barra de cima (busca
// digitando e o botão de filtro, igual a Clientes), o cabeçalho de colunas e a
// paginação numerada embaixo (29/10/2026, dono: páginas de 10, "Mostrando 11 a
// 20 de 137"). Cada página é uma leitura da fonte (página e total por contagem no
// servidor; no preview, a fonte de mentira em memória responde igual).

/** A mesma página da rota (`lib/prospeccao.ts`), para o rodapé nunca discordar do servidor. */
export const POR_PAGINA = POR_PAGINA_DE_CAMPANHAS;


/**
 * UMA LEITURA da fonte, de novo a cada `chave` nova (os parâmetros dela em texto)
 * ou `recarregar`. Enquanto a próxima chega, a anterior continua na tela (a tabela
 * não pisca). Resposta de uma leitura já trocada é jogada fora. `mudar` corrige o
 * que está na tela sem ler de novo (marcar um lead muda só aquela linha).
 */
export function useLeitura<T>(chave: string, ler: () => Promise<T>, inicial: T | null = null) {
  const lerAtual = useRef(ler);
  useEffect(() => {
    lerAtual.current = ler;
  });
  // `inicial` (o que o servidor já leu) vai direto para a tela, sem "Carregando":
  // o HTML de um refresh já chega com os dados. A leitura do navegador roda mesmo
  // assim, para a tela nunca ficar com um dado velho de outra montagem.
  const [estado, setEstado] = useState<{ dados: T | null; erro: boolean; lida: string | null }>(() => ({
    dados: inicial,
    erro: false,
    lida: inicial === null ? null : chave,
  }));
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let vivo = true;
    // Uma leitura que não volta vira falha com "Tentar de novo", nunca um "Carregando" eterno.
    let relogio: ReturnType<typeof setTimeout> | undefined;
    const limite = new Promise<never>((_, rejeitar) => {
      relogio = setTimeout(() => rejeitar(new Error(`leitura passou de ${LIMITE_DA_LEITURA_MS} ms`)), LIMITE_DA_LEITURA_MS);
    });
    Promise.race([lerAtual.current(), limite])
      .then((dados) => {
        if (vivo) setEstado({ dados, erro: false, lida: chave });
      })
      .catch((e) => {
        console.error("campanhas, leitura:", e);
        if (vivo) setEstado((cur) => ({ ...cur, erro: true, lida: chave }));
      })
      .finally(() => clearTimeout(relogio));
    return () => {
      vivo = false;
      clearTimeout(relogio);
    };
  }, [chave, tentativa]);
  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);
  const mudar = useCallback((f: (d: T) => T) => setEstado((cur) => (cur.dados === null ? cur : { ...cur, dados: f(cur.dados) })), []);
  return { dados: estado.dados, erro: estado.erro, carregando: estado.lida !== chave, recarregar, mudar };
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
  const lida = useLeitura(`${chave}|${pagina}|${versao}`, () => ler(pagina), inicial);
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
