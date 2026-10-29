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
import { normalizar } from "@/lib/clientes";
import { numeroBR, pct } from "@/lib/format";
import { diaIsoSP, diaMesHoraSP, inicioDoDiaSP, somarDias } from "@/lib/fuso";
import { PERIODOS, type PeriodoKey } from "@/lib/periodo";
import { enviosPorDia, textoDoDiaDeEnvio, type SituacaoDaCampanha } from "@/lib/prospeccao";
import { useDebounce } from "@/lib/use-debounce";
import PainelDeResultados from "./PainelDeResultados";
import { SeloDaCampanha, haQuanto, textoDaTaxa } from "./pecas";
import { BarraDaTabela, CabecalhoDaTabela, RodapeDaTabela, usePaginaDaMemoria } from "./tabela";
import type { Campanha, ConexaoDisponivel, EnvioDaCampanha } from "./tipos";

// CAMPANHAS: o painel de resultados no topo (todas as campanhas ou uma, no
// período) e embaixo a tabela de campanhas, 10 por página, com busca pelo nome
// e o filtro por situação. Clicar numa linha abre o detalhe (ou o assistente,
// no rascunho).

const PASSOS = ["Campanha", "Contatos", "Mensagem", "Confirmar"];
const DIAS_DA_LINHA = 14;
const GRADE = "xl:grid xl:grid-cols-[minmax(0,2.4fr)_120px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_20px] xl:items-center xl:gap-5";

const SITUACOES: { chave: SituacaoDaCampanha; rotulo: string }[] = [
  { chave: "rodando", rotulo: "Rodando" },
  { chave: "agendada", rotulo: "Agendadas" },
  { chave: "pausada", rotulo: "Pausadas" },
  { chave: "rascunho", rotulo: "Rascunhos" },
  { chave: "concluida", rotulo: "Concluídas" },
];

interface ParamsDaTabela {
  busca: string;
  situacao: SituacaoDaCampanha | null;
}

function LinhaDaCampanha({
  campanha,
  conexoes,
  agora,
  abrir,
}: {
  campanha: Campanha;
  conexoes: ConexaoDisponivel[];
  agora: number;
  abrir: () => void;
}) {
  const numero = conexoes.find((c) => c.id === campanha.conexaoId);
  const rascunho = campanha.situacao === "rascunho";
  const enviados = campanha.envios.filter((e) => e.enviadoEm !== null).length;
  const saidos = enviados + campanha.envios.filter((e) => e.situacao === "falhou").length;
  const responderam = campanha.envios.filter((e) => e.respondeuEm !== null).length;
  const total = campanha.envios.length;
  const taxa = enviados === 0 ? null : Math.round((responderam / enviados) * 100);
  const hoje = diaIsoSP(agora);
  const pontos = useMemo(
    () =>
      enviosPorDia(campanha.envios, hoje, DIAS_DA_LINHA).map((d) => ({
        chave: d.dia,
        rotulo: textoDoDiaDeEnvio(d.dia),
        valor: d.enviados,
      })),
    [campanha.envios, hoje],
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
  campanhas,
  conexoes,
  agora,
  abrir,
  editar,
  nova,
}: {
  /** O seletor Leads | Campanhas, no canto esquerdo da linha de cima. */
  abas: React.ReactNode;
  campanhas: Campanha[];
  conexoes: ConexaoDisponivel[];
  agora: number;
  abrir: (id: string) => void;
  editar: (id: string) => void;
  nova: () => void;
}) {
  // ── O painel: período e campanha ──
  const [periodo, setPeriodo] = useState<PeriodoKey>("mes");
  const [escolhida, setEscolhida] = useState<string>("todas");
  const comEnvio = campanhas.filter((c) => c.envios.some((e) => e.enviadoEm !== null));
  const dias = PERIODOS[periodo].dias;
  const hoje = diaIsoSP(agora);
  const painel = useMemo(() => {
    const de = inicioDoDiaSP(somarDias(hoje, -dias + 1));
    const deAntes = inicioDoDiaSP(somarDias(hoje, -2 * dias + 1));
    const das = escolhida === "todas" ? campanhas : campanhas.filter((c) => c.id === escolhida);
    const todos: EnvioDaCampanha[] = das.flatMap((c) => c.envios);
    return {
      envios: todos.filter((e) => e.enviadoEm !== null && e.enviadoEm >= de),
      anteriores: todos.filter((e) => e.enviadoEm !== null && e.enviadoEm >= deAntes && e.enviadoEm < de),
      serie: enviosPorDia(todos, hoje, Math.max(7, dias)),
      variantes: das.length === 1 ? das[0].variantes : [],
    };
  }, [campanhas, escolhida, hoje, dias]);

  // ── A tabela ──
  const [q, setQ] = useState("");
  const busca = useDebounce(normalizar(q.trim()), 300);
  const [situacao, setSituacao] = useState<SituacaoDaCampanha | null>(null);
  const params = useMemo<ParamsDaTabela>(() => ({ busca, situacao }), [busca, situacao]);
  const filtrar = useCallback(
    (p: ParamsDaTabela) =>
      campanhas.filter((c) => (p.situacao === null || c.situacao === p.situacao) && (!p.busca || normalizar(c.nome).includes(p.busca))),
    [campanhas],
  );
  const { itens, pagina, setPagina, total } = usePaginaDaMemoria({ params, filtrar });

  const topo = (
    <div className="flex flex-wrap items-center gap-2">
      {abas}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {comEnvio.length > 0 && (
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

  if (campanhas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
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
    <div className="flex flex-col gap-6">
      {topo}
      <PainelDeResultados
        envios={painel.envios}
        anteriores={painel.anteriores}
        contra={`os ${dias} dias anteriores`}
        serie={painel.serie}
        quantasVariantes={3}
        variantes={painel.variantes}
        legenda={PERIODOS[periodo].legenda}
      />

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
                    { chave: "todas", rotulo: "Todas", contagem: campanhas.length, marcado: situacao === null, aoEscolher: () => setSituacao(null) },
                    ...SITUACOES.map((s) => ({
                      chave: s.chave,
                      rotulo: s.rotulo,
                      contagem: campanhas.filter((c) => c.situacao === s.chave).length,
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
        {itens.length === 0 ? (
          <EstadoVazio tamanho="compacto" texto={busca ? `Nenhuma campanha com "${q.trim()}".` : "Nenhuma campanha nesta situação."} />
        ) : (
          <ul className="divide-y divide-line-soft" data-slot="campanhas-lista">
            {itens.map((c) => (
              <LinhaDaCampanha
                key={c.id}
                campanha={c}
                conexoes={conexoes}
                agora={agora}
                abrir={() => (c.situacao === "rascunho" ? editar(c.id) : abrir(c.id))}
              />
            ))}
          </ul>
        )}
        <RodapeDaTabela pagina={pagina} total={total} aoMudar={setPagina} slot="campanhas" />
      </Card>
    </div>
  );
}

export default memo(AbaCampanhas);
