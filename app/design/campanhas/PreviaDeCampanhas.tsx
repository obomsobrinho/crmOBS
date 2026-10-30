"use client";

import { useMemo } from "react";
import CentralDeCampanhas from "@/components/admin/campanhas/CentralDeCampanhas";
import type { Tela } from "@/components/admin/campanhas/tipos";
import { VARIANTES_SUGERIDAS } from "@/lib/prospeccao";
import { dadosDeMentira } from "./dados";
import { fonteDeMentira } from "./fonte-de-mentira";

// A ponte do preview: a fonte de mentira guarda funções e estado, e isso não
// atravessa do servidor para o navegador, então ela nasce aqui.
export default function PreviaDeCampanhas({ tela, agora, vazio }: { tela: Tela; agora: number; vazio: boolean }) {
  const fonte = useMemo(() => fonteDeMentira(dadosDeMentira(agora, vazio), agora), [agora, vazio]);
  return <CentralDeCampanhas telaInicial={tela} agora={agora} fonte={fonte} variantesSugeridas={VARIANTES_SUGERIDAS} />;
}
