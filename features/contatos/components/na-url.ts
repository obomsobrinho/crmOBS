"use client";

import { parseAsStringLiteral, useQueryStates } from "nuqs";
import { parametroDeBusca } from "@/lib/url";
import { ROTULO_FILTRO, type FiltroClientes } from "@/lib/clientes";

// A LISTA DE CONTATOS NA URL (passo 3b de docs/plano-dados-e-estado.md, 2.8): o
// filtro e a busca ficam no endereço (refresh e voltar mantêm). Os dois substituem a
// entrada do histórico; abrir um contato é a rota `/contatos/{id}`, que já empilha.

const FILTROS = Object.keys(ROTULO_FILTRO) as FiltroClientes[];

export function useContatosNaUrl() {
  const [u, setU] = useQueryStates({ filtro: parseAsStringLiteral(FILTROS).withDefault("todos"), q: parametroDeBusca });
  return { filtro: u.filtro, q: u.q, setU };
}
