"use client";

import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ROTULO_DA_BUSCA,
  ROTULO_DA_CAMPANHA,
  ROTULO_DO_SITE,
  ROTULO_NA_CAMPANHA,
  faixaDaPontuacao,
  pontuacaoExibida,
  siteDoLead,
  type SinaisDoLead,
  type SituacaoDaBusca,
  type SituacaoDaCampanha,
  type SituacaoNaCampanha,
} from "@/lib/prospeccao";

// Peças pequenas das telas de Campanhas: os selos de situação, a pontuação e o
// cabeçalho com "voltar". Verde, âmbar e vermelho só como ESTADO.

type Variante = "estado-bom" | "estado-aviso" | "estado-perigo" | "estado-neutro" | "contorno";

const DA_BUSCA: Record<SituacaoDaBusca, Variante> = { buscando: "estado-aviso", pronta: "estado-bom", falhou: "estado-perigo" };

export function SeloDaBusca({ situacao }: { situacao: SituacaoDaBusca }) {
  return (
    <Badge variant={DA_BUSCA[situacao]} data-slot="busca-situacao" data-situacao={situacao}>
      {ROTULO_DA_BUSCA[situacao]}
    </Badge>
  );
}

const DA_CAMPANHA: Record<SituacaoDaCampanha, Variante> = {
  rascunho: "contorno",
  agendada: "estado-neutro",
  rodando: "estado-bom",
  pausada: "estado-aviso",
  concluida: "estado-neutro",
};

export function SeloDaCampanha({ situacao }: { situacao: SituacaoDaCampanha }) {
  return (
    <Badge variant={DA_CAMPANHA[situacao]} data-slot="campanha-situacao" data-situacao={situacao}>
      {ROTULO_DA_CAMPANHA[situacao]}
    </Badge>
  );
}

const NA_CAMPANHA: Record<SituacaoNaCampanha, Variante> = {
  na_fila: "contorno",
  enviado: "estado-neutro",
  respondeu: "estado-bom",
  falhou: "estado-perigo",
  parou: "estado-aviso",
};

export function SeloNaCampanha({ situacao }: { situacao: SituacaoNaCampanha }) {
  return (
    <Badge variant={NA_CAMPANHA[situacao]} data-slot="envio-situacao" data-situacao={situacao}>
      {ROTULO_NA_CAMPANHA[situacao]}
    </Badge>
  );
}

export const DA_FAIXA = { alta: "estado-bom", media: "estado-neutro", baixa: "contorno" } as const;

/** A pontuação com os motivos no balão; `pontos` = a gravada (senão, calculada dos sinais). */
export function SeloDaPontuacao({ sinais, pontos }: { sinais: SinaisDoLead; pontos?: number }) {
  const p = pontuacaoExibida(sinais, pontos);
  const texto = p.motivos.length > 0 ? p.motivos.join(". ") : "Nenhum sinal forte achado";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          tabIndex={0}
          variant={DA_FAIXA[faixaDaPontuacao(p.pontos)]}
          data-slot="lead-pontuacao"
          data-pontos={p.pontos}
          aria-label={`Pontuação ${p.pontos}. ${texto}`}
          className="tabular-nums"
        >
          {p.pontos}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72">
        {texto}
      </TooltipContent>
    </Tooltip>
  );
}

/** Tem site: sim, só rede social, não. Texto discreto: é informação, não estado. */
export function TextoDoSite({ url }: { url: string | null }) {
  const s = siteDoLead(url);
  return (
    <span data-slot="lead-site" data-site={s} className={s === "sim" ? "text-ink-2" : "text-ink"}>
      {ROTULO_DO_SITE[s]}
    </span>
  );
}

/** O topo de uma tela de detalhe, numa linha só (dono, 29/10/2026: tudo acima da tabela): voltar, título, selo e o apoio embaixo. */
export function TopoDeDetalhe({
  voltar,
  rotuloDoVoltar,
  titulo,
  selo,
  apoio,
  children,
}: {
  voltar: () => void;
  rotuloDoVoltar: string;
  titulo: React.ReactNode;
  selo?: React.ReactNode;
  apoio?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        <Button variant="outline" size="icon-control" onClick={voltar} aria-label={`Voltar para ${rotuloDoVoltar}`} data-slot="detalhe-voltar">
          <ArrowLeft aria-hidden />
        </Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-titulo text-ink">{titulo}</h2>
            {selo}
          </div>
          {apoio && <p className="text-legenda text-ink-3">{apoio}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** "há 3 dias", "há 2 h", "agora" (o tempo relativo dos cartões). */
export function haQuanto(t: number, agora: number): string {
  const min = Math.max(0, Math.round((agora - t) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

/** "33%" ou "sem envios". */
export function textoDaTaxa(taxa: number | null): string {
  return taxa === null ? "sem envios" : `${taxa}%`;
}
