"use client";

import { useCallback, useEffect, useState } from "react";

// UMA LEITURA SOB DEMANDA, com a falha e o "tentar de novo" prontos (as abas da
// central do dono: Uso de IA e Atendimento). Lê UMA vez ao montar, e de novo só
// quando `tentarDeNovo` é chamado. `buscar` precisa ser estável (um método de
// objeto memoizado, como `fonte.uso`): mudar a identidade lê de novo. Resposta de
// uma leitura que já foi trocada é jogada fora.
export function useCarga<T>(buscar: () => Promise<T>): {
  dados: T | null;
  erro: boolean;
  tentarDeNovo: () => void;
} {
  const [estado, setEstado] = useState<{ dados: T | null; erro: boolean }>({ dados: null, erro: false });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    buscar()
      .then((dados) => {
        if (vivo) setEstado({ dados, erro: false });
      })
      .catch((e) => {
        console.error("leitura da central:", e);
        if (vivo) setEstado((cur) => ({ ...cur, erro: true }));
      });
    return () => {
      vivo = false;
    };
  }, [buscar, tentativa]);

  const tentarDeNovo = useCallback(() => {
    setEstado((cur) => ({ ...cur, erro: false }));
    setTentativa((n) => n + 1);
  }, []);

  return { ...estado, tentarDeNovo };
}
