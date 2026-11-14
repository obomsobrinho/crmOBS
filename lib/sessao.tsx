"use client";

import { createContext, useContext } from "react";
import type { AccessState } from "@/lib/billing";

/**
 * A sessão do app no navegador (decisão D8 do dono, 14/11/2026,
 * docs/plano-dados-e-estado.md 2.1 e 2.3). O layout do `(app)` lê UMA vez, no
 * carregamento da página (`getMyClient`), e entrega aqui: nenhuma tela de área
 * migrada volta ao banco a cada clique para saber quem é a pessoa.
 *
 * É a ÚNICA exceção da regra "Context nunca carrega dado": são escalares da
 * conta, não dado de tela. A trava de verdade continua no servidor (RLS e as
 * rotas de escrita com `sessaoDaRota`); isto decide só para onde mandar.
 */
export interface SessaoDoApp {
  clientId: string;
  userId: string;
  nome: string;
  papel: string | null;
  access: AccessState;
  contaDesativada: boolean;
  temWhatsapp: boolean;
  avisos: string | null;
}

const Contexto = createContext<SessaoDoApp | null>(null);

export function ProvedorDeSessao({ sessao, children }: { sessao: SessaoDoApp; children: React.ReactNode }) {
  return <Contexto.Provider value={sessao}>{children}</Contexto.Provider>;
}

/** A sessão do app. Fora do `(app)` (o `/design`, por exemplo) não existe: lança. */
export function useSessao(): SessaoDoApp {
  const s = useContext(Contexto);
  if (!s) throw new Error("useSessao fora do ProvedorDeSessao");
  return s;
}

/** Igual a `useSessao`, mas devolve `null` fora do app (peças usadas também no `/design`). */
export function useSessaoOpcional(): SessaoDoApp | null {
  return useContext(Contexto);
}
