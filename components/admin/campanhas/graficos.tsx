"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Pie, PieChart, Rectangle, XAxis, YAxis, type BarShapeProps } from "recharts";
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
import { diaMes } from "@/lib/fuso";
import { textoDoDiaDeEnvio, type DiaDeEnvio, type Taxa } from "@/lib/prospeccao";

// OS GRÁFICOS de Campanhas, todos pela porta da casa (`components/ui/chart.tsx`):
// a marca é a única cor de série, o neutro é o resto, e cada gráfico tem balão,
// legenda quando há duas séries e a tabela em texto. Quem chama monta os dados
// com as funções puras de `lib/prospeccao.ts`; aqui só se desenha.

const CURSOR = { fill: "var(--chart-cursor)", fillOpacity: 0.4 };

/** O cabeçalho de um bloco de gráfico: o nome em rótulo, a frase e, à direita, o destaque. */
export function CabecalhoDoGrafico({
  titulo,
  frase,
  destaque,
}: {
  titulo: string;
  frase: React.ReactNode;
  destaque?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h3 className="text-rotulo uppercase text-ink-3">{titulo}</h3>
        <p className="mt-1 text-legenda text-ink-3">{frase}</p>
      </div>
      {destaque}
    </div>
  );
}

/** O número de destaque de um gráfico ("Terça" e "38% responderam"). */
export function DestaqueDoGrafico({ valor, frase, slot }: { valor: string; frase: string; slot: string }) {
  return (
    <div className="ml-auto text-right" data-slot={slot}>
      <p className="font-display text-titulo text-ink">{valor}</p>
      <p className="text-legenda text-ink-3">{frase}</p>
    </div>
  );
}

// ── Envios por dia: colunas empilhadas (responderam + sem resposta) ─────

type BarraDoDia = DiaDeEnvio & { eixo: string; rotulo: string; semResposta: number };

const CONFIG_DIAS: ChartConfig = {
  responderam: { label: "Responderam", color: "var(--chart-1)" },
  semResposta: { label: "Sem resposta", color: "var(--chart-barra-neutra)" },
};

export function GraficoDeEnviosPorDia({ serie, legenda }: { serie: DiaDeEnvio[]; legenda: string }) {
  const animar = useAnimacaoDoGrafico();
  const barras = useMemo<BarraDoDia[]>(
    () => serie.map((d) => ({ ...d, eixo: diaMes(d.dia), rotulo: textoDoDiaDeEnvio(d.dia), semResposta: d.enviados - d.responderam })),
    [serie],
  );
  const enviados = serie.reduce((s, d) => s + d.enviados, 0);
  const responderam = serie.reduce((s, d) => s + d.responderam, 0);
  return (
    <>
      <CabecalhoDoGrafico
        titulo="Envios por dia"
        frase={`Cada coluna é um dia (fuso de São Paulo), ${legenda}. A resposta conta no dia em que a mensagem saiu.`}
      />
      {enviados === 0 ? (
        <EstadoVazio tamanho="compacto" texto="Nenhuma mensagem enviada no período." />
      ) : (
        <>
          <ChartContainer config={CONFIG_DIAS} className="mt-4 h-56" role="img" aria-label="Envios por dia">
            <BarChart data={barras} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%">
              <CartesianGrid vertical={false} stroke="var(--chart-grade)" />
              <XAxis dataKey="eixo" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={18} />
              <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <ChartTooltip
                cursor={CURSOR}
                content={
                  <ChartTooltipContent<BarraDoDia>
                    titulo={(b) => b.rotulo}
                    formatarValor={(v) => numeroBR(v)}
                    rodape={(b) => (
                      <ChartTooltipLinha rotulo="Enviadas" data-linha="enviadas">
                        {numeroBR(b.enviados)}
                      </ChartTooltipLinha>
                    )}
                  />
                }
              />
              <Bar dataKey="responderam" stackId="dia" fill="var(--color-responderam)" stroke="var(--s-raised)" strokeWidth={1} maxBarSize={22} isAnimationActive={animar} />
              <Bar
                dataKey="semResposta"
                stackId="dia"
                fill="var(--color-semResposta)"
                stroke="var(--s-raised)"
                strokeWidth={1}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
                isAnimationActive={animar}
              />
            </BarChart>
          </ChartContainer>
          <ChartLegenda
            className="mt-3"
            itens={[
              { chave: "responderam", rotulo: "Responderam", cor: "var(--chart-1)", valor: numeroBR(responderam) },
              { chave: "semResposta", rotulo: "Sem resposta", cor: "var(--chart-barra-neutra)", valor: numeroBR(enviados - responderam) },
            ]}
          />
          <ChartTabela
            nome="campanhas-envios-por-dia"
            legenda="Envios por dia"
            colunas={["Dia", "Enviadas", "Responderam"]}
            linhas={barras.map((b) => ({
              chave: b.dia,
              atributos: { "data-dia": b.dia, "data-enviados": b.enviados, "data-responderam": b.responderam },
              celulas: [b.rotulo, numeroBR(b.enviados), numeroBR(b.responderam)],
            }))}
          />
        </>
      )}
    </>
  );
}

// ── Taxa por dia da semana, por horário e por mensagem: o melhor em destaque ──

export interface BarraDeTaxa extends Taxa {
  chave: string;
  /** O texto do eixo ("ter", "9h", "Variante 2"). */
  eixo: string;
  /** O texto do balão ("terça", "das 9h às 10h"). */
  rotulo: string;
  /** A taxa como número para a altura (0 sem envio). */
  valor: number;
  fill: string;
}

/** As barras de uma comparação: a melhor taxa na cor da marca, o resto neutro. */
export function barrasDeTaxa(
  linhas: Taxa[],
  melhor: number | null,
  textos: (i: number) => { chave: string; eixo: string; rotulo: string },
): BarraDeTaxa[] {
  return linhas.map((l, i) => ({
    ...l,
    ...textos(i),
    valor: l.taxa ?? 0,
    fill: i === melhor ? "var(--chart-1)" : "var(--chart-barra-neutra)",
  }));
}

function FormaDaBarra(p: BarShapeProps) {
  return <Rectangle {...p} fill={(p.payload as { fill: string }).fill} />;
}

function BalaoDeTaxa() {
  return (
    <ChartTooltipContent<BarraDeTaxa>
      semSeries
      titulo={(b) => b.rotulo}
      rodape={(b) =>
        b.enviados === 0 ? (
          <p className="text-ink-3">Nenhum envio</p>
        ) : (
          <>
            <ChartTooltipLinha rotulo="Responderam" data-linha="taxa">
              {b.taxa}%
            </ChartTooltipLinha>
            <ChartTooltipLinha rotulo="Enviadas" data-linha="enviadas">
              {numeroBR(b.enviados)}
            </ChartTooltipLinha>
            <ChartTooltipLinha rotulo="Respostas" data-linha="respostas">
              {numeroBR(b.responderam)}
            </ChartTooltipLinha>
          </>
        )
      }
    />
  );
}

const CONFIG_TAXA: ChartConfig = { valor: { label: "Taxa de resposta", color: "var(--chart-1)" } };

/** Colunas de taxa de resposta (dia da semana, horário). */
export function GraficoDeTaxaEmColunas({ nome, barras }: { nome: string; barras: BarraDeTaxa[] }) {
  const animar = useAnimacaoDoGrafico();
  return (
    <>
      <ChartContainer config={CONFIG_TAXA} className="mt-4 h-48" role="img" aria-label={nome}>
        <BarChart data={barras} margin={{ top: 20, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--chart-grade)" />
          <XAxis dataKey="eixo" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
          <YAxis tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => `${v}%`} allowDecimals={false} />
          <ChartTooltip cursor={CURSOR} content={<BalaoDeTaxa />} />
          <Bar dataKey="valor" shape={FormaDaBarra} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animar}>
            <LabelList
              dataKey="valor"
              position="top"
              className="fill-ink-3"
              fontSize={11}
              formatter={(v: unknown) => (Number(v) > 0 ? `${v}%` : "")}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      <TabelaDeTaxa nome={nome} barras={barras} />
    </>
  );
}

/** Barras deitadas de taxa (as variantes da mensagem: nomes longos e ordem). */
export function GraficoDeTaxaDeitado({ nome, barras }: { nome: string; barras: BarraDeTaxa[] }) {
  const animar = useAnimacaoDoGrafico();
  return (
    <>
      <ChartContainer
        config={CONFIG_TAXA}
        className="mt-4"
        style={{ height: Math.max(96, barras.length * 44 + 8) }}
        role="img"
        aria-label={nome}
      >
        <BarChart data={barras} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke="var(--chart-grade)" />
          <XAxis type="number" hide domain={[0, (max: number) => Math.max(10, max)]} />
          <YAxis type="category" dataKey="eixo" width={84} tickLine={false} axisLine={false} interval={0} />
          <ChartTooltip cursor={CURSOR} content={<BalaoDeTaxa />} />
          <Bar dataKey="valor" shape={FormaDaBarra} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={animar}>
            <LabelList
              dataKey="valor"
              position="right"
              className="fill-ink"
              fontSize={12}
              fontWeight={600}
              formatter={(v: unknown) => `${v}%`}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      <TabelaDeTaxa nome={nome} barras={barras} />
    </>
  );
}

function TabelaDeTaxa({ nome, barras }: { nome: string; barras: BarraDeTaxa[] }) {
  return (
    <ChartTabela
      nome={nome}
      legenda={nome}
      colunas={["", "Enviadas", "Responderam", "Taxa"]}
      linhas={barras.map((b) => ({
        chave: b.chave,
        atributos: { "data-chave": b.chave, "data-enviados": b.enviados, "data-taxa": b.taxa ?? "" },
        celulas: [b.rotulo, numeroBR(b.enviados), numeroBR(b.responderam), b.taxa === null ? "sem envios" : `${b.taxa}%`],
      }))}
    />
  );
}

// ── Leads: barras deitadas empilhadas (por cidade) e o funil ───────────

export interface BarraDeCidade {
  chave: string;
  rotulo: string;
  contatados: number;
  aContatar: number;
  /** Sem celular, descartados ou que pediram para parar. */
  fora: number;
  total: number;
}

const CONFIG_CIDADES: ChartConfig = {
  contatados: { label: "Contatados", color: "var(--chart-1)" },
  aContatar: { label: "A contatar", color: "var(--chart-rampa-2)" },
  fora: { label: "Fora das campanhas", color: "var(--chart-barra-neutra)" },
};

export function GraficoPorCidade({ barras }: { barras: BarraDeCidade[] }) {
  const animar = useAnimacaoDoGrafico();
  const soma = (k: "contatados" | "aContatar" | "fora") => barras.reduce((s, b) => s + b[k], 0);
  return (
    <>
      <ChartContainer
        config={CONFIG_CIDADES}
        className="mt-4"
        style={{ height: Math.max(120, barras.length * 34 + 8) }}
        role="img"
        aria-label="Leads por cidade"
      >
        <BarChart data={barras} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid horizontal={false} stroke="var(--chart-grade)" />
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="rotulo" width={132} tickLine={false} axisLine={false} interval={0} />
          <ChartTooltip
            cursor={CURSOR}
            content={
              <ChartTooltipContent<BarraDeCidade>
                titulo={(b) => b.rotulo}
                formatarValor={(v) => numeroBR(v)}
                rodape={(b) => (
                  <ChartTooltipLinha rotulo="Na base" data-linha="total">
                    {numeroBR(b.total)}
                  </ChartTooltipLinha>
                )}
              />
            }
          />
          <Bar dataKey="contatados" stackId="c" fill="var(--color-contatados)" stroke="var(--s-raised)" strokeWidth={1} maxBarSize={18} isAnimationActive={animar} />
          <Bar dataKey="aContatar" stackId="c" fill="var(--color-aContatar)" stroke="var(--s-raised)" strokeWidth={1} maxBarSize={18} isAnimationActive={animar} />
          <Bar
            dataKey="fora"
            stackId="c"
            fill="var(--color-fora)"
            stroke="var(--s-raised)"
            strokeWidth={1}
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={animar}
          >
            <LabelList dataKey="total" position="right" className="fill-ink" fontSize={12} fontWeight={600} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <ChartLegenda
        className="mt-3"
        itens={[
          { chave: "contatados", rotulo: "Contatados", cor: "var(--chart-1)", valor: numeroBR(soma("contatados")) },
          { chave: "aContatar", rotulo: "A contatar", cor: "var(--chart-rampa-2)", valor: numeroBR(soma("aContatar")) },
          { chave: "fora", rotulo: "Fora das campanhas", cor: "var(--chart-barra-neutra)", valor: numeroBR(soma("fora")) },
        ]}
      />
      <ChartTabela
        nome="leads-por-cidade"
        legenda="Leads por cidade"
        colunas={["Cidade", "Na base", "Contatados", "A contatar", "Fora"]}
        linhas={barras.map((b) => ({
          chave: b.chave,
          atributos: { "data-cidade": b.chave, "data-total": b.total },
          celulas: [b.rotulo, numeroBR(b.total), numeroBR(b.contatados), numeroBR(b.aContatar), numeroBR(b.fora)],
        }))}
      />
    </>
  );
}

export interface DegrauDoFunil {
  chave: string;
  rotulo: string;
  n: number;
  /** % do degrau anterior (null no primeiro). */
  doAnterior: number | null;
  fill: string;
}

/** O funil da base: cada degrau uma barra deitada, mais cheia quanto mais perto da resposta. */
export function GraficoDoFunil({ degraus }: { degraus: DegrauDoFunil[] }) {
  const animar = useAnimacaoDoGrafico();
  return (
    <>
      <ChartContainer
        config={{ n: { label: "Leads", color: "var(--chart-1)" } }}
        className="mt-4"
        style={{ height: degraus.length * 44 + 8 }}
        role="img"
        aria-label="Funil da base"
      >
        <BarChart data={degraus} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }} barCategoryGap="22%">
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="rotulo" width={96} tickLine={false} axisLine={false} interval={0} />
          <ChartTooltip
            cursor={CURSOR}
            content={
              <ChartTooltipContent<DegrauDoFunil>
                semSeries
                titulo={(d) => d.rotulo}
                rodape={(d) => (
                  <>
                    <ChartTooltipLinha rotulo="Leads" data-linha="n">
                      {numeroBR(d.n)}
                    </ChartTooltipLinha>
                    {d.doAnterior !== null && (
                      <ChartTooltipLinha rotulo="Do degrau anterior" data-linha="anterior">
                        {d.doAnterior}%
                      </ChartTooltipLinha>
                    )}
                  </>
                )}
              />
            }
          />
          <Bar dataKey="n" shape={FormaDaBarra} radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={animar}>
            <LabelList
              dataKey="n"
              position="right"
              className="fill-ink"
              fontSize={12}
              fontWeight={600}
              formatter={(v: unknown) => numeroBR(Number(v))}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      <ChartTabela
        nome="leads-funil"
        legenda="Funil da base"
        colunas={["Degrau", "Leads", "Do anterior"]}
        linhas={degraus.map((d) => ({
          chave: d.chave,
          atributos: { "data-degrau": d.chave, "data-n": d.n },
          celulas: [d.rotulo, numeroBR(d.n), d.doAnterior === null ? "" : `${d.doAnterior}%`],
        }))}
      />
    </>
  );
}

/** Monta os degraus do funil; a cor sobe na rampa da marca a cada degrau. */
export function degrausDoFunil(passos: { chave: string; rotulo: string; n: number }[]): DegrauDoFunil[] {
  const rampa = ["var(--chart-rampa-2)", "var(--chart-rampa-3)", "var(--chart-rampa-4)"];
  return passos.map((p, i) => ({
    ...p,
    doAnterior: i === 0 ? null : pct(p.n, passos[i - 1].n),
    fill: rampa[Math.min(rampa.length - 1, i + Math.max(0, rampa.length - passos.length))],
  }));
}

// ── Rosca (presença online, pontuação) ──────────────────────────────────

export interface FatiaDaRosca {
  chave: string;
  rotulo: string;
  n: number;
  fill: string;
}

export function Rosca({ nome, fatias, unidade }: { nome: string; fatias: FatiaDaRosca[]; unidade: [string, string] }) {
  const animar = useAnimacaoDoGrafico();
  const total = fatias.reduce((s, f) => s + f.n, 0);
  const config = useMemo<ChartConfig>(
    () => Object.fromEntries(fatias.map((f) => [f.chave, { label: f.rotulo, color: f.fill }])),
    [fatias],
  );
  if (total === 0) return <EstadoVazio tamanho="compacto" texto="Nada a mostrar ainda." />;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-6">
      <div className="relative w-36 shrink-0">
        <ChartContainer config={config} className="h-36" role="img" aria-label={nome}>
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent<FatiaDaRosca>
                  semSeries
                  titulo={(f) => f.rotulo}
                  rodape={(f) => (
                    <>
                      <ChartTooltipLinha rotulo="Leads" data-linha="n">
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
              innerRadius="66%"
              outerRadius="96%"
              paddingAngle={2}
              stroke="var(--s-raised)"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={animar}
            />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-display text-titulo tabular-nums text-ink">{numeroBR(total)}</p>
            <p className="text-legenda text-ink-3">{plural(total, unidade[0], unidade[1])}</p>
          </div>
        </div>
      </div>
      <ChartLegenda
        className="min-w-0 flex-1 flex-col items-start gap-y-2"
        itens={fatias.map((f) => ({ chave: f.chave, rotulo: f.rotulo, cor: f.fill, valor: `${numeroBR(f.n)} (${pct(f.n, total)}%)` }))}
      />
      <ChartTabela
        nome={nome}
        legenda={nome}
        linhas={fatias.map((f) => ({
          chave: f.chave,
          atributos: { "data-fatia": f.chave, "data-n": f.n },
          celulas: [f.rotulo, numeroBR(f.n), `${pct(f.n, total)}%`],
        }))}
      />
    </div>
  );
}
