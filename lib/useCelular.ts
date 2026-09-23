"use client";

import { useSyncExternalStore } from "react";

/**
 * `true` abaixo de `md` (768px), o limite do celular no plano do mobile.
 *
 * ⚠️ Só para quando o COMPORTAMENTO muda (o que um toque abre: folha de baixo em
 * vez de formulário no lugar). Aparência se resolve com `max-md:` na classe, no
 * mesmo componente. No servidor devolve `false`, então o primeiro HTML é sempre
 * o do desktop e o celular troca depois de hidratar.
 */
const CONSULTA = "(max-width: 767px)";

function assinar(avisar: () => void) {
  const m = window.matchMedia(CONSULTA);
  m.addEventListener("change", avisar);
  return () => m.removeEventListener("change", avisar);
}

export function useCelular(): boolean {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}
