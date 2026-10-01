"use client";

import { useEffect, useState } from "react";

/**
 * O valor depois de `ms` sem mudar. É o que faz a busca ir ao servidor só
 * quando a pessoa para de digitar, e não a cada letra.
 */
export function useDebounce<T>(valor: T, ms: number): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}
