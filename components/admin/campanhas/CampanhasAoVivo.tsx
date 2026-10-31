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
const TELA_INICIAL: Tela = { aba: "leads", busca: null };

export default function CampanhasAoVivo({
  agora,
  inicial,
  rascunhoEsperandoId,
}: {
  agora: number;
  inicial: InicialDaCentral;
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
      telaInicial={TELA_INICIAL}
      agora={agora}
      fonte={fonte}
      variantesSugeridas={VARIANTES_SUGERIDAS}
      inicial={inicial}
      abrirNovaBusca={abrirNovaBusca}
      rascunhoEsperandoId={rascunhoEsperandoId}
    />
  );
}
