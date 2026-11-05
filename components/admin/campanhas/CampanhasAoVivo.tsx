"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { fonteDasRotas } from "@/lib/campanhas-fonte";
import { VARIANTES_SUGERIDAS } from "@/lib/prospeccao";
import CentralDeCampanhas from "./CentralDeCampanhas";
import type { InicialDaCentral, Tela } from "./tipos";

// A ponte da página de verdade: a fonte guarda funções, e função não atravessa do
// servidor para o navegador, então ela nasce aqui (uma por página). A Nova busca é
// uma página própria, `/campanhas/buscas/nova`.
const TELA_DE_LEADS: Tela = { aba: "leads", busca: null };
const TELA_DE_CAMPANHAS: Tela = { aba: "campanhas", vista: "lista" };

export default function CampanhasAoVivo({
  agora,
  inicial,
  abrirEmLeads,
  rascunhoEsperandoId,
}: {
  agora: number;
  inicial: InicialDaCentral;
  /** De volta da Nova busca: abre em Leads, não na primeira aba (a página decide e lê o que essa aba mostra). */
  abrirEmLeads: boolean;
  /** A campanha que esperava contatos, de volta da Nova busca (`?rascunho=`). */
  rascunhoEsperandoId: string | null;
}) {
  const fonte = useMemo(() => fonteDasRotas(), []);
  const router = useRouter();
  const abrirNovaBusca = useCallback(
    (rascunho: string | null) => router.push(`/campanhas/buscas/nova${rascunho ? `?rascunho=${rascunho}` : ""}`),
    [router],
  );
  return (
    <CentralDeCampanhas
      telaInicial={abrirEmLeads ? TELA_DE_LEADS : TELA_DE_CAMPANHAS}
      agora={agora}
      fonte={fonte}
      variantesSugeridas={VARIANTES_SUGERIDAS}
      inicial={inicial}
      abrirNovaBusca={abrirNovaBusca}
      rascunhoEsperandoId={rascunhoEsperandoId}
    />
  );
}
