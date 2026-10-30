"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { ChevronRight, Megaphone, Plus } from "lucide-react";
import BotaoDeFiltro from "@/components/BotaoDeFiltro";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChartSparkline } from "@/components/ui/chart";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Medidor } from "@/components/ui/medidor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SeletorDePeriodo from "@/components/painel/SeletorDePeriodo";
import { numeroBR, pct } from "@/lib/format";
import { diaMesHoraSP } from "@/lib/fuso";
import { PERIODOS, type PeriodoKey } from "@/lib/periodo";
import { DIAS_DA_LINHA, textoDoDiaDeEnvio, type SituacaoDaCampanha } from "@/lib/prospeccao";
import { useDebounce } from "@/lib/use-debounce";
import PainelDeResultados from "./PainelDeResultados";
import { SeloDaCampanha, haQuanto, textoDaTaxa } from "./pecas";
import { BarraDaTabela, CabecalhoDaTabela, CorpoDaTabela, RodapeDaTabela, useLeitura, usePaginaDaFonte } from "./tabela";
import { somaDe, type CampanhaDaTabela, type ConexaoDisponivel, type FonteDeCampanhas, type Totais } from "./tipos";

// CAMPANHAS: o painel de resultados no topo (todas as campanhas ou uma, no
// período) e embaixo a tabela de campanhas, 10 por página, com busca pelo nome
// e o filtro por situação, tudo lido da fonte (contas no servidor). Clicar numa
// linha abre o detalhe (ou o assistente, no rascunho).

const PASSOS = ["Campanha", "Contatos", "Mensagem", "Confirmar"];
const GRADE = "xl:grid xl:grid-cols-[minmax(0,2.4fr)_120px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_20px] xl:items-center xl:gap-5";

const SITUACOES: { chave: SituacaoDaCampanha; rotulo: string }[] = [
  { chave: "rodando", rotulo: "Rodando" },
  { chave: "agendada", rotulo: "Agendadas" },
  { chave: "pausada", rotulo: "Pausadas" },
  { chave: "rascunho", rotulo: "Rascunhos" },
  { chave: "concluida", rotulo: "Concluídas" },
];

function LinhaDaCampanha({
  campanha,
  conexoes,
  agora,
  abrir,
}: {
  campanha: CampanhaDaTabela;
  conexoes: ConexaoDisponivel[];
  agora: number;
  abrir: () => void;
}) {
  const numero = conexoes.find((c) => c.id === campanha.conexaoId);
  const rascunho = campanha.situacao === "rascunho";
  const { enviados, responderam, total } = campanha;
  const saidos = enviados + campanha.falharam;
  const taxa = enviados === 0 ? null : Math.round((responderam / enviados) * 100);
  const pontos = useMemo(
    () => campanha.serie.map((d) => ({ chave: d.dia, rotulo: textoDoDiaDeEnvio(d.dia), valor: d.enviados })),
    [campanha.serie],
  );

  return (
    <li>
      <Button
        variant="linha"
        size="none"
        onClick={abrir}
        data-slot="campanha-linha"
        data-campanha={campanha.id}
        className={`flex w-full flex-wrap items-center gap-x-5 gap-y-2 rounded-none px-5 py-3.5 text-left ${GRADE}`}
      >
        <span className="min-w-0 basis-full xl:basis-auto">
          <span className="block truncate text-corpo font-semibold text-ink">{campanha.nome || "Campanha sem nome"}</span>
          <span className="block truncate text-legenda text-ink-3">
            {numero ? `Pelo WhatsApp de ${numero.nome}` : "Sem número escolhido"}
          </span>
        </span>
        <span>
          <SeloDaCampanha situacao={campanha.situacao} />
        </span>
        <span className="flex min-w-[140px] flex-1 flex-col gap-1.5 xl:min-w-0">
          {rascunho ? (
            <>
              <span className="text-legenda text-ink-2">
                Passo {campanha.passo} de 4, {PASSOS[campanha.passo - 1]}
              </span>
              <Medidor valor={((campanha.passo - 1) / 4) * 100} tom="neutro" rotulo={`Passo ${campanha.passo} de 4`} />
            </>
          ) : (
            <>
              <span className="text-legenda tabular-nums text-ink-2">
                <span className="font-semibold text-ink">{numeroBR(enviados)}</span> de {numeroBR(total)} enviadas
              </span>
              <Medidor
                valor={pct(saidos, total)}
                tom={campanha.situacao === "rodando" ? "marca" : "neutro"}
                rotulo={`Progresso: ${enviados} de ${total} enviadas`}
              />
            </>
          )}
        </span>
        <span className="text-apoio tabular-nums text-ink-2">
          {rascunho ? (
            <span className="text-ink-3">Sem envios</span>
          ) : (
            <>
              <span className="font-semibold text-ink">{numeroBR(responderam)}</span>
              <span className="text-ink-3"> · {textoDaTaxa(taxa)}</span>
            </>
          )}
        </span>
        <span className="hidden w-full max-w-40 xl:block" data-slot="campanha-linha-tendencia">
          {enviados > 0 && <ChartSparkline dados={pontos} nome="Enviadas" formatar={numeroBR} className="h-12" />}
        </span>
        <span className="text-legenda tabular-nums text-ink-3">
          {rascunho
            ? `Salvo ${haQuanto(campanha.salvaEm, agora)}`
            : campanha.situacao === "agendada" && campanha.agendadaPara
              ? `Começa ${diaMesHoraSP(campanha.agendadaPara)}`
              : `Criada ${haQuanto(campanha.criadaEm, agora)}`}
        </span>
        <ChevronRight size={16} aria-hidden className="ml-auto text-ink-3 xl:ml-0" />
      </Button>
    </li>
  );
}

function AbaCampanhas({
  abas,
  fonte,
  versao,
  totais,
  conexoes,
  agora,
  abrir,
  editar,
  nova,
}: {
  /** O seletor Leads | Campanhas, no canto esquerdo da linha de cima. */
  abas: React.ReactNode;
  fonte: FonteDeCampanhas;
  /** Muda depois de cada escrita: as leituras desta aba voltam ao servidor. */
  versao: number;
  totais: Totais | null;
  conexoes: ConexaoDisponivel[];
  agora: number;
  abrir: (id: string) => void;
  editar: (id: string) => void;
  nova: () => void;
}) {
  // ── O painel: período e campanha ──
  const [periodo, setPeriodo] = useState<PeriodoKey>("mes");
  const [escolhida, setEscolhida] = useState<string>("todas");
  const dias = PERIODOS[periodo].dias;
  const { dados: comEnvio } = useLeitura(`com-envio|${versao}`, () => fonte.campanhasComEnvio());
  const { dados: painel } = useLeitura(`resultados|${escolhida}|${periodo}|${versao}`, () =>
    fonte.resultados({ campanhaId: escolhida === "todas" ? null : escolhida, periodo }),
  );

  // ── A tabela ──
  const [q, setQ] = useState("");
  const busca = useDebounce(q.trim(), 300);
  const [situacao, setSituacao] = useState<SituacaoDaCampanha | null>(null);
  const ler = useCallback((pagina: number) => fonte.campanhas({ texto: busca, situacao, pagina }), [fonte, busca, situacao]);
  const tabela = usePaginaDaFonte(`${busca}|${situacao ?? ""}`, ler, versao);
  const contagens = totais?.campanhas;
  const todas = somaDe(contagens);

  const topo = (
    <div className="flex flex-wrap items-center gap-2">
      {abas}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {comEnvio && comEnvio.length > 0 && (
          <>
            <Select value={escolhida} onValueChange={setEscolhida}>
              <SelectTrigger className="w-56" aria-label="Campanha do painel" data-slot="resultados-filtro">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as campanhas</SelectItem>
                {comEnvio.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SeletorDePeriodo valor={periodo} aoMudar={setPeriodo} />
          </>
        )}
        <Button onClick={nova} data-slot="campanhas-nova">
          <Plus aria-hidden />
          Nova campanha
        </Button>
      </div>
    </div>
  );

  if (totais && todas === 0) {
    return (
      <div className="flex flex-col gap-4">
        {topo}
        <Card variant="conteudo" className="py-4">
          <EstadoVazio
            icone={Megaphone}
            titulo="Nenhuma campanha ainda"
            texto="Crie a primeira campanha a partir de uma busca de leads. Os resultados aparecem aqui."
          >
            <Button className="mt-2" onClick={nova}>
              <Plus aria-hidden />
              Nova campanha
            </Button>
          </EstadoVazio>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {topo}
      {painel && (
        <PainelDeResultados modo="resumo" dados={painel} contra={`os ${dias} dias anteriores`} variantes={[]} legenda={PERIODOS[periodo].legenda} />
      )}

      <Card variant="conteudo" className="overflow-hidden" data-bloco="campanhas-tabela">
        <BarraDaTabela
          busca={q}
          aoBuscar={setQ}
          placeholder="Buscar campanha"
          rotuloDaBusca="Buscar campanha pelo nome"
          filtro={
            <BotaoDeFiltro
              slot="campanhas-filtro"
              ativos={situacao ? 1 : 0}
              rotulo={situacao ? `Filtrar por situação: ${SITUACOES.find((s) => s.chave === situacao)?.rotulo}` : "Filtrar por situação"}
              grupos={[
                {
                  titulo: "Situação",
                  opcoes: [
                    { chave: "todas", rotulo: "Todas", contagem: todas, marcado: situacao === null, aoEscolher: () => setSituacao(null) },
                    ...SITUACOES.map((s) => ({
                      chave: s.chave,
                      rotulo: s.rotulo,
                      contagem: contagens?.[s.chave] ?? 0,
                      marcado: situacao === s.chave,
                      aoEscolher: () => setSituacao(s.chave),
                    })),
                  ],
                },
              ]}
            />
          }
        >
          <h3 className="text-cartao text-ink">Campanhas</h3>
        </BarraDaTabela>
        <CabecalhoDaTabela
          grade={GRADE}
          colunas={["Campanha", "Situação", "Progresso", "Respostas", `${DIAS_DA_LINHA} dias`, "Quando", ""]}
        />
        <CorpoDaTabela
          lido={tabela.lido}
          erro={tabela.erro}
          recarregar={tabela.recarregar}
          quantas={tabela.itens.length}
          vazio={busca ? `Nenhuma campanha com "${q.trim()}".` : "Nenhuma campanha nesta situação."}
        >
          <ul className="divide-y divide-line-soft" data-slot="campanhas-lista">
            {tabela.itens.map((c) => (
              <LinhaDaCampanha
                key={c.id}
                campanha={c}
                conexoes={conexoes}
                agora={agora}
                abrir={() => (c.situacao === "rascunho" ? editar(c.id) : abrir(c.id))}
              />
            ))}
          </ul>
        </CorpoDaTabela>
        <RodapeDaTabela pagina={tabela.pagina} total={tabela.total} aoMudar={tabela.setPagina} slot="campanhas" lido={tabela.lido} />
      </Card>
    </div>
  );
}

export default memo(AbaCampanhas);
