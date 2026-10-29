"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { Pause, Play, Repeat } from "lucide-react";
import BotaoDeFiltro from "@/components/BotaoDeFiltro";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { normalizar } from "@/lib/clientes";
import { numeroBR } from "@/lib/format";
import { diaMesHoraSP } from "@/lib/fuso";
import { ROTULO_NA_CAMPANHA, diasParaEnviar, textoDoTempo, type SituacaoNaCampanha } from "@/lib/prospeccao";
import { useDebounce } from "@/lib/use-debounce";
import PainelDeResultados from "./PainelDeResultados";
import { SeloDaCampanha, SeloNaCampanha, TopoDeDetalhe } from "./pecas";
import { BarraDaTabela, CabecalhoDaTabela, RodapeDaTabela, usePaginaDaMemoria } from "./tabela";
import type { Campanha, ConexaoDisponivel, EnvioDaCampanha, Lead } from "./tipos";

// O DETALHE de uma campanha: o mesmo painel de resultados da aba (desde o
// início da campanha, sem "Envios por dia": todo dia sai a mesma cota) e a
// tabela dos leads dela, 10 por página, com busca e filtro por situação.
// Pausar para o cron; "Nova campanha com quem não respondeu" abre o assistente
// com esses leads escolhidos.

const GRADE = "xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_120px] xl:items-center xl:gap-4";
const SITUACOES: SituacaoNaCampanha[] = ["respondeu", "enviado", "na_fila", "parou", "falhou"];

function DetalheDaCampanha({
  abas,
  campanha,
  leads,
  conexoes,
  voltar,
  pausarOuRetomar,
  reenviarParaQuemNaoRespondeu,
}: {
  abas: React.ReactNode;
  campanha: Campanha;
  leads: Lead[];
  conexoes: ConexaoDisponivel[];
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
  const [situacao, setSituacao] = useState<SituacaoNaCampanha | null>(null);
  const params = useMemo(() => ({ busca, situacao }), [busca, situacao]);
  const filtrar = useCallback(
    (p: { busca: string; situacao: SituacaoNaCampanha | null }) =>
      campanha.envios.filter(
        (e) =>
          (p.situacao === null || e.situacao === p.situacao) &&
          (!p.busca || normalizar(porLead.get(e.leadId)?.nome ?? "").includes(p.busca)),
      ),
    [campanha.envios, porLead],
  );
  const { itens, pagina, setPagina, total } = usePaginaDaMemoria<EnvioDaCampanha, typeof params>({ params, filtrar });

  return (
    <div className="flex flex-col gap-6" data-slot="campanha-detalhe">
      <div className="flex flex-wrap items-center gap-2">
        {abas}
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      <TopoDeDetalhe
        voltar={voltar}
        rotuloDoVoltar="Campanhas"
        titulo={campanha.nome}
        selo={<SeloDaCampanha situacao={campanha.situacao} />}
        apoio={`${apoio}.`}
      />

      <PainelDeResultados
        envios={campanha.envios}
        anteriores={null}
        contra=""
        serie={null}
        quantasVariantes={campanha.variantes.length}
        variantes={campanha.variantes}
        legenda="desde o início"
      />

      <Card variant="conteudo" className="overflow-hidden" data-bloco="campanha-leads">
        <BarraDaTabela
          busca={q}
          aoBuscar={setQ}
          placeholder="Buscar empresa"
          rotuloDaBusca="Buscar lead da campanha"
          filtro={
            <BotaoDeFiltro
              slot="campanha-filtro"
              ativos={situacao ? 1 : 0}
              rotulo={situacao ? `Filtrar por situação: ${ROTULO_NA_CAMPANHA[situacao]}` : "Filtrar por situação"}
              grupos={[
                {
                  titulo: "Situação",
                  opcoes: [
                    { chave: "todos", rotulo: "Todos", contagem: campanha.envios.length, marcado: situacao === null, aoEscolher: () => setSituacao(null) },
                    ...SITUACOES.filter((s) => contagem(s) > 0 || s === situacao).map((s) => ({
                      chave: s,
                      rotulo: ROTULO_NA_CAMPANHA[s],
                      contagem: contagem(s),
                      marcado: situacao === s,
                      aoEscolher: () => setSituacao(s),
                    })),
                  ],
                },
              ]}
            />
          }
        >
          <h3 className="text-cartao text-ink">Leads da campanha</h3>
        </BarraDaTabela>
        <CabecalhoDaTabela grade={GRADE} colunas={["Empresa", "Mensagem", "Enviada", "Respondeu", "Em", "Situação"]} />
        {itens.length === 0 ? (
          <EstadoVazio tamanho="compacto" texto="Nenhum lead com esse filtro." />
        ) : (
          <ul className="divide-y divide-line-soft" data-slot="campanha-leads">
            {itens.map((e) => {
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
        <RodapeDaTabela pagina={pagina} total={total} aoMudar={setPagina} slot="campanha-leads" />
      </Card>
    </div>
  );
}

export default memo(DetalheDaCampanha);
