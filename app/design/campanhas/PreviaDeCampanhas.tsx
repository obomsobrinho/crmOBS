"use client";

import { useMemo } from "react";
import CentralDeCampanhas from "@/components/admin/campanhas/CentralDeCampanhas";
import type { FonteDeCampanhas, InicialDaCentral, Tela } from "@/components/admin/campanhas/tipos";
import { VARIANTES_SUGERIDAS } from "@/lib/prospeccao";
import { dadosDeMentira } from "./dados";
import { fonteDeMentira } from "./fonte-de-mentira";

/** Uma fonte em que nenhuma leitura volta (`?cenario=travado`): prova o tempo limite da tela. */
function fonteTravada(base: FonteDeCampanhas): FonteDeCampanhas {
  const nunca = () => new Promise<never>(() => undefined);
  return Object.fromEntries(Object.keys(base).map((k) => [k, nunca])) as unknown as FonteDeCampanhas;
}

// A ponte do preview: a fonte de mentira guarda funções e estado, e isso não
// atravessa do servidor para o navegador, então ela nasce aqui (com os mesmos dados
// que o servidor usou para a primeira tela, `inicial`).
export default function PreviaDeCampanhas({
  tela,
  agora,
  vazio,
  travado,
  inicial,
}: {
  tela: Tela;
  agora: number;
  vazio: boolean;
  travado: boolean;
  inicial: InicialDaCentral | null;
}) {
  const fonte = useMemo(() => {
    const f = fonteDeMentira(dadosDeMentira(agora, vazio), agora);
    return travado ? fonteTravada(f) : f;
  }, [agora, vazio, travado]);
  return (
    <CentralDeCampanhas telaInicial={tela} agora={agora} fonte={fonte} variantesSugeridas={VARIANTES_SUGERIDAS} inicial={inicial} />
  );
}
