"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { MOLDURA_DO_BALAO } from "@/components/ui/balao";
import { cn } from "@/lib/utils";

/**
 * Gráfico (15/10/2026): o `chart` do shadcn (Recharts por baixo, versão
 * fixada em `package.json`) trazido para a camada base e ligado aos TOKENS da
 * casa. É a única porta para um gráfico novo; o painel antigo (SVG e CSS à mão)
 * fica como está.
 *
 * O QUE MUDOU em relação ao shadcn de fábrica:
 * - Cor não tem tema próprio aqui. O `ChartConfig` aponta para tokens
 *   (`var(--chart-1)`, ...), que são aliases dos tokens da casa em
 *   `app/globals.css` e já viram sozinhos com o tema (cookie e `data-theme` no
 *   <html>). Por isso não existe o `<style>` que o shadcn injeta por tema.
 * - A paleta é a da casa: UMA cor categórica (a marca, `--chart-1`) mais o
 *   neutro (`--chart-2`). Verde, âmbar e vermelho são ESTADO, nunca série
 *   (docs/design-system/fundamentos-cor.md).
 * - O balão é nosso (`ChartTooltipContent`): valor em destaque, nome em
 *   segundo plano, chave de LINHA curta (não caixa) e um `titulo` e um
 *   `rodape` que a tela monta com os números dela.
 * - A legenda é nossa (`ChartLegenda`): uma lista HTML ao lado do gráfico, sem
 *   depender do `<Legend>` do Recharts, que mede e posiciona dentro do SVG.
 *
 * REGRAS (dataviz): marca fina (barra de até 24px, canto de 4px na ponta, reta
 * na base), linha de 2px, grade de 1px sólida e recessiva, eixo em `ink-3`
 * (nunca na cor da série), legenda sempre que há duas séries ou mais, e todo
 * gráfico com balão ao passar o mouse e ao focar pelo teclado.
 */

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    /** Um token (`var(--chart-1)`), nunca um hexadecimal solto. */
    color?: string;
  }
>;

type ChartContextProps = { config: ChartConfig };

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart precisa estar dentro de <ChartContainer />");
  return context;
}

/**
 * `true` quando a animação do gráfico pode rodar. Quem pediu menos movimento no
 * sistema recebe o desenho final no primeiro quadro (mesma regra do painel).
 */
const PEDE_MENOS_MOVIMENTO = "(prefers-reduced-motion: reduce)";

function assinarMovimento(aviso: () => void) {
  const m = window.matchMedia(PEDE_MENOS_MOVIMENTO);
  m.addEventListener("change", aviso);
  return () => m.removeEventListener("change", aviso);
}

function useAnimacaoDoGrafico(): boolean {
  return React.useSyncExternalStore(
    assinarMovimento,
    () => !window.matchMedia(PEDE_MENOS_MOVIMENTO).matches,
    () => false,
  );
}

function ChartContainer({
  config,
  className,
  style,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  // Uma variável `--color-<chave>` por série: o desenho pede `var(--color-ia)`.
  const contexto = React.useMemo(() => ({ config }), [config]);
  const cores = Object.fromEntries(
    Object.entries(config)
      .filter(([, v]) => v.color)
      .map(([k, v]) => [`--color-${k}`, v.color]),
  ) as React.CSSProperties;

  return (
    <ChartContext.Provider value={contexto}>
      <div
        {...props}
        style={{ ...cores, ...style }}
        data-slot="chart"
        className={cn(
          "flex h-60 w-full justify-center text-legenda",
          "[&_.recharts-cartesian-axis-tick-value]:fill-[var(--chart-eixo)]",
          "[&_.recharts-sector]:outline-hidden",
          "[&_.recharts-surface]:outline-hidden [&_.recharts-wrapper]:outline-hidden",
          className,
        )}
      >
        <RechartsPrimitive.ResponsiveContainer minWidth={0}>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

/**
 * O `Tooltip` do Recharts sem a animação de posição (400ms de arrasto atrás do
 * mouse): o balão já nasce junto da coluna, como o do painel.
 */
function ChartTooltip(props: React.ComponentProps<typeof RechartsPrimitive.Tooltip>) {
  return <RechartsPrimitive.Tooltip isAnimationActive={false} {...props} />;
}

type ItemDoBalao = {
  dataKey?: string | number;
  name?: string | number;
  value?: unknown;
  color?: string;
  payload?: unknown;
};

/**
 * O conteúdo do balão. Recebe `active`, `payload` e `label` do Recharts (o
 * Tooltip clona este elemento com eles). O texto vem de quem desenha:
 * - `titulo(ponto)`: a linha de cima ("quarta, 14/10");
 * - `formatarValor(valor, chave)`: o número de cada série;
 * - `rodape(ponto)`: linhas extras do mesmo ponto (turnos, custo).
 * O valor vai em destaque e o nome da série em tinta secundária (o valor é o
 * que a pessoa veio ler). Nomes e rótulos entram como TEXTO do React, nunca
 * como HTML.
 */
function ChartTooltipContent<P = Record<string, unknown>>({
  active,
  payload,
  titulo,
  formatarValor,
  rodape,
  semSeries = false,
  className,
}: {
  active?: boolean;
  payload?: readonly ItemDoBalao[];
  titulo?: (ponto: P) => React.ReactNode;
  formatarValor?: (valor: number, chave: string) => React.ReactNode;
  rodape?: (ponto: P) => React.ReactNode;
  /** Sem a lista de séries: o `rodape` conta tudo (gráfico de uma série só). */
  semSeries?: boolean;
  className?: string;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;
  const ponto = payload[0].payload as P;

  return (
    <div data-slot="chart-tooltip" className={cn(MOLDURA_DO_BALAO, className)}>
      {titulo && <p className="font-semibold text-ink">{titulo(ponto)}</p>}
      {!semSeries &&
        payload.map((item, i) => {
          const chave = String(item.dataKey ?? item.name ?? i);
          const rotulo = config[chave]?.label ?? item.name;
          const cor = item.color ?? config[chave]?.color;
          const valor = typeof item.value === "number" ? item.value : Number(item.value);
          return (
            <p key={chave} data-serie={chave} className="flex items-center gap-2">
              <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: cor }} />
              <span className="text-ink-2">{rotulo}</span>
              <span className="ml-auto pl-3 font-semibold tabular-nums text-ink">
                {formatarValor ? formatarValor(valor, chave) : valor}
              </span>
            </p>
          );
        })}
      {rodape?.(ponto)}
    </div>
  );
}

/** Uma linha extra do balão: nome em tinta secundária, valor em destaque. */
function ChartTooltipLinha({
  rotulo,
  children,
  ...props
}: Omit<React.ComponentProps<"p">, "children"> & { rotulo: React.ReactNode; children: React.ReactNode }) {
  return (
    <p {...props} className="flex items-center justify-between gap-3">
      <span className="text-ink-2">{rotulo}</span>
      <span className="font-semibold tabular-nums text-ink">{children}</span>
    </p>
  );
}

/**
 * A visão em texto de um gráfico: uma tabela só para leitor de tela (`sr-only` numa `div`,
 * porque uma `table` ignora `overflow` e alargava a página), com os MESMOS números do gráfico.
 * `nome` marca a tabela (`data-tabela`) e `atributos` de cada linha (`data-*`) são o gancho dos testes.
 */
function ChartTabela({
  nome,
  legenda,
  colunas,
  linhas,
}: {
  nome: string;
  legenda: string;
  colunas?: string[];
  linhas: { chave: string; atributos?: Record<`data-${string}`, string | number>; celulas: React.ReactNode[] }[];
}) {
  return (
    <div className="sr-only">
      <table data-slot="chart-tabela" data-tabela={nome}>
        <caption>{legenda}</caption>
        {colunas && (
          <thead>
            <tr>
              {colunas.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} {...l.atributos}>
              {l.celulas.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ItemDaLegenda = {
  chave: string;
  rotulo: React.ReactNode;
  /** `barra` (padrão) e `ponto` são caixas; `linha` e `tracejada` são traços. */
  tipo?: "barra" | "ponto" | "linha" | "tracejada";
  /** Um token (`var(--chart-1)`): a legenda mora FORA do container, então não herda as `--color-<chave>`. */
  cor: string;
  /** Um número ou frase que acompanha o item ("42%"). */
  valor?: React.ReactNode;
};

/**
 * A legenda: sempre presente com duas séries ou mais. Identidade nunca é só a
 * cor: o rótulo e, quando há, o valor vão ao lado. A chave imita a marca (caixa
 * para barra e fatia, traço para linha, traço tracejado para referência).
 */
function ChartLegenda({
  itens,
  className,
  ...props
}: Omit<React.ComponentProps<"ul">, "children"> & { itens: ItemDaLegenda[] }) {
  return (
    <ul {...props} data-slot="chart-legenda" className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {itens.map((it) => {
        const cor = it.cor;
        const tipo = it.tipo ?? "barra";
        return (
          <li key={it.chave} data-serie={it.chave} className="flex items-center gap-1.5 text-legenda text-ink-2">
            {tipo === "tracejada" ? (
              <span
                aria-hidden
                className="h-0 w-4 shrink-0 border-t-2 border-dashed"
                style={{ borderColor: cor }}
              />
            ) : tipo === "linha" ? (
              <span aria-hidden className="h-0.5 w-4 shrink-0 rounded-full" style={{ background: cor }} />
            ) : (
              <span
                aria-hidden
                className={cn("h-2.5 w-2.5 shrink-0", tipo === "ponto" ? "rounded-full" : "rounded-[3px]")}
                style={{ background: cor }}
              />
            )}
            <span>{it.rotulo}</span>
            {it.valor != null && <span className="font-semibold tabular-nums text-ink">{it.valor}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartTooltipLinha,
  ChartLegenda,
  ChartTabela,
  useAnimacaoDoGrafico,
};
