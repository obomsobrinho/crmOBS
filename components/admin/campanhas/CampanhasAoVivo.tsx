"use client";

import { useMemo } from "react";
import { fonteDasRotas } from "@/lib/campanhas-fonte";
import { VARIANTES_SUGERIDAS } from "@/lib/prospeccao";
import CentralDeCampanhas from "./CentralDeCampanhas";
import type { Tela } from "./tipos";

// A ponte da página de verdade: a fonte guarda funções, e função não atravessa do
// servidor para o navegador, então ela nasce aqui (uma por página).
export default function CampanhasAoVivo({ agora }: { agora: number }) {
  const fonte = useMemo(() => fonteDasRotas(), []);
  const tela = useMemo<Tela>(() => ({ aba: "leads", busca: null }), []);
  return <CentralDeCampanhas telaInicial={tela} agora={agora} fonte={fonte} variantesSugeridas={VARIANTES_SUGERIDAS} />;
}
