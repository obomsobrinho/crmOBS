"use client";

import { parseAsStringLiteral, useQueryStates } from "nuqs";
import { useSearchParams } from "next/navigation";
import { JANELA_PADRAO, ORDEM_JANELAS } from "@/lib/inbox";
import { parametroDeBusca } from "@/lib/url";

// O RECORTE DA LISTA DE CONVERSAS NA URL (passo 4 de docs/plano-dados-e-estado.md): o
// período, o chip e a busca ficam no endereço, então recarregar e voltar mantêm. Modo
// raso (sem ida ao servidor) e sem entrada nova no histórico a cada tecla. Abrir uma
// conversa leva o recorte junto (`comRecorte`), senão a lista voltaria ao padrão.

const FILTROS = ["all", "needs", "unanswered", "mine"] as const;

const PARAMETROS = {
  periodo: parseAsStringLiteral(ORDEM_JANELAS).withDefault(JANELA_PADRAO),
  filtro: parseAsStringLiteral(FILTROS).withDefault("all"),
  q: parametroDeBusca,
};

export function useConversasNaUrl() {
  const [u, setU] = useQueryStates(PARAMETROS);
  return { periodo: u.periodo, filtro: u.filtro, q: u.q, setU };
}

/** Um caminho de Conversas com o recorte de agora (`/inbox/55...?filtro=needs`). */
export function useComRecorte(): (caminho: string) => string {
  const params = useSearchParams();
  const manter = new URLSearchParams();
  for (const k of Object.keys(PARAMETROS)) {
    const v = params.get(k);
    if (v) manter.set(k, v);
  }
  const sufixo = manter.toString();
  return (caminho) => (sufixo ? `${caminho}?${sufixo}` : caminho);
}
