"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ORDEM_PERIODOS, PERIODOS, PERIODO_PADRAO, type PeriodoKey } from "@/lib/periodo";
import type { ContagemDeMotivo } from "@/lib/motivos";
import { cn } from "@/lib/utils";

// "Por que a IA te chamou" (06/10/2026, P1 item 4, docs/plano-motivo-pedido.md).
//
// Quantos pedidos de ajuda abriram no período, por motivo, do mais frequente ao
// menos. É o que diz ao cliente o que ensinar à IA dele: muito "Preço ou
// orçamento" pede a tabela de preços na base. Este componente só desenha; quem
// conta é o banco (`painel_motivos`) e quem ordena é `contagemPorMotivo`.
//
// ⚠️ UMA cor só (a da marca) e cinza para "Sem motivo": motivo não é bom nem
// ruim, então nada de verde, âmbar ou vermelho. O seletor de período é do
// BLOCO, como em "A operação" (cada bloco manda no próprio período).

export interface MotivosDoPeriodo {
  total: number;
  itens: ContagemDeMotivo[];
}

export default function PainelMotivos({
  porPeriodo,
  className,
}: {
  porPeriodo: Record<PeriodoKey, MotivosDoPeriodo>;
  /** Posição na grade do celular, que a página decide (`max-md:order-*`). */
  className?: string;
}) {
  const [periodo, setPeriodo] = React.useState<PeriodoKey>(PERIODO_PADRAO);
  const p = PERIODOS[periodo];
  const { total, itens } = porPeriodo[periodo];
  const maior = Math.max(1, ...itens.map((i) => i.n));

  return (
    <section
      data-slot="painel-motivos"
      className={cn("rounded-xl border border-line bg-raised shadow-[var(--panel-shadow)]", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-6 py-[18px]">
        <div className="min-w-0">
          <h2 className="font-display text-cartao text-ink">Por que a IA te chamou</h2>
          <p className="mt-0.5 text-legenda text-ink-3" data-slot="painel-motivos-total">
            {total === 1 ? "1 pedido de ajuda" : `${total} pedidos de ajuda`}, {p.legenda}
          </p>
        </div>
        <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoKey)}>
          <TabsList variant="painel" aria-label="Período">
            {ORDEM_PERIODOS.map((k) => (
              <TabsTrigger key={k} value={k} variant="painel">
                {PERIODOS[k].aba}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {total === 0 ? (
        // Zero é notícia boa, não vazio: o cartão fica, com a frase.
        <p className="flex items-center gap-2 px-6 py-5 text-apoio text-ink-2">
          <CheckCircle2 size={16} className="shrink-0 text-human-ink" />
          Ela não precisou te chamar {p.legenda}.
        </p>
      ) : (
        <ul className="flex flex-col gap-3 px-6 py-5" data-slot="painel-motivos-lista">
          {itens.map((it) => (
            <li key={it.motivo ?? "sem"} data-motivo={it.motivo ?? "sem"} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-2.5">
                <span className={`min-w-0 truncate text-corpo ${it.motivo ? "text-ink" : "text-ink-3"}`}>
                  {it.rotulo}
                </span>
                <span className="shrink-0 font-display text-corpo font-semibold tabular-nums text-ink">
                  {it.n}
                </span>
              </span>
              <span aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-bloco">
                <span
                  className={`block h-full rounded-full ${it.motivo ? "bg-brand" : "bg-line-strong"}`}
                  style={{ width: `${(it.n / maior) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
