"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// LISTA PAGINADA COM ROLAGEM INFINITA (docs/plano-carregamento.md, regra do
// dono: "carregar mais de 10 de uma vez é desnecessário").
//
// A primeira página vem do SERVIDOR (o gancho não busca ao montar). Trocar o
// recorte (`params`) busca a primeira página do recorte novo; o marcador do fim
// (`fimRef`) busca a seguinte quando aparece, e continua buscando enquanto a
// lista não enche a altura da área; voltar para a aba revalida o que está na
// tela, no máximo a cada 10s. Resposta de um recorte antigo é jogada fora.
//
// A lista de conversas tem a sua própria versão (ela encaixa linha do realtime);
// esta é a das telas sem realtime por linha (Clientes, Pipeline).

export function usePaginada<T, P>({
  inicial,
  temMaisInicial,
  params,
  buscar,
  chave,
  tamanho = 10,
  revalidarAoVoltar = true,
  aoRevalidar,
}: {
  /** Chamado a cada revalidação (ex.: recontar os chips). */
  aoRevalidar?: () => void;
  inicial: T[];
  temMaisInicial: boolean;
  /** O recorte. Precisa ser estável (useMemo): mudar a identidade busca de novo. */
  params: P;
  /** Até `n` itens depois de `depois` (null = do começo). */
  buscar: (p: P, depois: T | null, n: number) => Promise<T[]>;
  chave: (t: T) => string | number;
  tamanho?: number;
  revalidarAoVoltar?: boolean;
}) {
  const [itens, setItens] = useState<T[]>(inicial);
  const [temMais, setTemMais] = useState(temMaisInicial);
  const [carregando, setCarregando] = useState(false);

  // O servidor mandou outra primeira página (router.refresh depois de um
  // cadastro): ela vence o que estava na tela. Ajuste em tempo de render.
  const [inicialVisto, setInicialVisto] = useState(inicial);
  if (inicial !== inicialVisto) {
    setInicialVisto(inicial);
    setItens(inicial);
    setTemMais(temMaisInicial);
  }

  const paramsRef = useRef(params);
  const itensRef = useRef(itens);
  const temMaisRef = useRef(temMais);
  const buscarRef = useRef(buscar);
  const aoRevalidarRef = useRef(aoRevalidar);
  useEffect(() => {
    aoRevalidarRef.current = aoRevalidar;
    paramsRef.current = params;
    itensRef.current = itens;
    temMaisRef.current = temMais;
    buscarRef.current = buscar;
  });
  const versaoRef = useRef(0);
  const ocupadoRef = useRef(false);

  /** Busca de novo as N primeiras (as que estão na tela, ou uma página). */
  const revalidar = useCallback(
    async (quantas?: number) => {
      const v = ++versaoRef.current;
      const n = Math.min(50, Math.max(tamanho, quantas ?? itensRef.current.length));
      aoRevalidarRef.current?.();
      setCarregando(true);
      try {
        const lista = await buscarRef.current(paramsRef.current, null, n);
        if (v !== versaoRef.current) return;
        setItens(lista);
        setTemMais(lista.length === n);
      } catch (e) {
        console.error("lista paginada:", e);
      } finally {
        if (v === versaoRef.current) setCarregando(false);
      }
    },
    [tamanho]
  );

  const carregarMais = useCallback(async () => {
    const atuais = itensRef.current;
    if (!temMaisRef.current || ocupadoRef.current || atuais.length === 0) return;
    const v = versaoRef.current;
    ocupadoRef.current = true;
    setCarregando(true);
    try {
      const lista = await buscarRef.current(paramsRef.current, atuais[atuais.length - 1], tamanho);
      if (v !== versaoRef.current) return;
      setItens((cur) => {
        const vistos = new Set(cur.map(chave));
        return [...cur, ...lista.filter((i) => !vistos.has(chave(i)))];
      });
      setTemMais(lista.length === tamanho);
    } catch (e) {
      console.error("mais itens:", e);
    } finally {
      ocupadoRef.current = false;
      if (v === versaoRef.current) setCarregando(false);
    }
  }, [chave, tamanho]);

  // Trocou o recorte: primeira página dele. A primeira renderização veio do servidor.
  const primeiraRef = useRef(true);
  useEffect(() => {
    if (primeiraRef.current) {
      primeiraRef.current = false;
      return;
    }
    void revalidar(tamanho);
  }, [params, revalidar, tamanho]);

  // O marcador do fim: refeito a cada página nova, e por isso continua
  // carregando enquanto a lista não enche a altura da área que rola.
  const fimRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const alvo = fimRef.current;
    if (!alvo || !temMais) return;
    const obs = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) void carregarMais();
      },
      { rootMargin: "200px 0px" }
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [itens.length, temMais, carregarMais]);

  // Voltar para a aba revalida o que está na tela (foco e visibilitychange
  // chegam juntos: um a cada 10s).
  useEffect(() => {
    if (!revalidarAoVoltar) return;
    let ultima = Date.now();
    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultima < 10_000) return;
      ultima = Date.now();
      void revalidar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [revalidar, revalidarAoVoltar]);

  return { itens, setItens, temMais, carregando, fimRef, revalidar };
}
