"use client";

import { parseAsBoolean, parseAsString, useQueryStates } from "nuqs";
import { parametroDeBusca } from "@/lib/url";

// OS FILTROS DO PIPELINE NA URL (passo 3b de docs/plano-dados-e-estado.md, 2.8): busca,
// atendente, estágio e "esperando você" ficam no endereço (refresh e voltar mantêm).
// Todos substituem a entrada do histórico. A busca vai à URL a cada tecla e só a
// leitura espera o atraso (regra de dados-estado-desempenho.md).

export function usePipelineNaUrl() {
  const [u, setU] = useQueryStates({
    q: parametroDeBusca,
    atendente: parseAsString.withDefault("all"),
    estagio: parseAsString.withDefault("all"),
    esperando: parseAsBoolean.withDefault(false),
  });
  return {
    search: u.q,
    setSearch: (v: string) => void setU({ q: v || null }),
    attFilter: u.atendente,
    setAttFilter: (v: string) => void setU({ atendente: v === "all" ? null : v }),
    stageFilter: u.estagio,
    setStageFilter: (v: string) => void setU({ estagio: v === "all" ? null : v }),
    soEsperando: u.esperando,
    setSoEsperando: (v: boolean) => void setU({ esperando: v || null }),
  };
}
