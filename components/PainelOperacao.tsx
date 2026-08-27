"use client";

import * as React from "react";
import DashboardCards, { Selo } from "@/components/DashboardCards";
import DashboardBarras from "@/components/DashboardBarras";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Stat,
  StatTopo,
  StatRotulo,
  StatValor,
  StatFrase,
  StatLegenda,
} from "@/components/ui/stat";
import { calcularDelta } from "@/lib/delta";
import type { Barra, DashboardMetrics } from "@/lib/metrics";
import {
  ORDEM_PERIODOS,
  PERIODOS,
  PERIODO_PADRAO,
  type PeriodoKey,
} from "@/lib/periodo";

// A parte do painel que segue o SELETOR DE PERÍODO: os três cartões de "a IA
// está dando conta", o "está crescendo" e o gráfico.
//
// POR QUE OS QUATRO PERÍODOS CHEGAM PRONTOS, em vez de o clique buscar de novo:
// a página já lê o acumulado uma vez para a manchete, e recortar quatro janelas
// em memória custa quase nada. Buscar por clique daria quatro idas ao banco, uma
// tela piscando a cada troca e um `searchParams` que recarrega o Server
// Component inteiro. O payload são quatro punhados de números.
//
// ⚠️ A MANCHETE NÃO ESTÁ AQUI, de propósito. Ela é mês fechado mais acumulado e
// NÃO segue o seletor: a frase mais forte da tela não pode encolher com um
// clique. Quem a renderiza é a página, acima deste bloco.

export interface JanelaCalculada {
  key: PeriodoKey;
  metrics: DashboardMetrics;
  /** Mesmos números do período anterior. `null` = sem base para comparar. */
  anterior: DashboardMetrics | null;
  barras: Barra[];
}

export default function PainelOperacao({
  janelas,
}: {
  /** Uma entrada por período, na ordem de `ORDEM_PERIODOS`. */
  janelas: Record<PeriodoKey, JanelaCalculada>;
}) {
  const [periodo, setPeriodo] = React.useState<PeriodoKey>(PERIODO_PADRAO);
  const p = PERIODOS[periodo];
  const j = janelas[periodo];

  // Volume é NEUTRO e nunca vermelho: mês fraco é o mercado do cliente, não a
  // IA falhando, e pintar isso de vermelho joga o mercado dele na nossa conta.
  const deltaNovas = calcularDelta({
    atual: j.metrics.pessoasNovas,
    anterior: j.anterior?.pessoasNovas ?? null,
    direcao: "neutra",
    semBase: p.semBase,
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-rotulo uppercase text-ink-3">
          A IA está dando conta?
        </h2>
        <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoKey)}>
          <TabsList variant="segmentado" aria-label="Período">
            {ORDEM_PERIODOS.map((k) => (
              <TabsTrigger key={k} value={k} variant="segmentado">
                {PERIODOS[k].aba}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <DashboardCards
        metrics={j.metrics}
        anterior={j.anterior}
        legenda={p.legenda}
        semBase={p.semBase}
      />

      <section className="space-y-3">
        <h2 className="text-rotulo uppercase text-ink-3">Está crescendo?</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Stat variant="elevado">
            <StatTopo>
              <StatRotulo>Pessoas novas</StatRotulo>
              <Selo delta={deltaNovas} />
            </StatTopo>
            <StatValor>{j.metrics.pessoasNovas}</StatValor>
            <StatFrase>Falaram com você pela primeira vez</StatFrase>
            <StatLegenda>{p.legenda}</StatLegenda>
          </Stat>
          <div className="xl:col-span-2">
            <DashboardBarras dados={j.barras} legenda={p.legenda} />
          </div>
        </div>
      </section>
    </>
  );
}
