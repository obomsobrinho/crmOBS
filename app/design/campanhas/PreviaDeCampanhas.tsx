"use client";

import { useMemo } from "react";
import CentralDeCampanhas from "@/features/campanhas/components/CentralDeCampanhas";
import { ProvedorDeDados } from "@/lib/query/provedor";
import type { FonteDeCampanhas, InicialDaCentral, Tela } from "@/features/campanhas/components/tipos";
import { VARIANTES_SUGERIDAS } from "@/features/campanhas/regras";
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
  // O mesmo cliente de dados da página de verdade, um por cenário: trocar de cenário
  // (vazio, travado) não herda o cache do outro.
  return (
    <ProvedorDeDados identidade={`design:${vazio}:${travado}`}>
      <CentralDeCampanhas telaInicial={tela} agora={agora} fonte={fonte} variantesSugeridas={VARIANTES_SUGERIDAS} inicial={inicial} />
    </ProvedorDeDados>
  );
}
