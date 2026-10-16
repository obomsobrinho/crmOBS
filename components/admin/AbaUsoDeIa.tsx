"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Pie, PieChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { CalendarDays } from "lucide-react";
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
  type PontoDeTendencia,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItemMarcado,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Input } from "@/components/ui/input";
import { diaIsoSP } from "@/lib/fuso";
import { numeroBR, pct, plural } from "@/lib/format";
import { ROTULO_ESTADO_DA_IA, tokensCurto } from "@/lib/custo-ia";
import { custoCurto, custoDoPonto, custoNaMoeda, notaDoCambio, type Cambio } from "@/lib/cambio";
import { calcularDelta } from "@/lib/delta";
import { PERIODO_PADRAO } from "@/lib/periodo";
import { useCarga } from "@/lib/use-carga";
import { janelaDoChip, janelaDoIntervalo, resumoDePicos, type BarraDePico, type DadosDePicos, type JanelaDePicos } from "@/lib/picos";
import SeletorDePeriodo from "@/components/painel/SeletorDePeriodo";
import {
  barrasComRitmo,
  descricaoDaSelecao,
  marcasDoEixo,
  mesesDoSeletor,
  nomeDoMes,
  tamanhoDoCentroDoDonut,
  textoDoModelo,
  trechosDoRitmo,
  type BarraComRitmo,
  type ModeloDoCliente,
  type SelecaoDeUso,
  type SelecaoHistorica,
  type UnidadeDeUso,
  type UsoDoCliente,
  type UsoDoPeriodo,
  type UsoHistorico,
} from "@/lib/admin-cliente";
import type { EmpresaItem } from "@/lib/admin-empresas";
import type { FonteDoCliente } from "@/lib/admin-cliente-fonte";
import { FalhaAoLer, Indicador, RitmoDoLimite, RotuloDoUso } from "@/components/admin/pecas";
import IndicadorComparado from "@/components/admin/IndicadorComparado";

// ABA "USO DE IA" do detalhe de um cliente (central do dono). UM filtro de período manda em tudo: os
// chips do painel (`lib/periodo.ts`), um seletor ao lado deles (meses passados, "Todo o período" e um
// intervalo de datas escolhido) e, embaixo, os quatro números, o gráfico de consumo contra o limite e os
// horários de pico.
// Este componente só desenha: as somas, o custo e os picos vêm de `lib/admin-cliente.ts` sobre
// `lib/custo-ia.ts` e de `lib/picos.ts` (puro, vai para o painel dos tenants), o agregado é do banco
// (`admin_cliente_uso`, `_horas`, `_meses`, `admin_cliente_picos`). Os QUATRO chips chegam numa leitura
// só, então trocar de chip não busca nada; um mês, "Todo o período" ou um intervalo busca uma vez (a
// fonte lembra a resposta). O limite se edita na aba "Ações".
function AbaUsoDeIa({
  fonte,
  empresa,
  agora,
  modelo,
  cambio,
  cambioBuscando = false,
}: {
  fonte: FonteDoCliente;
  empresa: EmpresaItem;
  /** O relógio do servidor com que `empresa` foi montada. */
  agora: number;
  /** O modelo de IA do cliente e de onde veio (o custo estimado usa o preço dele). */
  modelo: ModeloDoCliente;
  /** A cotação PTAX do dólar; `null` = indisponível (os custos ficam em US$). */
  cambio: Cambio | null;
  /** A cotação ainda está sendo buscada (a página não espera por ela): os custos estão em US$ por enquanto. */
  cambioBuscando?: boolean;
}) {
  const [selecao, setSelecao] = useState<SelecaoDeUso>({ tipo: "periodo", periodo: PERIODO_PADRAO });
  const [dialogo, setDialogo] = useState(false);
  const { dados: uso, erro, tentarDeNovo } = useCarga<UsoDoCliente>(fonte.uso);
  const hoje = diaIsoSP(agora);

  const descricao = descricaoDaSelecao(selecao);

  const doChip =
    selecao.tipo === "periodo" && uso
      ? {
          uso: uso.periodos[selecao.periodo],
          picos: uso.picos[selecao.periodo],
          janela: janelaDoChip(selecao.periodo, hoje),
        }
      : null;

  const comum = { empresa, agora, modelo, cambio, cambioBuscando, primeira: uso?.primeiraAtividade ?? null };

  return (
    <div data-slot="central-aba-uso" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p data-slot="central-uso-legenda" className="text-legenda text-ink-3">
          O consumo de IA do agente, {doChip?.uso.legenda ?? descricao.legenda}.
        </p>
        <div className="flex items-center gap-2">
          <SeletorDePeriodo
            valor={selecao.tipo === "periodo" ? selecao.periodo : null}
            aoMudar={(periodo) => setSelecao({ tipo: "periodo", periodo })}
          />
          <SeletorDeMeses
            selecao={selecao}
            meses={uso ? mesesDoSeletor(uso.primeiraAtividade, agora) : null}
            aoEscolher={setSelecao}
            aoPedirIntervalo={() => setDialogo(true)}
          />
        </div>
      </div>

      {selecao.tipo === "periodo" ? (
        erro ? (
          <FalhaAoLer texto="Não deu para ler o uso de IA agora." aoTentar={tentarDeNovo} />
        ) : !doChip ? (
          <Carregando />
        ) : (
          <ConteudoDoUso {...comum} {...doChip} />
        )
      ) : (
        <HistoricoDeUso
          key={descricao.chave}
          fonte={fonte}
          selecao={selecao}
          {...comum}
        />
      )}

      <DialogoDeIntervalo
        aberto={dialogo}
        hoje={hoje}
        primeira={uso?.primeiraAtividade ?? null}
        aoFechar={() => setDialogo(false)}
        aoAplicar={(de, ate) => {
          setSelecao({ tipo: "intervalo", de, ate });
          setDialogo(false);
        }}
      />
    </div>
  );
}

export default memo(AbaUsoDeIa);

function Carregando() {
  return (
    <Card variant="secao" data-bloco="central-uso">
      <p data-slot="central-uso-carregando" className="text-legenda text-ink-3">
        Carregando o uso…
      </p>
    </Card>
  );
}

interface PropsDoConteudo {
  empresa: EmpresaItem;
  agora: number;
  modelo: ModeloDoCliente;
  cambio: Cambio | null;
  cambioBuscando: boolean;
  primeira: string | null;
}

/** Um mês, "Todo o período" ou um intervalo: busca uma vez (a fonte lembra) e desenha como qualquer período. */
function HistoricoDeUso({
  fonte,
  selecao,
  ...comum
}: PropsDoConteudo & {
  fonte: FonteDoCliente;
  selecao: SelecaoHistorica;
}) {
  const buscar = useCallback((): Promise<UsoHistorico> => fonte.usoHistorico(selecao), [fonte, selecao]);
  const { dados, erro, tentarDeNovo } = useCarga<UsoHistorico>(buscar);
  if (erro) return <FalhaAoLer texto="Não deu para ler o uso de IA agora." aoTentar={tentarDeNovo} />;
  if (!dados) return <Carregando />;
  return <ConteudoDoUso {...comum} uso={dados.uso} picos={dados.picos} janela={dados.janela} />;
}

/** Os quatro números, o cartão do limite com o gráfico e os tokens por tipo, e os horários de pico, para qualquer seleção. */
function ConteudoDoUso({
  uso,
  picos,
  janela,
  empresa,
  agora,
  modelo,
  cambio,
  cambioBuscando,
  primeira,
}: PropsDoConteudo & { uso: UsoDoPeriodo; picos: DadosDePicos; janela: JanelaDePicos }) {
  return (
    <>
      <Indicadores uso={uso} cambio={cambio} />

      <Card variant="secao" data-bloco="central-uso">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-rotulo uppercase text-ink-3">Consumo e limite do mês</h2>
          <span data-slot="central-limite-estado" className="text-apoio font-semibold text-ink-2">
            {ROTULO_ESTADO_DA_IA[empresa.estado]}
          </span>
          <span data-slot="central-percentual" className="text-apoio tabular-nums text-ink-3">
            {Math.floor(empresa.percentual)}% do limite
          </span>
          <RotuloDoUso
            e={empresa}
            custo={custoCurto(empresa.custoUsd, cambio)}
            className="ml-auto text-right"
          />
        </div>
        <RitmoDoLimite e={empresa} agora={agora} className="mt-3" />
        <p data-slot="central-modelo" className="mt-3 text-legenda text-ink-3">
          Modelo de IA: {textoDoModelo(modelo)}. O custo estimado usa o preço dele. {notaDoCambio(cambio, cambioBuscando)}
        </p>

        <div className="mt-4 grid gap-6 border-t border-line-soft pt-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <GraficoDeUso uso={uso} limite={empresa.limite} cambio={cambio} />
          <DonutDeTokens uso={uso} />
        </div>
      </Card>

      <PicosDeUso dados={picos} janela={janela} primeira={primeira} hoje={diaIsoSP(agora)} />
    </>
  );
}

/** O seletor ao lado dos chips: "Este mês", os meses passados (até a primeira atividade), "Todo o período" e um intervalo. */
function SeletorDeMeses({
  selecao,
  meses,
  aoEscolher,
  aoPedirIntervalo,
}: {
  selecao: SelecaoDeUso;
  /** `null` = ainda lendo o uso (o primeiro turno do cliente limita a lista). */
  meses: string[] | null;
  aoEscolher: (s: SelecaoDeUso) => void;
  aoPedirIntervalo: () => void;
}) {
  const ativo = selecao.tipo !== "periodo";
  const rotuloAtivo = descricaoDaSelecao(selecao).rotulo;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="alternavel"
          size="control"
          aria-label="Meses anteriores, todo o período e período personalizado"
          aria-pressed={ativo}
          data-slot="central-uso-historico"
          disabled={meses === null}
        >
          <CalendarDays size={14} />
          {rotuloAtivo}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-64" data-menu="central-uso-historico">
        <DropdownMenuLabel>Meses</DropdownMenuLabel>
        {(meses ?? []).map((mes, i) => (
          <DropdownMenuItemMarcado
            key={mes}
            data-mes={mes}
            marcado={selecao.tipo === "mes" && selecao.mes === mes}
            onSelect={() => aoEscolher({ tipo: "mes", mes })}
          >
            {i === 0 ? "Este mês" : i === 1 ? "Mês passado" : nomeDoMes(mes)}
            {i <= 1 && <span className="text-ink-3">{`, ${nomeDoMes(mes)}`}</span>}
          </DropdownMenuItemMarcado>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItemMarcado
          data-mes="tudo"
          marcado={selecao.tipo === "tudo"}
          onSelect={() => aoEscolher({ tipo: "tudo" })}
        >
          Todo o período
        </DropdownMenuItemMarcado>
        <DropdownMenuItemMarcado
          data-mes="intervalo"
          marcado={selecao.tipo === "intervalo"}
          // O diálogo abre depois que o menu fecha (dois overlays do Radix ao mesmo tempo se travam).
          onSelect={() => window.setTimeout(aoPedirIntervalo, 50)}
        >
          Período personalizado…
        </DropdownMenuItemMarcado>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A caixa do intervalo de datas (a semana do Natal, dezembro inteiro): duas datas, validadas por `janelaDoIntervalo`. */
function DialogoDeIntervalo({
  aberto,
  hoje,
  primeira,
  aoFechar,
  aoAplicar,
}: {
  aberto: boolean;
  hoje: string;
  /** O dia do primeiro turno do cliente: antes dele não há uso, então o campo não deixa escolher. */
  primeira: string | null;
  aoFechar: () => void;
  aoAplicar: (de: string, ate: string) => void;
}) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function aplicar() {
    const janela = janelaDoIntervalo(de, ate, hoje);
    if (!janela) {
      setErro("Escolha duas datas válidas: a inicial não pode ser depois da final, nem depois de hoje.");
      return;
    }
    aoAplicar(janela.de, janela.ate);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-md" data-slot="central-uso-intervalo">
        <DialogTitle>Período personalizado</DialogTitle>
        <DialogDescription className="mt-2 mb-4">
          Escolha as datas, inclusive nas duas pontas (fuso de São Paulo). Serve para ver uma semana específica,
          como a do Natal, ou um mês inteiro.
        </DialogDescription>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            aplicar();
          }}
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-legenda font-semibold text-ink-2">De</span>
              <Input
                type="date"
                data-campo="intervalo-de"
                value={de}
                min={primeira ?? undefined}
                max={hoje}
                onChange={(e) => {
                  setDe(e.target.value);
                  setErro(null);
                }}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-legenda font-semibold text-ink-2">Até</span>
              <Input
                type="date"
                data-campo="intervalo-ate"
                value={ate}
                min={primeira ?? undefined}
                max={hoje}
                onChange={(e) => {
                  setAte(e.target.value);
                  setErro(null);
                }}
              />
            </label>
          </div>
          {erro && (
            <p data-slot="central-uso-intervalo-erro" className="text-apoio text-danger-ink" role="alert">
              {erro}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" size="field" className="px-4">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" size="field" className="px-4" data-slot="central-uso-intervalo-aplicar">
              Aplicar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ROTULO_DA_MAIOR: Record<UnidadeDeUso, string> = {
  hora: "Hora de maior uso",
  dia: "Dia de maior uso",
  mes: "Mês de maior uso",
};

/** As colunas do período como pontos de um mini gráfico (a mesma série do gráfico grande). */
function tendencia(uso: UsoDoPeriodo, valor: (b: UsoDoPeriodo["barras"][number]) => number): PontoDeTendencia[] {
  return uso.barras.map((b) => ({ chave: b.chave, rotulo: b.rotulo, valor: valor(b) }));
}

function Indicadores({ uso, cambio }: { uso: UsoDoPeriodo; cambio: Cambio | null }) {
  const { total, maior, unidade, legenda, anterior, rotuloAnterior } = uso;
  const custo = custoCurto(total.custoUsd, cambio);
  // A comparação de cada número é o `Delta` de lib/delta.ts (a direção boa de cada um mora lá): gastar mais não é
  // boa notícia, o volume de turnos não tem lado bom. Tokens e custo saem sempre em porcentagem (`piso: 0`).
  const contra = anterior ? rotuloAnterior : null;
  const comparar = (delta: ReturnType<typeof calcularDelta> | null) => (contra ? { delta, contra } : null);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <IndicadorComparado
        data-bloco="uso-tokens"
        data-usados={total.usados}
        rotulo="Tokens"
        valor={tokensCurto(total.usados)}
        frase={`${numeroBR(total.usados)} de entrada e saída, o que conta para o limite`}
        legenda={legenda}
        comparacao={comparar(
          anterior &&
            calcularDelta({
              atual: total.usados,
              anterior: anterior.usados,
              direcao: "menor-melhor",
              semBase: "sem uso antes",
              piso: 0,
            })
        )}
        serie={{ pontos: tendencia(uso, (b) => b.usados), nome: "Tokens", formatar: numeroBR }}
      />
      <IndicadorComparado
        data-bloco="uso-turnos"
        data-turnos={total.turnos}
        rotulo="Turnos do agente"
        valor={numeroBR(total.turnos)}
        frase={`${plural(total.turnos, "vez em que a IA chamou", "vezes em que a IA chamou")} o modelo`}
        legenda={legenda}
        comparacao={comparar(
          anterior &&
            calcularDelta({
              atual: total.turnos,
              anterior: anterior.turnos,
              direcao: "neutra",
              semBase: "sem uso antes",
            })
        )}
        serie={{ pontos: tendencia(uso, (b) => b.turnos), nome: "Turnos", formatar: numeroBR }}
      />
      <IndicadorComparado
        data-bloco="uso-custo"
        rotulo="Custo estimado"
        valor={custo ?? "Sem preço"}
        frase={custo ? "pela tabela de preços do modelo" : "o modelo não está na tabela de preços"}
        legenda={legenda}
        comparacao={comparar(
          anterior && total.custoUsd != null && anterior.custoUsd != null
            ? calcularDelta({
                atual: total.custoUsd,
                anterior: anterior.custoUsd,
                direcao: "menor-melhor",
                semBase: "sem custo antes",
                piso: 0,
              })
            : null
        )}
        serie={
          total.custoUsd != null
            ? {
                pontos: tendencia(uso, (b) => (b.custoUsd == null ? 0 : custoNaMoeda(b.custoUsd, cambio))),
                nome: "Custo",
                formatar: (v) => custoDoPonto(v, cambio),
              }
            : null
        }
      />
      <Indicador
        data-bloco="uso-maior"
        rotulo={ROTULO_DA_MAIOR[unidade]}
        valor={maior ? tokensCurto(maior.usados) : "Sem uso"}
        frase={maior ? `tokens em ${maior.rotulo}` : "nenhum turno no período"}
        legenda={legenda}
      />
    </div>
  );
}

const CONFIG: ChartConfig = {
  abaixo: { label: "Tokens", color: "var(--chart-1)" },
  acima: { label: "Acima do ritmo", color: "var(--chart-acima)" },
};

const TITULO_DO_GRAFICO: Record<UnidadeDeUso, string> = {
  hora: "Tokens por hora",
  dia: "Tokens por dia",
  mes: "Tokens por mês",
};

const COLUNA_DO_GRAFICO: Record<UnidadeDeUso, string> = {
  hora: "Cada coluna é uma hora",
  dia: "Cada coluna é um dia",
  mes: "Cada coluna é um mês",
};

const ROTULO_DA_COLUNA: Record<UnidadeDeUso, string> = { hora: "Hora", dia: "Dia", mes: "Mês" };

// UM gráfico: colunas de tokens por hora ("Dia", de 00h de hoje até agora), por dia (os outros chips, um mês
// e um intervalo curto) ou por mês ("Todo o período" e intervalos longos) e, na mesma escala, a linha
// tracejada do RITMO DO LIMITE. A coluna que passa da linha ganha o tom de estado (âmbar) e o balão e a
// legenda dizem "acima do ritmo" (identidade nunca só pela cor). Por que colunas e linha de referência, e não
// o acumulado do mês contra o teto: o período é uma janela móvel que nem sempre começa no dia 1, então um
// acumulado na janela não seria o do contador do limite, e o acumulado do mês numa segunda escala seria um eixo
// duplo. O que o dono precisa ler é "este dia foi mais pesado ou mais leve do que o limite aguenta", e isso é
// coluna contra uma linha. O consumo acumulado contra o teto é a barra de cima (o contador do mês, o que decide
// a parada). Por mês, o "ritmo" é o próprio limite do mês.
function GraficoDeUso({ uso, limite, cambio }: { uso: UsoDoPeriodo; limite: number; cambio: Cambio | null }) {
  const animar = useAnimacaoDoGrafico();
  const { unidade } = uso;
  const sem = uso.total.usados === 0;
  // O ritmo é de CADA coluna (os dias do mês dela): um período que atravessa dois meses tem um trecho da linha por mês.
  const dados = useMemo(() => barrasComRitmo(uso.barras, limite, unidade), [uso.barras, limite, unidade]);
  const trechos = useMemo(() => trechosDoRitmo(dados), [dados]);
  const ritmo = dados.length > 0 ? dados[dados.length - 1].ritmo : limite;
  const algumaPassou = dados.some((b) => b.passou);
  const marcas = marcasDoEixo(Math.max(...dados.map((b) => Math.max(b.usados, b.ritmo)), 1));
  const porMes = unidade === "mes";
  const unidadeDoRitmo = unidade === "hora" ? "hora" : unidade === "dia" ? "dia" : "mês";

  return (
    <div data-slot="central-grafico" data-unidade={unidade} className="min-w-0">
      <h3 className="text-apoio font-semibold text-ink">{TITULO_DO_GRAFICO[unidade]}</h3>
      <p className="mt-0.5 text-legenda text-ink-3">
        {COLUNA_DO_GRAFICO[unidade]} (fuso de São Paulo), {uso.legenda}.
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
            aria-label={`${TITULO_DO_GRAFICO[unidade]}, ${uso.legenda}`}
          >
            <BarChart data={dados} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
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
                width={58}
                ticks={marcas}
                domain={[0, marcas[marcas.length - 1]]}
                tickFormatter={(v: number) => tokensCurto(v)}
              />
              <ChartTooltip
                cursor={{ fill: "var(--chart-cursor)", fillOpacity: 0.4 }}
                content={
                  <ChartTooltipContent<BarraComRitmo>
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
                          {custoCurto(b.custoUsd, cambio) ?? "sem preço do modelo"}
                        </ChartTooltipLinha>
                        <ChartTooltipLinha rotulo={porMes ? "Limite do mês" : "Ritmo do limite"} data-linha="ritmo">
                          {tokensCurto(b.ritmo)}
                        </ChartTooltipLinha>
                        {b.passou && (
                          <ChartTooltipLinha rotulo="Acima do ritmo" data-linha="acima">
                            {`+${numeroBR(b.excessoPct)}%`}
                          </ChartTooltipLinha>
                        )}
                      </>
                    )}
                  />
                }
              />
              {trechos.length === 1 ? (
                <ReferenceLine y={trechos[0].ritmo} stroke="var(--chart-guia)" strokeWidth={1.5} strokeDasharray="5 4" />
              ) : (
                trechos.map((t) => (
                  <ReferenceLine
                    key={t.de}
                    segment={[
                      { x: t.de, y: t.ritmo },
                      { x: t.ate, y: t.ritmo },
                    ]}
                    stroke="var(--chart-guia)"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                  />
                ))
              )}
              <Bar
                dataKey="abaixo"
                stackId="uso"
                fill="var(--color-abaixo)"
                radius={[4, 4, 0, 0]}
                maxBarSize={porMes ? 40 : 24}
                isAnimationActive={animar}
              />
              <Bar
                dataKey="acima"
                stackId="uso"
                fill="var(--color-acima)"
                radius={[4, 4, 0, 0]}
                maxBarSize={porMes ? 40 : 24}
                isAnimationActive={animar}
              />
            </BarChart>
          </ChartContainer>

          <ChartLegenda
            className="mt-2"
            itens={[
              { chave: "usados", rotulo: TITULO_DO_GRAFICO[unidade], tipo: "barra", cor: "var(--chart-1)" },
              ...(algumaPassou
                ? [{ chave: "acima", rotulo: "Acima do ritmo", tipo: "barra" as const, cor: "var(--chart-acima)" }]
                : []),
              {
                chave: "ritmo",
                rotulo: porMes
                  ? `Limite do mês: ${tokensCurto(ritmo)}`
                  : `Ritmo do limite: ${tokensCurto(ritmo)} por ${unidadeDoRitmo}`,
                tipo: "tracejada",
                cor: "var(--chart-guia)",
              },
            ]}
          />
          <p className="mt-2 text-legenda text-ink-3">
            {porMes ? (
              <>
                A linha é o limite de {tokensCurto(limite)} tokens do mês, o de hoje e não o que valia na época: uma
                coluna acima dela é um mês que passou do limite de hoje.
              </>
            ) : (
              <>
                O ritmo é o limite de {tokensCurto(limite)} tokens do mês dividido pelos dias do mês de cada coluna
                {unidade === "hora" ? " e por 24" : ""}: uma coluna acima da linha é um{" "}
                {unidade === "hora" ? "horário" : "dia"} mais pesado do que o limite aguenta.
              </>
            )}{" "}
            O limite conta pelo contador do mês; as colunas somam os turnos registrados.
            {uso.periodo === null && !porMes && " A linha usa o limite de hoje, não o que valia na época."}
          </p>

          <ChartTabela
            nome="central-uso"
            legenda={TITULO_DO_GRAFICO[unidade]}
            colunas={[ROTULO_DA_COLUNA[unidade], "Tokens", "Turnos", "Custo estimado", "Acima do ritmo"]}
            linhas={dados.map((b) => ({
              chave: b.chave,
              atributos: {
                "data-chave": b.chave,
                "data-usados": b.usados,
                "data-turnos": b.turnos,
                "data-acima": b.passou ? "sim" : "nao",
              },
              celulas: [
                b.rotulo,
                numeroBR(b.usados),
                numeroBR(b.turnos),
                custoCurto(b.custoUsd, cambio) ?? "sem preço do modelo",
                b.passou ? "Sim" : "Não",
              ],
            }))}
          />
        </>
      )}
    </div>
  );
}

/** As partes de um todo, com o valor de cada uma na legenda: de onde vêm os tokens do período. */
function DonutDeTokens({ uso }: { uso: UsoDoPeriodo }) {
  const animar = useAnimacaoDoGrafico();
  const { entrada, cache, saida } = uso.total.tokens;
  const partes = useMemo(
    () =>
      [
        { chave: "entrada", rotulo: "Entrada nova", n: Math.max(0, entrada - cache), fill: "var(--chart-rampa-4)" },
        { chave: "cache", rotulo: "Entrada em cache", n: Math.max(0, Math.min(cache, entrada)), fill: "var(--chart-rampa-2)" },
        { chave: "saida", rotulo: "Saída", n: Math.max(0, saida), fill: "var(--chart-2)" },
      ].filter((p) => p.n > 0),
    [entrada, cache, saida]
  );
  const total = partes.reduce((s, p) => s + p.n, 0);
  const config = useMemo<ChartConfig>(
    () => Object.fromEntries(partes.map((p) => [p.chave, { label: p.rotulo, color: p.fill }])),
    [partes]
  );

  return (
    <div data-bloco="uso-tokens-por-tipo" className="min-w-0 border-t border-line-soft pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
      <h3 className="text-apoio font-semibold text-ink">De onde vêm os tokens</h3>
      <p className="mt-0.5 text-legenda text-ink-3">Entrada, entrada em cache e saída, {uso.legenda}.</p>
      {total === 0 ? (
        <EstadoVazio tamanho="compacto" texto="Nenhum token neste período." />
      ) : (
        <>
          <div className="relative mx-auto mt-3 w-full max-w-44">
            <ChartContainer config={config} className="h-40" role="img" aria-label="De onde vêm os tokens">
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent<(typeof partes)[number]>
                      semSeries
                      titulo={(p) => p.rotulo}
                      rodape={(p) => (
                        <>
                          <ChartTooltipLinha rotulo="Tokens" data-linha="tokens">
                            {numeroBR(p.n)}
                          </ChartTooltipLinha>
                          <ChartTooltipLinha rotulo="Do total" data-linha="fracao">
                            {pct(p.n, total)}%
                          </ChartTooltipLinha>
                        </>
                      )}
                    />
                  }
                />
                <Pie
                  data={partes}
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
                <p
                  data-slot="uso-donut-centro"
                  className="whitespace-nowrap font-display leading-none tracking-tight tabular-nums text-ink"
                  style={{ fontSize: tamanhoDoCentroDoDonut(tokensCurto(total)) }}
                >
                  {tokensCurto(total)}
                </p>
                <p className="text-legenda text-ink-3">tokens</p>
              </div>
            </div>
          </div>
          <ChartLegenda
            className="mt-3 flex-col items-start gap-y-1.5"
            itens={partes.map((p) => ({
              chave: p.chave,
              rotulo: p.rotulo,
              cor: p.fill,
              valor: `${tokensCurto(p.n)} (${pct(p.n, total)}%)`,
            }))}
          />
          <ChartTabela
            nome="uso-tokens-por-tipo"
            legenda="De onde vêm os tokens"
            linhas={partes.map((p) => ({
              chave: p.chave,
              atributos: { "data-parte": p.chave, "data-n": p.n },
              celulas: [p.rotulo, numeroBR(p.n)],
            }))}
          />
        </>
      )}
    </div>
  );
}

const turnosTexto = (n: number) => `${numeroBR(n)} ${plural(n, "turno", "turnos")}`;

const CONFIG_DOS_PICOS: ChartConfig = {
  demais: { label: "Demais", color: "var(--chart-barra-neutra)" },
  destaque: { label: "Pico", color: "var(--chart-1)" },
};

// HORÁRIOS DE PICO (variação A, escolha do dono em 16/10/2026): três números em cima (o horário de pico,
// a faixa de 3 horas mais cheia, a MESMA coluna destacada no gráfico "Por horário do dia"; o dia de pico,
// a data mais cheia, e a média por dia) e dois gráficos de colunas lado a lado, "Por dia" e "Por horário do dia"
// (faixas de 3 horas), com a coluna do pico na cor da marca e as outras em cinza. Segue o MESMO filtro de
// período da aba (chips, mês, todo o período, intervalo): a regra mora em `lib/picos.ts` (puro, vai para o
// painel dos tenants) e o agregado em `admin_cliente_picos`. "Por dia" tem uma coluna por DATA até 15 dias e
// soma por dia da semana acima disso.
function PicosDeUso({
  dados,
  janela,
  primeira,
  hoje,
}: {
  dados: DadosDePicos;
  janela: JanelaDePicos;
  primeira: string | null;
  hoje: string;
}) {
  const r = useMemo(() => resumoDePicos(dados, janela, { hoje, primeira }), [dados, janela, hoje, primeira]);
  const vazio = r.total === 0;
  return (
    <Card variant="secao" data-bloco="central-picos">
      <h2 className="text-rotulo uppercase text-ink-3">Horários de pico</h2>
      <p className="mt-1 text-legenda text-ink-3">
        Quando o agente trabalha mais, em turnos (fuso de São Paulo), no mesmo período escolhido acima.
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Indicador
          variant="elevado"
          tamanhoDoValor="compacto"
          classeDoValor="text-balance"
          data-bloco="picos-tile-horario"
          rotulo="Horário de pico"
          valor={<span data-slot="picos-horario-valor">{r.horarioDePico ? r.horarioDePico.texto : "Sem uso"}</span>}
          frase={r.horarioDePico ? turnosTexto(r.horarioDePico.n) : "nenhum turno no período"}
          legenda="A faixa de 3 horas mais cheia, somando todos os dias do período"
        />
        <Indicador
          variant="elevado"
          tamanhoDoValor="compacto"
          classeDoValor="text-balance"
          data-bloco="picos-tile-dia"
          rotulo="Dia de pico"
          valor={<span data-slot="picos-dia-valor">{r.diaDePico ? r.diaDePico.texto : "Sem uso"}</span>}
          frase={r.diaDePico ? turnosTexto(r.diaDePico.n) : "nenhum turno no período"}
          legenda="A data mais cheia do período"
        />
        <Indicador
          variant="elevado"
          tamanhoDoValor="compacto"
          classeDoValor="text-balance"
          data-bloco="picos-tile-media"
          rotulo="Média por dia"
          valor={
            <span data-slot="picos-media-valor">
              {r.media == null ? "Sem dias" : numeroBR(Math.round(r.media * 10) / 10)}
            </span>
          }
          frase={
            r.media == null
              ? "o período não tem dias com uso possível"
              : `${plural(Math.round(r.media), "turno", "turnos")} por dia, em ${r.dias} ${plural(r.dias, "dia", "dias")}`
          }
          legenda="Total do período dividido pelos dias que ele cobre"
        />
      </div>

      {vazio ? (
        <EstadoVazio tamanho="compacto" data-slot="central-picos-vazio" texto="Nenhum uso de IA neste período." />
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <GraficoDePicos
            nome="picos-dia"
            titulo="Por dia"
            descricao={
              r.porDia.modo === "data"
                ? "Cada coluna é uma data do período."
                : `Mais de 15 dias: cada coluna soma os turnos de um dia da semana (o mais cheio é ${r.porDia.barras.find((b) => b.pico)?.rotulo ?? "nenhum"}); o dia de pico acima é uma data.`
            }
            coluna={r.porDia.modo === "data" ? "Data" : "Dia da semana"}
            barras={r.porDia.barras}
          />
          <GraficoDePicos
            nome="picos-faixa"
            titulo="Por horário do dia"
            descricao="Cada coluna é uma faixa de 3 horas, somando todos os dias do período."
            coluna="Faixa"
            barras={r.porFaixa}
          />
        </div>
      )}
    </Card>
  );
}

/** Um gráfico de colunas dos picos: a coluna mais alta na marca, as outras no cinza, com balão, legenda e tabela de texto. */
function GraficoDePicos({
  nome,
  titulo,
  descricao,
  coluna,
  barras,
}: {
  nome: string;
  titulo: string;
  descricao: string;
  coluna: string;
  barras: BarraDePico[];
}) {
  const animar = useAnimacaoDoGrafico();
  const marcas = marcasDoEixo(Math.max(...barras.map((b) => b.n), 1));
  return (
    <div data-bloco={nome} className="min-w-0">
      <h3 className="text-apoio font-semibold text-ink">{titulo}</h3>
      <p className="mt-0.5 text-legenda text-ink-3">{descricao}</p>
      <ChartContainer config={CONFIG_DOS_PICOS} className="mt-3 h-52" role="img" aria-label={titulo}>
        <BarChart data={barras} margin={{ top: 12, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--chart-grade)" />
          <XAxis dataKey="eixo" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={10} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            ticks={marcas}
            domain={[0, marcas[marcas.length - 1]]}
            tickFormatter={(v: number) => tokensCurto(v)}
            allowDecimals={false}
          />
          <ChartTooltip
            cursor={{ fill: "var(--chart-cursor)", fillOpacity: 0.4 }}
            content={
              <ChartTooltipContent<BarraDePico>
                semSeries
                titulo={(b) => b.rotulo}
                rodape={(b) => (
                  <>
                    <ChartTooltipLinha rotulo="Turnos" data-linha="turnos">
                      {numeroBR(b.n)}
                    </ChartTooltipLinha>
                    {b.pico && (
                      <ChartTooltipLinha rotulo="Situação" data-linha="pico">
                        Pico
                      </ChartTooltipLinha>
                    )}
                  </>
                )}
              />
            }
          />
          <Bar dataKey="demais" stackId="p" fill="var(--color-demais)" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={animar} />
          <Bar dataKey="destaque" stackId="p" fill="var(--color-destaque)" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={animar} />
        </BarChart>
      </ChartContainer>
      <ChartLegenda
        className="mt-2"
        itens={[
          { chave: "destaque", rotulo: "Pico", tipo: "barra", cor: "var(--chart-1)" },
          { chave: "demais", rotulo: "Demais", tipo: "barra", cor: "var(--chart-barra-neutra)" },
        ]}
      />
      <ChartTabela
        nome={nome}
        legenda={titulo}
        colunas={[coluna, "Turnos", "Pico"]}
        linhas={barras.map((b) => ({
          chave: b.chave,
          atributos: { "data-chave": b.chave, "data-n": b.n, "data-pico": b.pico ? "sim" : "nao" },
          celulas: [b.rotulo, numeroBR(b.n), b.pico ? "Sim" : "Não"],
        }))}
      />
    </div>
  );
}
