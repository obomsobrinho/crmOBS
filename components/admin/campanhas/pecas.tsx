"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ROTULO_DA_SITUACAO,
  faixaDaPontuacao,
  pontuarLead,
  type SinaisDoLead,
  type SituacaoDoLead,
} from "@/lib/prospeccao";

// Peças pequenas das telas de Campanhas.

const VARIANTE_DA_FAIXA = { alta: "estado-bom", media: "estado-neutro", baixa: "contorno" } as const;

/** A pontuação do lead com os motivos no balão (ou o impedimento, quando não pode entrar na fila). */
export function SeloDaPontuacao({ sinais }: { sinais: SinaisDoLead }) {
  const p = pontuarLead(sinais);
  const texto = p.impedimento ?? (p.motivos.length > 0 ? p.motivos.join(". ") : "Nenhum sinal forte achado");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          tabIndex={0}
          variant={p.impedimento ? "estado-neutro" : VARIANTE_DA_FAIXA[faixaDaPontuacao(p.pontos)]}
          data-slot="lead-pontuacao"
          data-pontos={p.pontos}
          aria-label={`Pontuação ${p.pontos}. ${texto}`}
        >
          {p.impedimento ? p.impedimento : `${p.pontos} pts`}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72">
        {texto}
      </TooltipContent>
    </Tooltip>
  );
}

const VARIANTE_DA_SITUACAO: Record<SituacaoDoLead, "estado-bom" | "estado-aviso" | "estado-perigo" | "estado-neutro" | "contorno"> = {
  escolhido: "contorno",
  na_fila: "contorno",
  abordado: "estado-neutro",
  respondeu: "estado-bom",
  convertido: "estado-bom",
  descartado: "estado-neutro",
  saiu: "estado-aviso",
  falhou: "estado-perigo",
};

export function SeloDaSituacao({ situacao }: { situacao: SituacaoDoLead }) {
  return (
    <Badge variant={VARIANTE_DA_SITUACAO[situacao]} data-slot="lead-situacao" data-situacao={situacao}>
      {ROTULO_DA_SITUACAO[situacao]}
    </Badge>
  );
}
