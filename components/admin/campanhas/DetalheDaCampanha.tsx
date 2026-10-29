"use client";

import { memo, useMemo, useState } from "react";
import { Pause, Play, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { numeroBR } from "@/lib/format";
import { diaMesHoraSP } from "@/lib/fuso";
import { ROTULO_NA_CAMPANHA, diasParaEnviar, resultadoDaCampanha, type SituacaoNaCampanha } from "@/lib/prospeccao";
import { SeloDaCampanha, SeloNaCampanha, TopoDeDetalhe } from "./pecas";
import { Comparacoes, NumerosDoResultado } from "./Resultados";
import type { Campanha, ConexaoDisponivel, Lead } from "./tipos";

// O DETALHE de uma campanha: números no topo, as comparações (variante e hora)
// e a tabela dos leads com a situação de cada um. Pausar para o cron; "Nova
// campanha com quem não respondeu" abre o assistente com esses leads escolhidos.

const COLUNAS = "lg:grid lg:grid-cols-[minmax(0,2fr)_0.8fr_1fr_1fr_1fr] lg:items-center lg:gap-4";

type Recorte = "todos" | SituacaoNaCampanha;

function DetalheDaCampanha({
  campanha,
  leads,
  conexoes,
  voltar,
  pausarOuRetomar,
  reenviarParaQuemNaoRespondeu,
}: {
  campanha: Campanha;
  leads: Lead[];
  conexoes: ConexaoDisponivel[];
  voltar: () => void;
  pausarOuRetomar: () => void;
  reenviarParaQuemNaoRespondeu: () => void;
}) {
  const [recorte, setRecorte] = useState<Recorte>("todos");
  const r = useMemo(() => resultadoDaCampanha(campanha.envios, campanha.variantes.length), [campanha]);
  const numero = conexoes.find((c) => c.id === campanha.conexaoId);
  const porLead = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const contagem = (s: SituacaoNaCampanha) => campanha.envios.filter((e) => e.situacao === s).length;
  const recortes = (["todos", "respondeu", "enviado", "na_fila", "parou", "falhou"] as Recorte[]).filter(
    (s) => s === "todos" || contagem(s) > 0,
  );
  const visiveis = recorte === "todos" ? campanha.envios : campanha.envios.filter((e) => e.situacao === recorte);
  const semResposta = contagem("enviado");
  const pode = campanha.situacao === "rodando" || campanha.situacao === "pausada" || campanha.situacao === "agendada";

  const apoio = [
    numero ? `Pelo WhatsApp de ${numero.nome}` : "Sem número escolhido",
    campanha.situacao === "agendada" && campanha.agendadaPara
      ? `começa em ${diaMesHoraSP(campanha.agendadaPara)}`
      : r.naFila > 0
        ? `faltam ${numeroBR(r.naFila)}, cerca de ${diasParaEnviar(r.naFila)} ${diasParaEnviar(r.naFila) === 1 ? "dia" : "dias"}`
        : "todos os leads já receberam",
  ].join(", ");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6" data-slot="campanha-detalhe">
      <TopoDeDetalhe
        voltar={voltar}
        rotuloDoVoltar="Campanhas"
        titulo={campanha.nome}
        selo={<SeloDaCampanha situacao={campanha.situacao} />}
        apoio={`${apoio}.`}
      >
        {semResposta > 0 && (
          <Button variant="outline" onClick={reenviarParaQuemNaoRespondeu} data-slot="campanha-reenviar">
            <Repeat aria-hidden />
            Nova campanha com quem não respondeu
          </Button>
        )}
        {pode && (
          <Button
            variant={campanha.situacao === "pausada" ? "brand" : "outline"}
            onClick={pausarOuRetomar}
            data-slot="campanha-pausar"
          >
            {campanha.situacao === "pausada" ? <Play aria-hidden /> : <Pause aria-hidden />}
            {campanha.situacao === "pausada" ? "Retomar" : "Pausar"}
          </Button>
        )}
      </TopoDeDetalhe>

      <NumerosDoResultado r={r} legenda="Desde o início da campanha" />
      <Comparacoes r={r} variantes={campanha.variantes} />

      <section className="flex flex-col gap-3" aria-labelledby="campanha-leads-titulo">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="campanha-leads-titulo" className="mr-2 text-cartao text-ink">
            Leads
          </h3>
          {recortes.map((s) => (
            <Button
              key={s}
              variant="chip"
              size="chip"
              aria-pressed={recorte === s}
              onClick={() => setRecorte(s)}
              data-slot="campanha-recorte"
              data-recorte={s}
            >
              {s === "todos" ? "Todos" : ROTULO_NA_CAMPANHA[s]}
              <span className="tabular-nums opacity-70">{s === "todos" ? campanha.envios.length : contagem(s)}</span>
            </Button>
          ))}
        </div>
        <Card variant="conteudo" className="overflow-hidden">
          <div className={`hidden border-b border-line px-5 py-3 text-rotulo uppercase text-ink-3 ${COLUNAS}`} aria-hidden>
            <span>Empresa</span>
            <span>Mensagem</span>
            <span>Enviada</span>
            <span>Respondeu</span>
            <span>Situação</span>
          </div>
          {visiveis.length === 0 ? (
            <EstadoVazio tamanho="compacto" texto="Nenhum lead nesta situação." />
          ) : (
            <ul className="divide-y divide-line-soft" data-slot="campanha-leads">
              {visiveis.map((e) => {
                const l = porLead.get(e.leadId);
                return (
                  <li
                    key={e.leadId}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-apoio ${COLUNAS}`}
                    data-slot="campanha-lead"
                    data-situacao={e.situacao}
                  >
                    <span className="min-w-0 basis-full truncate text-corpo font-semibold text-ink lg:basis-auto">{l?.nome ?? "Lead"}</span>
                    <span className="text-ink-2">{e.variante === null ? "" : `Variante ${e.variante + 1}`}</span>
                    <span className="tabular-nums text-ink-2">{e.enviadoEm ? diaMesHoraSP(e.enviadoEm) : ""}</span>
                    <span className="tabular-nums text-ink-2">{e.respondeuEm ? diaMesHoraSP(e.respondeuEm) : ""}</span>
                    <span>
                      <SeloNaCampanha situacao={e.situacao} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

export default memo(DetalheDaCampanha);
