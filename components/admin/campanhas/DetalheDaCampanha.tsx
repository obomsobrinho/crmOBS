"use client";

import { memo, useCallback, useState } from "react";
import { Pause, Play, Repeat } from "lucide-react";
import BotaoDeFiltro from "@/components/BotaoDeFiltro";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { numeroBR } from "@/lib/format";
import { diaMesHoraSP } from "@/lib/fuso";
import { ROTULO_NA_CAMPANHA, diasParaEnviar, textoDoTempo, type SituacaoNaCampanha } from "@/lib/prospeccao";
import { useDebounce } from "@/lib/use-debounce";
import PainelDeResultados from "./PainelDeResultados";
import { SeloDaCampanha, SeloNaCampanha, TopoDeDetalhe } from "./pecas";
import { BarraDaTabela, CabecalhoDaTabela, CorpoDaTabela, RodapeDaTabela, useLeitura, usePaginaDaFonte } from "./tabela";
import { somaDe, type CampanhaEditavel, type ConexaoDisponivel, type FonteDeCampanhas } from "./tipos";

// O DETALHE de uma campanha: o mesmo painel de resultados da aba (desde o
// início da campanha, sem "Envios por dia": todo dia sai a mesma cota) e a
// tabela dos leads dela, 10 por página, com busca e filtro por situação.
// Pausar para o cron; "Nova campanha com quem não respondeu" abre o assistente
// com esses leads escolhidos.

const GRADE = "xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_120px] xl:items-center xl:gap-4";
const SITUACOES: SituacaoNaCampanha[] = ["respondeu", "enviado", "na_fila", "parou", "falhou"];

function DetalheDaCampanha({
  abas,
  fonte,
  id,
  versao,
  conexoes,
  voltar,
  aoMudar,
  reenviarParaQuemNaoRespondeu,
}: {
  abas: React.ReactNode;
  fonte: FonteDeCampanhas;
  id: string;
  /** Muda depois de cada escrita: o detalhe lê de novo. */
  versao: number;
  conexoes: ConexaoDisponivel[];
  voltar: () => void;
  /** Depois de pausar ou retomar (as outras telas leem de novo). */
  aoMudar: () => void;
  reenviarParaQuemNaoRespondeu: (origem: CampanhaEditavel) => void;
}) {
  const aberta = useLeitura(`campanha|${id}|${versao}`, () => fonte.campanha(id));
  const { dados: resultados } = useLeitura(`resultados|${id}|${versao}`, () => fonte.resultados({ campanhaId: id, periodo: null }));
  const [mudando, setMudando] = useState(false);
  const [falhaAoMudar, setFalhaAoMudar] = useState(false);

  // ── A tabela ──
  const [q, setQ] = useState("");
  const busca = useDebounce(q.trim(), 300);
  const [situacao, setSituacao] = useState<SituacaoNaCampanha | null>(null);
  const ler = useCallback((pagina: number) => fonte.leadsDaCampanha(id, { texto: busca, situacao, pagina }), [fonte, id, busca, situacao]);
  const tabela = usePaginaDaFonte(`${id}|${busca}|${situacao ?? ""}`, ler, versao);

  if (!aberta.dados) {
    return (
      <div className="flex flex-col gap-4" data-slot="campanha-detalhe">
        <div className="flex flex-wrap items-center gap-2">{abas}</div>
        <Card variant="conteudo" className="py-4">
          <EstadoVazio
            tamanho="compacto"
            texto={aberta.carregando ? "Carregando…" : aberta.erro ? "Não deu para abrir a campanha agora." : "Esta campanha não existe mais."}
          >
            <Button variant="outline" size="control" className="mt-2" onClick={aberta.erro ? aberta.recarregar : voltar}>
              {aberta.erro ? "Tentar de novo" : "Voltar para Campanhas"}
            </Button>
          </EstadoVazio>
        </Card>
      </div>
    );
  }

  const { campanha, contagens } = aberta.dados;
  const numero = conexoes.find((c) => c.id === campanha.conexaoId);
  const contagem = (s: SituacaoNaCampanha) => contagens[s];
  const totalDaCampanha = somaDe(contagens);
  const naFila = contagem("na_fila");
  const semResposta = contagem("enviado");
  const pode = campanha.situacao === "rodando" || campanha.situacao === "pausada" || campanha.situacao === "agendada";

  const pausarOuRetomar = async () => {
    setMudando(true);
    setFalhaAoMudar(false);
    try {
      await (campanha.situacao === "pausada" ? fonte.retomar(campanha.id) : fonte.pausar(campanha.id));
      aoMudar();
    } catch (e) {
      console.error("campanha, pausar ou retomar:", e);
      setFalhaAoMudar(true);
    } finally {
      setMudando(false);
    }
  };

  const apoio = [
    numero ? `Pelo WhatsApp de ${numero.nome}` : "Sem número escolhido",
    campanha.situacao === "agendada" && campanha.agendadaPara
      ? `começa em ${diaMesHoraSP(campanha.agendadaPara)}`
      : naFila > 0
        ? `faltam ${numeroBR(naFila)}, cerca de ${diasParaEnviar(naFila)} ${diasParaEnviar(naFila) === 1 ? "dia" : "dias"}`
        : "todos os leads já receberam",
  ].join(", ");

  return (
    <div className="flex flex-col gap-4" data-slot="campanha-detalhe">
      <div className="flex flex-wrap items-center gap-2">
        {abas}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {semResposta > 0 && (
            <Button variant="outline" onClick={() => reenviarParaQuemNaoRespondeu(campanha)} data-slot="campanha-reenviar">
              <Repeat aria-hidden />
              Nova campanha com quem não respondeu
            </Button>
          )}
          {pode && (
            <Button
              variant={campanha.situacao === "pausada" ? "brand" : "outline"}
              onClick={pausarOuRetomar}
              carregando={mudando}
              data-slot="campanha-pausar"
            >
              {campanha.situacao === "pausada" ? <Play aria-hidden /> : <Pause aria-hidden />}
              {campanha.situacao === "pausada" ? "Retomar" : "Pausar"}
            </Button>
          )}
        </div>
      </div>

      {falhaAoMudar && (
        <Aviso tom="danger" forma="faixa" data-bloco="campanha-falha">
          {campanha.situacao === "pausada"
            ? "Não deu para retomar agora. A campanha segue pausada; tente de novo."
            : "Não deu para pausar agora. A campanha segue ativa; tente de novo."}
        </Aviso>
      )}

      <TopoDeDetalhe
        voltar={voltar}
        rotuloDoVoltar="Campanhas"
        titulo={campanha.nome}
        selo={<SeloDaCampanha situacao={campanha.situacao} />}
        apoio={`${apoio}.`}
      />

      {resultados && <PainelDeResultados modo="campanha" dados={resultados} contra="" variantes={campanha.variantes} legenda="desde o início" />}

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
                    { chave: "todos", rotulo: "Todos", contagem: totalDaCampanha, marcado: situacao === null, aoEscolher: () => setSituacao(null) },
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
        <CorpoDaTabela
          lido={tabela.lido}
          erro={tabela.erro}
          recarregar={tabela.recarregar}
          quantas={tabela.itens.length}
          vazio={busca ? `Nenhum lead com "${q.trim()}".` : "Nenhum lead com esse filtro."}
        >
          <ul className="divide-y divide-line-soft" data-slot="campanha-leads">
            {tabela.itens.map((e) => {
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
                    <span className="block truncate text-corpo font-semibold text-ink">{e.nome}</span>
                    <span className="block truncate text-legenda text-ink-3">{[e.bairro, e.cidade].filter(Boolean).join(", ")}</span>
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
        </CorpoDaTabela>
        <RodapeDaTabela pagina={tabela.pagina} total={tabela.total} aoMudar={tabela.setPagina} slot="campanha-leads" />
      </Card>
    </div>
  );
}

export default memo(DetalheDaCampanha);
