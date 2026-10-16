"use client";

import { ChartSparkline, type PontoDeTendencia } from "@/components/ui/chart";
import { Selo } from "@/components/painel/pecas";
import type { Delta } from "@/lib/delta";
import { Indicador, type PropsDoIndicador } from "@/components/admin/pecas";

// O INDICADOR COM COMPARAÇÃO das abas de gráfico (Uso de IA e Atendimento): o cartão de `Indicador`, o selo de
// variação contra o período anterior (`Selo` do painel, sobre `lib/delta.ts`), a frase "comparado com ..." na
// legenda e o mini gráfico de tendência. Era escrito cinco vezes, cada uma com a sua cópia do selo.
//
// Vive à parte de `pecas.tsx` de propósito: ele puxa o Recharts (`ChartSparkline`), e `pecas.tsx` é do pacote
// da lista e da Visão geral, que não pagam pelos gráficos.
//
// Quem chama traz o `Delta` PRONTO de `lib/delta.ts` (`calcularDelta`, com a `direcao` do número, ou
// `deltaDuracao` para um tempo): este componente não sabe o que é bom ou ruim, só desenha.

export interface Comparacao {
  /** O selo; `null` quando não há duas medições para comparar (a legenda ainda diz contra o quê). */
  delta: Delta | null;
  /** Contra o que se compara ("os 7 dias anteriores"): vai para a legenda, o título do selo e o leitor de tela. */
  contra: string;
}

export interface SerieDoIndicador {
  pontos: PontoDeTendencia[];
  /** O que a linha mede ("Tokens"), no balão. */
  nome: string;
  formatar: (valor: number) => string;
}

export default function IndicadorComparado({
  legenda,
  comparacao,
  serie,
  ...indicador
}: Omit<PropsDoIndicador, "variacao" | "tendencia" | "legenda"> & {
  /** O período ("últimos 7 dias"); a comparação acrescenta ", comparado com ...". */
  legenda: string;
  comparacao?: Comparacao | null;
  /** O mini gráfico; só aparece com dois pontos ou mais. */
  serie?: SerieDoIndicador | null;
}) {
  return (
    <Indicador
      {...indicador}
      legenda={comparacao ? `${legenda}, comparado com ${comparacao.contra}` : legenda}
      variacao={comparacao?.delta && <Selo delta={comparacao.delta} contra={comparacao.contra} />}
      tendencia={
        serie &&
        serie.pontos.length >= 2 && <ChartSparkline dados={serie.pontos} nome={serie.nome} formatar={serie.formatar} />
      }
    />
  );
}
