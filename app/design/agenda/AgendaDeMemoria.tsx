"use client";

import { useMemo } from "react";
import Agenda from "@/components/agenda/Agenda";
import ConfiguracaoDaAgenda from "@/components/agenda/ConfiguracaoDaAgenda";
import { fonteDaMemoriaAgenda } from "@/lib/agenda-fonte";
import { segundaDaSemana } from "@/lib/agenda";
import { diaIsoSP } from "@/lib/fuso";
import { CONFIG, CONTATOS, EMPRESA, EXPEDIENTE, SERVICOS, bloqueios, linhas } from "./dados";

// A tela de verdade (agenda e configurações) com a fonte em MEMÓRIA: as ações
// só mudam esta aba, com a mesma regra de horário livre do produto.
function useFonte(agora: number, vazio: boolean, semHorario: boolean) {
  return useMemo(() => {
    const dados = {
      linhas: vazio ? [] : linhas(agora),
      bloqueios: vazio ? [] : bloqueios(agora),
      servicos: SERVICOS,
      hours: EXPEDIENTE,
      config: CONFIG,
      contatos: CONTATOS,
      agora,
    };
    return { fonte: fonteDaMemoriaAgenda(dados), dados, hours: semHorario ? null : EXPEDIENTE };
  }, [agora, vazio, semHorario]);
}

export function AgendaDeMemoria(props: {
  agora: number;
  dono: boolean;
  disponivel: boolean;
  semHorario: boolean;
  vazio: boolean;
}) {
  const { fonte, dados, hours } = useFonte(props.agora, props.vazio, props.semHorario);
  const semana = segundaDaSemana(diaIsoSP(props.agora));
  return (
    <Agenda
      fonte={fonte}
      agora={props.agora}
      empresa={EMPRESA}
      dono={props.dono}
      disponivel={props.disponivel}
      hours={hours}
      horarioAtendimento={hours}
      config={CONFIG}
      servicos={SERVICOS}
      inicial={{
        semana,
        itens: dados.linhas.filter((l) => l.status === "confirmado"),
        bloqueios: dados.bloqueios,
      }}
      hrefConfig="/design/agenda/configuracoes"
    />
  );
}

export function ConfiguracaoDeMemoria(props: { agora: number; desligada: boolean; semHorario: boolean }) {
  const { fonte, hours } = useFonte(props.agora, false, props.semHorario);
  return (
    <ConfiguracaoDaAgenda
      fonte={fonte}
      configInicial={{ ...CONFIG, ativa: !props.desligada }}
      servicosIniciais={SERVICOS}
      horarioAtendimento={hours}
      hrefHorario="/design/agente"
      hrefAgenda="/design/agenda"
    />
  );
}
