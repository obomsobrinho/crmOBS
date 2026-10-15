"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { MapaDeCalor } from "@/components/ui/mapa-de-calor";
import { numeroBR, plural } from "@/lib/format";
import { ROTULO_ESTADO_DA_IA, tokensCurto, usdCurto } from "@/lib/custo-ia";
import { PERIODOS, PERIODO_PADRAO, type PeriodoKey } from "@/lib/periodo";
import { useCarga } from "@/lib/use-carga";
import SeletorDePeriodo from "@/components/painel/SeletorDePeriodo";
import {
  DIAS_DA_SEMANA,
  DIAS_DA_SEMANA_CURTO,
  marcasDoEixo,
  ritmoDoLimite,
  type BarraDeUso,
  type GradeDeHoras,
  type UsoDoCliente,
  type UsoDoPeriodo,
} from "@/lib/admin-cliente";
import type { EmpresaItem } from "@/lib/admin-empresas";
import type { FonteDoCliente } from "@/lib/admin-cliente-fonte";
import { FalhaAoLer, Indicador, MedidorDoLimite } from "@/components/admin/pecas";

// ABA "USO DE IA" do detalhe de um cliente (central do dono). Um filtro de período
// (os chips do painel, `lib/periodo.ts`) manda nos quatro números e no gráfico;
// UM gráfico junta o consumo e o limite do mês; embaixo, os horários de pico.
// Este componente só desenha: as somas e o custo vêm de `lib/admin-cliente.ts`
// sobre `lib/custo-ia.ts`, o agregado é do banco (`admin_cliente_uso` e
// `admin_cliente_uso_horas`), e os QUATRO períodos chegam numa leitura só, então
// trocar de período não busca nada.
export default function AbaUsoDeIa({
  fonte,
  empresa,
  agora,
  onEditarLimite,
}: {
  fonte: FonteDoCliente;
  empresa: EmpresaItem;
  /** O relógio do servidor com que `empresa` foi montada (o ritmo do limite usa o mês dele). */
  agora: number;
  onEditarLimite: () => void;
}) {
  const [periodo, setPeriodo] = useState<PeriodoKey>(PERIODO_PADRAO);
  const { dados: uso, erro, tentarDeNovo } = useCarga<UsoDoCliente>(fonte.uso);
  const atual = uso?.periodos[periodo];

  return (
    <div data-slot="central-aba-uso" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-legenda text-ink-3">O consumo de IA do agente, {PERIODOS[periodo].legenda}.</p>
        <SeletorDePeriodo valor={periodo} aoMudar={setPeriodo} />
      </div>

      {atual && <Indicadores uso={atual} />}

      <Card variant="secao" data-bloco="central-uso">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-rotulo uppercase text-ink-3">Consumo e limite do mês</h2>
          <span data-slot="central-limite-estado" className="text-apoio font-semibold text-ink-2">
            {ROTULO_ESTADO_DA_IA[empresa.estado]}
          </span>
          <Button
            variant="outline"
            size="control"
            className="ml-auto"
            data-slot="central-editar-limite"
            onClick={onEditarLimite}
          >
            <Pencil size={14} />
            Editar limite
          </Button>
        </div>
        <MedidorDoLimite e={empresa} unidade className="mt-3" />
        <p className="mt-2 text-legenda text-ink-3">
          {empresa.limiteGravado == null
            ? "Limite padrão do sistema."
            : `Limite definido para este cliente: ${numeroBR(empresa.limiteGravado)} tokens.`}{" "}
          <span data-slot="central-limite-custo">
            Custo estimado do mês: {usdCurto(empresa.custoUsd) ?? "sem preço do modelo na tabela"}.
          </span>
        </p>

        {erro ? (
          <FalhaAoLer texto="Não deu para ler o uso de IA agora." aoTentar={tentarDeNovo} />
        ) : !atual ? (
          <p data-slot="central-uso-carregando" className="mt-4 text-legenda text-ink-3">
            Carregando o uso…
          </p>
        ) : (
          <GraficoDeUso uso={atual} limite={empresa.limite} agora={agora} />
        )}
      </Card>

      {uso && <GradeDePico grade={uso.grade} />}
    </div>
  );
}

function Indicadores({ uso }: { uso: UsoDoPeriodo }) {
  const { total, maior, unidade, legenda } = uso;
  const custo = usdCurto(total.custoUsd);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Indicador
        data-bloco="uso-tokens"
        data-usados={total.usados}
        rotulo="Tokens"
        valor={tokensCurto(total.usados)}
        frase={`${numeroBR(total.usados)} de entrada e saída, o que conta para o limite`}
        legenda={legenda}
      />
      <Indicador
        data-bloco="uso-turnos"
        data-turnos={total.turnos}
        rotulo="Turnos do agente"
        valor={numeroBR(total.turnos)}
        frase={`${plural(total.turnos, "vez em que a IA chamou", "vezes em que a IA chamou")} o modelo`}
        legenda={legenda}
      />
      <Indicador
        data-bloco="uso-custo"
        rotulo="Custo estimado"
        valor={custo ?? "Sem preço"}
        frase={custo ? "pela tabela de preços do modelo" : "o modelo não está na tabela de preços"}
        legenda={legenda}
      />
      <Indicador
        data-bloco="uso-maior"
        rotulo={unidade === "hora" ? "Hora de maior uso" : "Dia de maior uso"}
        valor={maior ? tokensCurto(maior.usados) : "Sem uso"}
        frase={maior ? `tokens em ${maior.rotulo}` : "nenhum turno no período"}
        legenda={legenda}
      />
    </div>
  );
}

const CONFIG: ChartConfig = {
  usados: { label: "Tokens", color: "var(--chart-1)" },
};

// UM gráfico: colunas de tokens por hora ("Dia") ou por dia (os outros períodos)
// e, na mesma escala, a linha tracejada do RITMO DO LIMITE. Por que colunas e
// linha de referência, e não o acumulado do mês contra o teto: o período é uma
// janela móvel (24 horas a 30 dias) que nem sempre começa no dia 1, então um
// acumulado na janela não seria o do contador do limite, e o acumulado do mês
// numa segunda escala seria um eixo duplo. O que o dono precisa ler é "este dia
// foi mais pesado ou mais leve do que o limite aguenta", e isso é coluna contra
// uma linha. O consumo acumulado contra o teto é a barra de cima (o contador do
// mês, o que decide a parada).
function GraficoDeUso({ uso, limite, agora }: { uso: UsoDoPeriodo; limite: number; agora: number }) {
  const animar = useAnimacaoDoGrafico();
  const porHora = uso.unidade === "hora";
  const ritmo = ritmoDoLimite(limite, agora, uso.unidade);
  const sem = uso.total.usados === 0;
  const marcas = marcasDoEixo(Math.max(...uso.barras.map((b) => b.usados), ritmo));

  return (
    <div data-slot="central-grafico" data-unidade={uso.unidade} className="mt-4 border-t border-line-soft pt-4">
      <h3 className="text-apoio font-semibold text-ink">{porHora ? "Tokens por hora" : "Tokens por dia"}</h3>
      <p className="mt-0.5 text-legenda text-ink-3">
        {porHora ? "Cada coluna é uma hora" : "Cada coluna é um dia"} (fuso de São Paulo), {uso.legenda}.
      </p>

      {sem ? (
        <EstadoVazio
          tamanho="compacto"
          data-slot="central-grafico-vazio"
          texto={`Nenhum uso de IA neste período (${uso.legenda}).`}
        />
      ) : (
        <>
          <ChartContainer
            config={CONFIG}
            className="mt-3"
            role="img"
            aria-label={`${porHora ? "Tokens por hora" : "Tokens por dia"}, ${uso.legenda}`}
          >
            <BarChart data={uso.barras} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--chart-grade)" />
              <XAxis
                dataKey="eixo"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                minTickGap={14}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                ticks={marcas}
                domain={[0, marcas[marcas.length - 1]]}
                tickFormatter={(v: number) => tokensCurto(v)}
              />
              <ChartTooltip
                cursor={{ fill: "var(--chart-cursor)", fillOpacity: 0.4 }}
                content={
                  <ChartTooltipContent<BarraDeUso>
                    semSeries
                    titulo={(b) => b.rotulo}
                    rodape={(b) => (
                      <>
                        <ChartTooltipLinha rotulo="Tokens" data-linha="tokens">
                          {numeroBR(b.usados)}
                        </ChartTooltipLinha>
                        <ChartTooltipLinha rotulo="Turnos" data-linha="turnos">
                          {numeroBR(b.turnos)}
                        </ChartTooltipLinha>
                        <ChartTooltipLinha rotulo="Custo estimado" data-linha="custo">
                          {usdCurto(b.custoUsd) ?? "sem preço do modelo"}
                        </ChartTooltipLinha>
                        <ChartTooltipLinha rotulo="Ritmo do limite" data-linha="ritmo">
                          {tokensCurto(ritmo)}
                        </ChartTooltipLinha>
                      </>
                    )}
                  />
                }
              />
              <ReferenceLine
                y={ritmo}
                stroke="var(--chart-guia)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              <Bar
                dataKey="usados"
                fill="var(--color-usados)"
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={animar}
              />
            </BarChart>
          </ChartContainer>

          <ChartLegenda
            className="mt-2"
            itens={[
              { chave: "usados", rotulo: porHora ? "Tokens por hora" : "Tokens por dia", tipo: "barra", cor: "var(--chart-1)" },
              {
                chave: "ritmo",
                rotulo: `Ritmo do limite: ${tokensCurto(ritmo)} por ${porHora ? "hora" : "dia"}`,
                tipo: "tracejada",
                cor: "var(--chart-guia)",
              },
            ]}
          />
          <p className="mt-2 text-legenda text-ink-3">
            O ritmo é o limite de {tokensCurto(limite)} tokens do mês dividido pelos dias do mês
            {porHora ? " e por 24" : ""}: uma coluna acima da linha é um {porHora ? "horário" : "dia"} mais pesado
            do que o limite aguenta. O limite conta pelo contador do mês; as colunas somam os turnos registrados.
          </p>

          <ChartTabela
            nome="central-uso"
            legenda={porHora ? "Tokens por hora" : "Tokens por dia"}
            colunas={[porHora ? "Hora" : "Dia", "Tokens", "Turnos", "Custo estimado"]}
            linhas={uso.barras.map((b) => ({
              chave: b.chave,
              atributos: { "data-chave": b.chave, "data-usados": b.usados, "data-turnos": b.turnos },
              celulas: [b.rotulo, numeroBR(b.usados), numeroBR(b.turnos), usdCurto(b.custoUsd) ?? "sem preço do modelo"],
            }))}
          />
        </>
      )}
    </div>
  );
}

const HORAS_ROTULADAS = [0, 3, 6, 9, 12, 15, 18, 21];

const hora2 = (h: number) => String(h).padStart(2, "0");
const turnosTexto = (n: number) => `${numeroBR(n)} ${plural(n, "turno", "turnos")}`;

function GradeDePico({ grade }: { grade: GradeDeHoras }) {
  return (
    <Card variant="secao" data-bloco="central-grade">
      <h2 className="text-rotulo uppercase text-ink-3">Horários de pico</h2>
      <p className="mt-1 text-legenda text-ink-3">
        Turnos do agente por dia da semana e hora, últimos 30 dias (fuso de São Paulo). Não muda com o período.
      </p>
      {grade.total === 0 || !grade.pico ? (
        <EstadoVazio tamanho="compacto" data-slot="central-grade-vazio" texto="Nenhum uso de IA nos últimos 30 dias." />
      ) : (
        <>
          <p data-slot="central-grade-pico" className="mt-3 text-apoio text-ink-2">
            Pico: {DIAS_DA_SEMANA[grade.pico.dia]}, {hora2(grade.pico.hora)}h ({turnosTexto(grade.pico.n)}).
          </p>
          <MapaDeCalor
            className="mt-3"
            rotulosDasLinhas={DIAS_DA_SEMANA_CURTO}
            colunas={24}
            rotuloDaColuna={(h) => (HORAS_ROTULADAS.includes(h) ? String(h) : "")}
            valores={grade.celulas}
            maximo={grade.maximo}
            pico={{ linha: grade.pico.dia, coluna: grade.pico.hora }}
            descrever={(l, h, n) => `${DIAS_DA_SEMANA[l]}, ${hora2(h)}h: ${turnosTexto(n)}`}
            legenda={{ menos: "Menos turnos", mais: "Mais turnos", pico: "Pico" }}
          />
        </>
      )}
    </Card>
  );
}
