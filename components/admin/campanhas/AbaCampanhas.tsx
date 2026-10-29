"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { ChevronRight, Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CampoBusca } from "@/components/ui/campo-busca";
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
import { CabecalhoDaTabela, RodapeDaTabela, usePaginadaDaMemoria } from "./tabela";
import type { Campanha, ConexaoDisponivel, EnvioDaCampanha } from "./tipos";

// CAMPANHAS: o painel de resultados no topo (todas as campanhas ou uma, no
// período) e embaixo a tabela de campanhas, 10 por página, com busca pelo nome
// e recorte por situação. Clicar numa linha abre o detalhe (ou o assistente,
// no rascunho).

const PASSOS = ["Campanha", "Contatos", "Mensagem", "Confirmar"];
const DIAS_DA_LINHA = 14;
const GRADE = "xl:grid xl:grid-cols-[minmax(0,2.4fr)_120px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_20px] xl:items-center xl:gap-5";

type Recorte = "todas" | SituacaoDaCampanha;
const RECORTES: Recorte[] = ["todas", "rodando", "agendada", "pausada", "rascunho", "concluida"];
const ROTULO_DO_RECORTE: Record<Recorte, string> = {
  todas: "Todas",
  rodando: "Rodando",
  agendada: "Agendadas",
  pausada: "Pausadas",
  rascunho: "Rascunhos",
  concluida: "Concluídas",
};

interface ParamsDaTabela {
  busca: string;
  recorte: Recorte;
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
  campanhas,
  conexoes,
  agora,
  abrir,
  editar,
  nova,
}: {
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
      serie: enviosPorDia(todos, hoje, dias),
      variantes: das.length === 1 ? das[0].variantes : [],
    };
  }, [campanhas, escolhida, hoje, dias]);

  // ── A tabela ──
  const [q, setQ] = useState("");
  const busca = useDebounce(normalizar(q.trim()), 300);
  const [recorte, setRecorte] = useState<Recorte>("todas");
  const params = useMemo<ParamsDaTabela>(() => ({ busca, recorte }), [busca, recorte]);
  const filtrar = useCallback(
    (p: ParamsDaTabela) =>
      campanhas.filter(
        (c) => (p.recorte === "todas" || c.situacao === p.recorte) && (!p.busca || normalizar(c.nome).includes(p.busca)),
      ),
    [campanhas],
  );
  const { itens, temMais, carregando, fimRef, total } = usePaginadaDaMemoria({
    params,
    filtrar,
    chave: (c: Campanha) => c.id,
    versao: campanhas,
  });
  const porId = useMemo(() => new Map(campanhas.map((c) => [c.id, c])), [campanhas]);
  const contagem = (r: Recorte) => (r === "todas" ? campanhas.length : campanhas.filter((c) => c.situacao === r).length);

  if (campanhas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Topo nova={nova} />
        <Card variant="conteudo" className="py-4">
          <EstadoVazio
            icone={Megaphone}
            titulo="Nenhuma campanha ainda"
            texto="Uma campanha manda uma mensagem para os leads de uma busca, 10 por dia. Os resultados aparecem aqui assim que a primeira sair."
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Topo nova={nova}>
          {comEnvio.length > 0 && (
            <Select value={escolhida} onValueChange={setEscolhida}>
              <SelectTrigger className="w-60" aria-label="Campanha do painel" data-slot="resultados-filtro">
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
          )}
          <SeletorDePeriodo valor={periodo} aoMudar={setPeriodo} />
        </Topo>
        <PainelDeResultados
          envios={painel.envios}
          anteriores={painel.anteriores}
          contra={`os ${dias} dias anteriores`}
          serie={painel.serie}
          quantasVariantes={3}
          variantes={painel.variantes}
          legenda={PERIODOS[periodo].legenda}
        />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="campanhas-tabela-titulo">
        <h3 id="campanhas-tabela-titulo" className="text-cartao text-ink">
          Todas as campanhas
        </h3>
        <Card variant="conteudo" className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Situação">
              {RECORTES.map((r) => (
                <Button
                  key={r}
                  variant="chip"
                  size="chip"
                  aria-pressed={recorte === r}
                  onClick={() => setRecorte(r)}
                  data-slot="campanhas-recorte"
                  data-recorte={r}
                >
                  {ROTULO_DO_RECORTE[r]}
                  <span className="tabular-nums opacity-70">{contagem(r)}</span>
                </Button>
              ))}
            </div>
            <CampoBusca
              className="ml-auto w-full sm:w-64"
              valor={q}
              aoMudar={setQ}
              placeholder="Buscar campanha"
              rotulo="Buscar campanha pelo nome"
              aoLimpar={() => setQ("")}
              mostrarLimpar={q !== ""}
            />
          </div>
          <CabecalhoDaTabela
            grade={GRADE}
            colunas={["Campanha", "Situação", "Progresso", "Respostas", `${DIAS_DA_LINHA} dias`, "Quando", ""]}
          />
          {itens.length === 0 && !carregando ? (
            <EstadoVazio
              tamanho="compacto"
              texto={busca ? `Nenhuma campanha com "${q.trim()}".` : "Nenhuma campanha nesta situação."}
            />
          ) : (
            <ul className="divide-y divide-line-soft" data-slot="campanhas-lista">
              {itens.map((c) => (
                <LinhaDaCampanha
                  key={c.id}
                  campanha={porId.get(c.id) ?? c}
                  conexoes={conexoes}
                  agora={agora}
                  abrir={() => (c.situacao === "rascunho" ? editar(c.id) : abrir(c.id))}
                />
              ))}
            </ul>
          )}
          <RodapeDaTabela
            mostrando={itens.length}
            total={total}
            temMais={temMais}
            carregando={carregando}
            fimRef={fimRef}
            slot="campanhas"
          />
        </Card>
      </section>
    </div>
  );
}

function Topo({ nova, children }: { nova: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-titulo text-ink">Campanhas</h2>
        <p className="mt-1 text-apoio text-ink-2">
          Uma mensagem só para cada lead, no máximo 10 por dia, das 8h às 18h. Quem responde cai em Conversas.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Button onClick={nova} data-slot="campanhas-nova">
          <Plus aria-hidden />
          Nova campanha
        </Button>
      </div>
    </div>
  );
}

export default memo(AbaCampanhas);
