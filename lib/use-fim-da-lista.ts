"use client";

import { useEffect, useRef, useState } from "react";

/**
 * O fim de uma lista infinita (docs/plano-dados-e-estado.md, passo 3): quando o
 * elemento aparece na tela, pede a próxima página. Devolve o `ref` do elemento.
 * O elemento entra e sai com a lista (vazia, carregando), por isso é estado e não
 * ref: o efeito precisa saber quando ele chega.
 */
export function useFimDaLista(temMais: boolean, buscando: boolean, proxima: () => void) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const proximaRef = useRef(proxima);
  useEffect(() => {
    proximaRef.current = proxima;
  });
  useEffect(() => {
    if (!el || !temMais || buscando) return;
    const obs = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) proximaRef.current();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [el, temMais, buscando]);
  return setEl;
}
