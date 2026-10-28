"use client";

import { useMemo } from "react";
import Agenda, { type PropsAgenda } from "@/components/agenda/Agenda";
import { fonteDaMemoriaAgenda } from "@/lib/agenda-fonte";
import { CONFIG, EXPEDIENTE, SERVICOS, bloqueios, linhas } from "./dados";

// A tela de verdade (`components/agenda/Agenda`) com a fonte em MEMÓRIA: as
// ações só mudam esta aba, com a mesma regra de horário livre do produto.
export default function AgendaDeMemoria(
  props: Omit<PropsAgenda, "fonte" | "inicial" | "configInicial" | "servicosIniciais"> & { vazio: boolean }
) {
  const { vazio, ...resto } = props;
  const { fonte, inicial } = useMemo(() => {
    const dados = {
      linhas: vazio ? [] : linhas(resto.agora),
      bloqueios: vazio ? [] : bloqueios(resto.agora),
      servicos: SERVICOS,
      hours: EXPEDIENTE,
      config: CONFIG,
      agora: resto.agora,
    };
    const semana = (l: { inicio: number; status: string }) => l.status === "confirmado";
    return {
      fonte: fonteDaMemoriaAgenda(dados),
      inicial: {
        itens: dados.linhas.filter(semana).sort((a, b) => a.inicio - b.inicio).slice(0, 10),
        temMais: dados.linhas.filter(semana).length > 10,
        bloqueios: dados.bloqueios,
      },
    };
  }, [vazio, resto.agora]);
  return <Agenda fonte={fonte} inicial={inicial} configInicial={CONFIG} servicosIniciais={SERVICOS} {...resto} />;
}
