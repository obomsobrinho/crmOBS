"use client";

import { useCallback, useState } from "react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import type { Tela } from "./tipos";

// A TELA de Campanhas na URL (passo 2 de docs/plano-dados-e-estado.md; a queixa "o
// refresh dentro de uma lista volta para a lista geral"): a aba, a lista aberta e a
// campanha aberta ficam no endereço, então recarregar e voltar mantêm onde a pessoa
// estava. Abrir uma lista ou uma campanha cria uma entrada no histórico (o voltar do
// navegador volta para a lista); modo raso, sem ida ao servidor.
//
// A Nova busca do PREVIEW (sem página própria) fica fora da URL: na página de verdade
// ela é a rota `/campanhas/buscas/nova`.

const ABAS = ["campanhas", "leads"] as const;
const VISTAS = ["detalhe", "editar"] as const;

const PARAMETROS = {
  aba: parseAsStringLiteral(ABAS),
  lista: parseAsString,
  campanha: parseAsString,
  vista: parseAsStringLiteral(VISTAS),
};

type NaUrl = {
  aba: (typeof ABAS)[number] | null;
  lista: string | null;
  campanha: string | null;
  vista: (typeof VISTAS)[number] | null;
};

/** O que a URL diz, ou null quando ela não diz nada (vale a tela que a página escolheu). */
export function telaDaUrl(u: NaUrl): Tela | null {
  if (u.aba === "leads") return { aba: "leads", busca: u.lista };
  if (u.aba === "campanhas") {
    return u.campanha && u.vista ? { aba: "campanhas", vista: u.vista, id: u.campanha } : { aba: "campanhas", vista: "lista" };
  }
  return null;
}

/** O endereço de uma tela. Campo que a tela não usa sai da URL. */
export function urlDaTela(t: Tela): NaUrl {
  if (t.aba === "leads") return { aba: "leads", lista: "busca" in t ? t.busca : null, campanha: null, vista: null };
  if (t.vista === "lista") return { aba: "campanhas", lista: null, campanha: null, vista: null };
  return { aba: "campanhas", lista: null, campanha: t.id, vista: t.vista };
}

/** `[tela, mudarTela]`, como o `useState` que existia, agora guardado na URL. */
export function useTelaNaUrl(inicial: Tela): [Tela, (t: Tela) => void] {
  const [u, setU] = useQueryStates(PARAMETROS, { history: "push" });
  const [novaDoPreview, setNovaDoPreview] = useState<Tela | null>(null);
  const tela = novaDoPreview ?? telaDaUrl(u) ?? inicial;
  const mudar = useCallback(
    (t: Tela) => {
      if ("nova" in t) {
        setNovaDoPreview(t);
        return;
      }
      setNovaDoPreview(null);
      void setU(urlDaTela(t));
    },
    [setU],
  );
  return [tela, mudar];
}
