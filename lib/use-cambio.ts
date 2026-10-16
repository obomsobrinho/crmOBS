"use client";

import { useEffect, useState } from "react";
import type { Cambio } from "./cambio";

// A COTAÇÃO DO DÓLAR NA TELA DA CENTRAL, sem segurar a página. A página do servidor (`lib/cambio-servidor.ts`) NÃO espera a PTAX:
// entrega a PROMESSA, o navegador abre a tela com os custos em US$ e troca para reais quando a cotação chega
// (nunca uma taxa inventada: sem cotação, fica em US$ e a nota diz que está indisponível). No preview e nos
// testes o valor já vem pronto, e nada muda.

/** Uma cotação pronta, a falta dela (`null`) ou a promessa de uma que ainda está sendo buscada. */
export type CambioDaTela = Cambio | null | PromiseLike<Cambio | null>;

function ehPromessa(v: CambioDaTela): v is PromiseLike<Cambio | null> {
  return !!v && typeof (v as PromiseLike<Cambio | null>).then === "function";
}

export function useCambio(entrada: CambioDaTela): { cambio: Cambio | null; buscando: boolean } {
  const [chegou, setChegou] = useState<{ de: CambioDaTela; cambio: Cambio | null } | null>(null);

  useEffect(() => {
    if (!ehPromessa(entrada)) return;
    let vivo = true;
    void entrada.then(
      (cambio) => vivo && setChegou({ de: entrada, cambio }),
      () => vivo && setChegou({ de: entrada, cambio: null })
    );
    return () => {
      vivo = false;
    };
  }, [entrada]);

  if (!ehPromessa(entrada)) return { cambio: entrada, buscando: false };
  // Uma cotação que chegou para OUTRA promessa (outra navegação) não vale para esta.
  return chegou?.de === entrada ? { cambio: chegou.cambio, buscando: false } : { cambio: null, buscando: true };
}
