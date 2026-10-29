"use client";

import { useMemo } from "react";
import CentralDeCampanhas from "@/components/admin/campanhas/CentralDeCampanhas";
import type { Tela } from "@/components/admin/campanhas/tipos";
import { CONEXOES_DE_MENTIRA, VARIANTES_SUGERIDAS, dadosDeMentira, resultadoDaBuscaDeMentira } from "./dados";

// A ponte do preview: a busca de mentira é uma função, e função não atravessa do
// servidor para o navegador, então os dados de mentira entram aqui.
export default function PreviaDeCampanhas({ tela, agora, vazio }: { tela: Tela; agora: number; vazio: boolean }) {
  const dados = useMemo(() => dadosDeMentira(agora, vazio), [agora, vazio]);
  return (
    <CentralDeCampanhas
      telaInicial={tela}
      agora={agora}
      buscasIniciais={dados.buscas}
      leadsIniciais={dados.leads}
      campanhasIniciais={dados.campanhas}
      conexoes={CONEXOES_DE_MENTIRA}
      variantesSugeridas={VARIANTES_SUGERIDAS}
      simularBusca={resultadoDaBuscaDeMentira}
    />
  );
}
