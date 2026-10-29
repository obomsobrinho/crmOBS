"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { Pause, Play, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CampoBusca } from "@/components/ui/campo-busca";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { normalizar } from "@/lib/clientes";
import { numeroBR } from "@/lib/format";
import { diaIsoSP, diaMesHoraSP } from "@/lib/fuso";
import { ROTULO_NA_CAMPANHA, diasParaEnviar, enviosPorDia, textoDoTempo, type SituacaoNaCampanha } from "@/lib/prospeccao";
import { useDebounce } from "@/lib/use-debounce";
import PainelDeResultados from "./PainelDeResultados";
import { SeloDaCampanha, SeloNaCampanha, TopoDeDetalhe } from "./pecas";
import { CabecalhoDaTabela, RodapeDaTabela, usePaginadaDaMemoria } from "./tabela";
import type { Campanha, ConexaoDisponivel, EnvioDaCampanha, Lead } from "./tipos";

// O DETALHE de uma campanha: o mesmo painel de resultados da aba (desde o
// início da campanha) e a tabela dos leads dela, 10 por página, com busca e
// recorte por situação. Pausar para o cron; "Nova campanha com quem não
// respondeu" abre o assistente com esses leads escolhidos.

const GRADE = "xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_120px] xl:items-center xl:gap-4";
const DIAS_NO_GRAFICO = 30;

type Recorte = "todos" | SituacaoNaCampanha;

function DetalheDaCampanha({
  campanha,
  leads,
  conexoes,
  agora,
  voltar,
  pausarOuRetomar,
  reenviarParaQuemNaoRespondeu,
}: {
  campanha: Campanha;
  leads: Lead[];
  conexoes: ConexaoDisponivel[];
  agora: number;
  voltar: () => void;
  pausarOuRetomar: () => void;
  reenviarParaQuemNaoRespondeu: () => void;
}) {
  const numero = conexoes.find((c) => c.id === campanha.conexaoId);
  const porLead = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const contagem = (s: SituacaoNaCampanha) => campanha.envios.filter((e) => e.situacao === s).length;
  const naFila = contagem("na_fila");
  const semResposta = contagem("enviado");
  const pode = campanha.situacao === "rodando" || campanha.situacao === "pausada" || campanha.situacao === "agendada";

  // O gráfico por dia vai do primeiro envio até hoje (no máximo 30 dias, os últimos).
  const hoje = diaIsoSP(agora);
  const serie = useMemo(() => {
    const primeiro = Math.min(...campanha.envios.map((e) => e.enviadoEm ?? Infinity));
    const dias = Number.isFinite(primeiro)
      ? Math.min(DIAS_NO_GRAFICO, Math.max(7, Math.round((agora - primeiro) / 86_400_000) + 1))
      : 7;
    return enviosPorDia(campanha.envios, hoje, dias);
  }, [campanha.envios, hoje, agora]);

  const apoio = [
    numero ? `Pelo WhatsApp de ${numero.nome}` : "Sem número escolhido",
    campanha.situacao === "agendada" && campanha.agendadaPara
      ? `começa em ${diaMesHoraSP(campanha.agendadaPara)}`
      : naFila > 0
        ? `faltam ${numeroBR(naFila)}, cerca de ${diasParaEnviar(naFila)} ${diasParaEnviar(naFila) === 1 ? "dia" : "dias"}`
        : "todos os leads já receberam",
  ].join(", ");

  // ── A tabela ──
  const [q, setQ] = useState("");
  const busca = useDebounce(normalizar(q.trim()), 300);
  const [recorte, setRecorte] = useState<Recorte>("todos");
  const params = useMemo(() => ({ busca, recorte }), [busca, recorte]);
  const filtrar = useCallback(
    (p: { busca: string; recorte: Recorte }) =>
      campanha.envios.filter(
        (e) =>
          (p.recorte === "todos" || e.situacao === p.recorte) &&
          (!p.busca || normalizar(porLead.get(e.leadId)?.nome ?? "").includes(p.busca)),
      ),
    [campanha.envios, porLead],
  );
  const { itens, temMais, carregando, fimRef, total } = usePaginadaDaMemoria({
    params,
    filtrar,
    chave: (e: EnvioDaCampanha) => e.leadId,
    versao: campanha.envios,
  });
  const recortes = (["todos", "respondeu", "enviado", "na_fila", "parou", "falhou"] as Recorte[]).filter(
    (s) => s === "todos" || contagem(s) > 0,
  );

  return (
    <div className="flex flex-col gap-8" data-slot="campanha-detalhe">
      <div className="flex flex-col gap-4">
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

        <PainelDeResultados
          envios={campanha.envios}
          anteriores={null}
          contra=""
          serie={serie}
          quantasVariantes={campanha.variantes.length}
          variantes={campanha.variantes}
          legenda="Desde o início da campanha"
        />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="campanha-leads-titulo">
        <h3 id="campanha-leads-titulo" className="text-cartao text-ink">
          Leads da campanha
        </h3>
        <Card variant="conteudo" className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Situação na campanha">
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
            <CampoBusca
              className="ml-auto w-full sm:w-64"
              valor={q}
              aoMudar={setQ}
              placeholder="Buscar empresa"
              rotulo="Buscar lead da campanha"
              aoLimpar={() => setQ("")}
              mostrarLimpar={q !== ""}
            />
          </div>
          <CabecalhoDaTabela grade={GRADE} colunas={["Empresa", "Mensagem", "Enviada", "Respondeu", "Em", "Situação"]} />
          {itens.length === 0 && !carregando ? (
            <EstadoVazio tamanho="compacto" texto="Nenhum lead com esse recorte." />
          ) : (
            <ul className="divide-y divide-line-soft" data-slot="campanha-leads">
              {itens.map((item) => {
                const e = campanha.envios.find((x) => x.leadId === item.leadId) ?? item;
                const l = porLead.get(e.leadId);
                const espera =
                  e.enviadoEm !== null && e.respondeuEm !== null ? Math.round((e.respondeuEm - e.enviadoEm) / 60_000) : null;
                return (
                  <li
                    key={e.leadId}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-apoio ${GRADE}`}
                    data-slot="campanha-lead"
                    data-situacao={e.situacao}
                  >
                    <span className="min-w-0 basis-full xl:basis-auto">
                      <span className="block truncate text-corpo font-semibold text-ink">{l?.nome ?? "Lead"}</span>
                      <span className="block truncate text-legenda text-ink-3">{l ? `${l.bairro}, ${l.cidade}` : ""}</span>
                    </span>
                    <span className="text-ink-2">{e.variante === null ? "" : `Variante ${e.variante + 1}`}</span>
                    <span className="tabular-nums text-ink-2">{e.enviadoEm ? diaMesHoraSP(e.enviadoEm) : ""}</span>
                    <span className="tabular-nums text-ink-2">{e.respondeuEm ? diaMesHoraSP(e.respondeuEm) : ""}</span>
                    <span className="tabular-nums text-ink-3">{espera === null ? "" : textoDoTempo(espera)}</span>
                    <span className="ml-auto xl:ml-0">
                      <SeloNaCampanha situacao={e.situacao} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <RodapeDaTabela
            mostrando={itens.length}
            total={total}
            temMais={temMais}
            carregando={carregando}
            fimRef={fimRef}
            slot="campanha-leads"
          />
        </Card>
      </section>
    </div>
  );
}

export default memo(DetalheDaCampanha);
