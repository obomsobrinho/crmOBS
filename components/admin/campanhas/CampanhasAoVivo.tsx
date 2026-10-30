"use client";

import { useMemo } from "react";
import { fonteDasRotas } from "@/lib/campanhas-fonte";
import { VARIANTES_SUGERIDAS } from "@/lib/prospeccao";
import CentralDeCampanhas from "./CentralDeCampanhas";
import type { Tela } from "./tipos";

// A ponte da página de verdade: a fonte guarda funções, e função não atravessa do
// servidor para o navegador, então ela nasce aqui (uma por página).
const TELA_INICIAL: Tela = { aba: "leads", busca: null };

export default function CampanhasAoVivo({ agora }: { agora: number }) {
  const fonte = useMemo(() => fonteDasRotas(), []);
  return <CentralDeCampanhas telaInicial={TELA_INICIAL} agora={agora} fonte={fonte} variantesSugeridas={VARIANTES_SUGERIDAS} />;
}
