"use client";

import { memo, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Pie,
  PieChart,
  Rectangle,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegenda,
  ChartTabela,
  ChartTooltip,
  ChartTooltipContent,
  ChartTooltipLinha,
  useAnimacaoDoGrafico,
  type ChartConfig,
} from "@/components/ui/chart";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { numeroBR, pct, plural } from "@/lib/format";
import { calcularDelta, deltaDuracao } from "@/lib/delta";
import { formatDuration } from "@/lib/metrics";
import { PERIODOS, PERIODO_PADRAO, type PeriodoKey } from "@/lib/periodo";
import {
  fatiasDasSolucoes,
  quebrarRotulo,
  type AtendimentoDoCliente,
  type AtendimentoPorPeriodo,
  type BarraDeMovimento,
  type FatiaDeSolucao,
} from "@/lib/admin-cliente";
import type { FonteDoCliente } from "@/lib/admin-cliente-fonte";
import { useCarga } from "@/lib/use-carga";
import SeletorDePeriodo from "@/components/painel/SeletorDePeriodo";
import { FalhaAoLer, Indicador } from "@/components/admin/pecas";
import IndicadorComparado from "@/components/admin/IndicadorComparado";

// ABA "ATENDIMENTO" do detalhe de um cliente (central do dono): o que melhorar ou
// oferecer. Quatro números (conversas, quanto a IA atendeu sozinha, respostas da
// IA, primeiro atendimento) e quatro gráficos, cada um na forma que cabe nos
// dados: colunas empilhadas no tempo (quem respondeu), rosca (como os pedidos de
// ajuda foram resolvidos, poucas fatias de um todo), barras na horizontal (por
// que a IA chamou o time, nomes longos e ordem) e o total de regras salvas.
// Este componente só desenha: as contas são as do painel (`painel_janelas`,
// `painel_motivos`, `painel_series`, `lib/metrics.ts`, `lib/motivos.ts`,
// `lib/solucoes.ts`), montadas em `lib/admin-cliente.ts`. Os QUATRO períodos do
// painel (`lib/periodo.ts`) chegam numa leitura só; trocar de período não busca
// nada.
function AbaAtendimento({ fonte }: { fonte: FonteDoCliente }) {
  const [periodo, setPeriodo] = useState<PeriodoKey>(PERIODO_PADRAO);
  const { dados, erro, tentarDeNovo } = useCarga<AtendimentoPorPeriodo>(fonte.atendimento);

  return (
    <div data-slot="central-aba-atendimento" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-legenda text-ink-3">
          O que a IA fez e o que ela pediu ao time, {PERIODOS[periodo].legenda}.
        </p>
        <SeletorDePeriodo valor={periodo} aoMudar={setPeriodo} />
      </div>

      {erro ? (
        <FalhaAoLer texto="Não deu para ler o atendimento agora." aoTentar={tentarDeNovo} />
      ) : !dados ? (
        <p data-slot="central-atendimento-carregando" className="px-1 text-legenda text-ink-3">
          Carregando o atendimento…
        </p>
      ) : (
        <Conteudo a={dados[periodo]} />
      )}
    </div>
  );
}

function Conteudo({ a }: { a: AtendimentoDoCliente }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          data-bloco="atendimento-conversas"
          marcaDoValor="atendimento-numero"
          rotulo="Conversas"
          valor={numeroBR(a.conversas)}
          frase="com atividade no período"
          legenda={a.legenda}
        />
        <Indicador
          data-bloco="atendimento-ia"
          marcaDoValor="atendimento-numero"
          rotulo="Só a IA atendeu"
          valor={a.conversas === 0 ? "0" : `${pct(a.semIntervencao, a.conversas)}%`}
          frase={`${numeroBR(a.semIntervencao)} de ${numeroBR(a.conversas)} sem resposta humana, ${numeroBR(a.comTime)} com o time`}
          legenda={a.legenda}
        />
        <IndicadorComparado
          data-bloco="atendimento-respostas"
          marcaDoValor="atendimento-numero"
          rotulo="Respostas da IA"
          valor={numeroBR(a.respostasIa)}
          frase={`${numeroBR(a.passouParaOTime)} ${plural(a.passouParaOTime, "vez", "vezes")} passou o caso para o time`}
          legenda={a.legenda}
          comparacao={
            a.anterior && {
              contra: a.rotuloAnterior,
              delta: calcularDelta({
                atual: a.respostasIa,
                anterior: a.anterior.respostasIa,
                direcao: "neutra",
                semBase: "sem respostas antes",
              }),
            }
          }
          serie={{
            pontos: a.movimento.barras.map((b) => ({ chave: b.chave, rotulo: b.rotulo, valor: b.ia })),
            nome: "Respostas da IA",
            formatar: numeroBR,
          }}
        />
        <IndicadorComparado
          data-bloco="atendimento-tempo"
          marcaDoValor="atendimento-numero"
          rotulo="Primeiro atendimento"
          valor={a.primeiraRespostaMs === null ? "Sem medição" : formatDuration(a.primeiraRespostaMs)}
          frase={
            a.primeiraRespostaMs === null
              ? "nenhuma conversa com resposta da IA no período"
              : `mediana de ${numeroBR(a.amostraMediana)} ${plural(a.amostraMediana, "atendimento", "atendimentos")}`
          }
          legenda={a.legenda}
          // Um tempo sai em segundos ou minutos, nunca em porcentagem (`deltaDuracao`, a conta do painel).
          comparacao={
            a.anterior && {
              contra: a.rotuloAnterior,
              delta:
                a.primeiraRespostaMs !== null && a.anterior.primeiraRespostaMs !== null
                  ? deltaDuracao({
                      atualMs: a.primeiraRespostaMs,
                      anteriorMs: a.anterior.primeiraRespostaMs,
                      semBase: "sem medição antes",
                    })
                  : null,
            }
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card variant="secao" data-bloco="atendimento-movimento" className="lg:col-span-2">
          <GraficoDeRespostas a={a} />
        </Card>
        <Card variant="secao" data-bloco="atendimento-solucoes">
          <GraficoDeSolucoes a={a} />
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card variant="secao" data-bloco="atendimento-motivos" className="lg:col-span-2">
          <GraficoDeMotivos a={a} />
        </Card>
        <Card variant="secao" data-bloco="atendimento-regras">
          <h2 className="text-rotulo uppercase text-ink-3">Regras salvas pelo time</h2>
          <p data-slot="atendimento-regras" className="mt-1 text-corpo text-ink">
            {a.regrasSalvas === 0
              ? "Nenhuma regra salva ainda."
              : `${numeroBR(a.regrasSalvas)} ${plural(a.regrasSalvas, "regra salva", "regras salvas")} para a IA.`}
          </p>
          <p className="mt-1 text-legenda text-ink-3">Total acumulado, não depende do período.</p>
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Quem respondeu ao longo do período: colunas empilhadas (IA e time)
// ---------------------------------------------------------------------------

const CONFIG_RESPOSTAS: ChartConfig = {
  ia: { label: "IA", color: "var(--chart-1)" },
  time: { label: "Time", color: "var(--chart-2)" },
};

function GraficoDeRespostas({ a }: { a: AtendimentoDoCliente }) {
  const animar = useAnimacaoDoGrafico();
  const { unidade, barras } = a.movimento;
  const porHora = unidade === "hora";
  const somaIa = barras.reduce((s, b) => s + b.ia, 0);
  const somaTime = barras.reduce((s, b) => s + b.time, 0);
  const titulo = porHora ? "Respostas por hora" : "Respostas por dia";

  return (
    <>
      <h2 className="text-rotulo uppercase text-ink-3">{titulo}</h2>
      <p className="mt-1 text-legenda text-ink-3">
        {porHora ? "Cada coluna é uma hora" : "Cada coluna é um dia"} (fuso de São Paulo), {a.legenda}. Quem respondeu:
        a IA ou o time.
      </p>
      {somaIa + somaTime === 0 ? (
        <EstadoVazio tamanho="compacto" data-slot="atendimento-movimento-vazio" texto="Nenhuma resposta no período." />
      ) : (
        <>
          <ChartContainer config={CONFIG_RESPOSTAS} className="mt-3" role="img" aria-label={titulo}>
            <BarChart data={barras} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--chart-grade)" />
              <XAxis
                dataKey="eixo"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                minTickGap={14}
              />
              <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
              <ChartTooltip
                cursor={{ fill: "var(--chart-cursor)", fillOpacity: 0.4 }}
                content={
                  <ChartTooltipContent<BarraDeMovimento>
                    titulo={(b) => b.rotulo}
                    formatarValor={(v) => numeroBR(v)}
                    rodape={(b) => (
                      <ChartTooltipLinha rotulo="Total" data-linha="total">
                        {numeroBR(b.ia + b.time)}
                      </ChartTooltipLinha>
                    )}
                  />
                }
              />
              <Bar
                dataKey="ia"
                stackId="respostas"
                fill="var(--color-ia)"
                stroke="var(--s-bloco)"
                strokeWidth={1}
                maxBarSize={24}
                isAnimationActive={animar}
              />
              <Bar
                dataKey="time"
                stackId="respostas"
                fill="var(--color-time)"
                stroke="var(--s-bloco)"
                strokeWidth={1}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={animar}
              />
            </BarChart>
          </ChartContainer>
          <ChartLegenda
            className="mt-2"
            itens={[
              { chave: "ia", rotulo: "IA", cor: "var(--chart-1)", valor: numeroBR(somaIa) },
              { chave: "time", rotulo: "Time", cor: "var(--chart-2)", valor: numeroBR(somaTime) },
            ]}
          />
          <p className="mt-2 text-legenda text-ink-3">
            As colunas contam por dia civil, com hoje; por isso a soma pode ficar um pouco abaixo do número de respostas
            da IA acima, que conta a janela inteira do período.
          </p>
          <ChartTabela
            nome="atendimento-movimento"
            legenda={titulo}
            colunas={[porHora ? "Hora" : "Dia", "IA", "Time"]}
            linhas={barras.map((b) => ({
              chave: b.chave,
              atributos: { "data-chave": b.chave, "data-ia": b.ia, "data-time": b.time },
              celulas: [b.rotulo, numeroBR(b.ia), numeroBR(b.time)],
            }))}
          />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Como os pedidos foram resolvidos: rosca
// ---------------------------------------------------------------------------

function GraficoDeSolucoes({ a }: { a: AtendimentoDoCliente }) {
  const animar = useAnimacaoDoGrafico();
  const total = a.pedidos.total;
  const fatias = useMemo(() => fatiasDasSolucoes(a), [a]);
  const config = useMemo<ChartConfig>(
    () => Object.fromEntries(fatias.map((f) => [f.chave, { label: f.rotulo, color: f.fill }])),
    [fatias]
  );

  return (
    <>
      <h2 className="text-rotulo uppercase text-ink-3">Como os pedidos foram resolvidos</h2>
      <p className="mt-1 text-legenda text-ink-3">Pedidos que abriram em {a.legenda}.</p>
      {total === 0 ? (
        <EstadoVazio tamanho="compacto" texto="Nada a mostrar sem pedidos no período." />
      ) : (
        <>
          <div className="relative mx-auto mt-3 w-full max-w-48">
            <ChartContainer config={config} className="h-44" role="img" aria-label="Como os pedidos foram resolvidos">
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent<FatiaDeSolucao>
                      semSeries
                      titulo={(f) => f.rotulo}
                      rodape={(f) => (
                        <>
                          <ChartTooltipLinha rotulo="Pedidos" data-linha="pedidos">
                            {numeroBR(f.n)}
                          </ChartTooltipLinha>
                          <ChartTooltipLinha rotulo="Do total" data-linha="fracao">
                            {pct(f.n, total)}%
                          </ChartTooltipLinha>
                        </>
                      )}
                    />
                  }
                />
                <Pie
                  data={fatias}
                  dataKey="n"
                  nameKey="rotulo"
                  innerRadius="64%"
                  outerRadius="96%"
                  paddingAngle={2}
                  stroke="var(--s-bloco)"
                  strokeWidth={2}
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={animar}
                />
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p data-slot="atendimento-pedidos-total" className="font-display text-numero tabular-nums text-ink">
                  {numeroBR(total)}
                </p>
                <p className="text-legenda text-ink-3">{plural(total, "pedido", "pedidos")}</p>
              </div>
            </div>
          </div>
          <ChartLegenda
            className="mt-3 flex-col items-start gap-y-1.5"
            itens={fatias.map((f) => ({
              chave: f.chave,
              rotulo: f.rotulo,
              cor: f.fill,
              valor: `${numeroBR(f.n)} (${pct(f.n, total)}%)`,
            }))}
          />
          <ChartTabela
            nome="atendimento-solucoes"
            legenda="Como os pedidos foram resolvidos"
            linhas={fatias.map((f) => ({
              chave: f.chave,
              atributos: { "data-solucao": f.chave, "data-n": f.n },
              celulas: [f.rotulo, numeroBR(f.n)],
            }))}
          />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Por que a IA chamou o time: barras na horizontal
// ---------------------------------------------------------------------------

const CONFIG_MOTIVOS: ChartConfig = { n: { label: "Pedidos", color: "var(--chart-1)" } };

interface BarraDeMotivo {
  chave: string;
  rotulo: string;
  n: number;
  fill: string;
}

/** O rótulo do eixo em até duas linhas (quebra no espaço mais perto do meio), para nome longo não vazar. */
function TickDoMotivo({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const linhas = quebrarRotulo(String(payload?.value ?? ""));
  return (
    <text x={x} y={y} textAnchor="end" className="fill-ink-2" fontSize={12}>
      {linhas.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? (linhas.length > 1 ? "-0.2em" : "0.35em") : "1.15em"}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function FormaDaBarra(p: BarShapeProps) {
  return <Rectangle {...p} fill={(p.payload as BarraDeMotivo).fill} />;
}

function GraficoDeMotivos({ a }: { a: AtendimentoDoCliente }) {
  const animar = useAnimacaoDoGrafico();
  const total = a.pedidos.total;
  const barras = useMemo<BarraDeMotivo[]>(
    () =>
      a.pedidos.motivos.map((m) => ({
        chave: m.motivo ?? "sem",
        rotulo: m.rotulo,
        n: m.n,
        // Motivo não é bom nem ruim: a marca, e cinza para "Sem motivo".
        fill: m.motivo === null ? "var(--ink-faint)" : "var(--chart-1)",
      })),
    [a.pedidos.motivos]
  );

  return (
    <>
      <h2 className="text-rotulo uppercase text-ink-3">Por que a IA chamou o time</h2>
      <p className="mt-1 text-legenda text-ink-3">
        {numeroBR(total)} {plural(total, "pedido", "pedidos")} de ajuda, {a.legenda}
      </p>
      {total === 0 ? (
        <EstadoVazio tamanho="compacto" texto="Nenhum pedido de ajuda no período." />
      ) : (
        <>
          <ChartContainer
            config={CONFIG_MOTIVOS}
            className="mt-3"
            style={{ height: Math.max(120, barras.length * 38 + 16) }}
            role="img"
            aria-label="Pedidos de ajuda por motivo"
          >
            <BarChart data={barras} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid horizontal={false} stroke="var(--chart-grade)" />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="rotulo"
                width={128}
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={<TickDoMotivo />}
              />
              <ChartTooltip
                cursor={{ fill: "var(--chart-cursor)", fillOpacity: 0.4 }}
                content={
                  <ChartTooltipContent<BarraDeMotivo>
                    semSeries
                    titulo={(b) => b.rotulo}
                    rodape={(b) => (
                      <>
                        <ChartTooltipLinha rotulo="Pedidos" data-linha="pedidos">
                          {numeroBR(b.n)}
                        </ChartTooltipLinha>
                        <ChartTooltipLinha rotulo="Do total" data-linha="fracao">
                          {pct(b.n, total)}%
                        </ChartTooltipLinha>
                      </>
                    )}
                  />
                }
              />
              <Bar
                dataKey="n"
                shape={FormaDaBarra}
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
                isAnimationActive={animar}
              >
                <LabelList dataKey="n" position="right" className="fill-ink" fontSize={12} fontWeight={600} />
              </Bar>
            </BarChart>
          </ChartContainer>
          <ChartTabela
            nome="atendimento-motivos"
            legenda="Pedidos de ajuda por motivo"
            linhas={barras.map((b) => ({
              chave: b.chave,
              atributos: { "data-motivo": b.chave, "data-n": b.n },
              celulas: [b.rotulo, numeroBR(b.n)],
            }))}
          />
        </>
      )}
    </>
  );
}

export default memo(AbaAtendimento);
