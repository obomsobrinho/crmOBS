"use client";

import { Card } from "@/components/ui/card";
import { ChartSparkline, type PontoDeTendencia } from "@/components/ui/chart";
import { StatRotulo, StatValor } from "@/components/ui/stat";
import { cn } from "@/lib/utils";

// A FAIXA DE NÚMEROS do topo de Leads e Campanhas (29/10/2026, dono: "da para
// diminuir e deixar eles mais bonitos"; referência Dribbble "CRM Dashboard for
// Sales Performance"): um cartão só, cortado em células iguais por uma linha
// fina, cada célula com o rótulo, o número, um complemento ao lado ("19%"), uma
// frase curta e, quando há série, o mini gráfico à direita. Nenhuma célula fica
// com sobra vazia embaixo: a altura é a do conteúdo, igual em todas.

export interface CelulaDaFaixa {
  chave: string;
  rotulo: string;
  valor: string;
  /** Ao lado do número, menor ("19%"). */
  complemento?: string;
  frase: string;
  /** O selo de variação (`Selo` do painel), no canto. */
  selo?: React.ReactNode;
  serie?: { pontos: PontoDeTendencia[]; nome: string; formatar: (v: number) => string } | null;
  /** Cor de estado no número (o âmbar de "pediram para parar"). */
  classeDoValor?: string;
}

export function FaixaDeNumeros({ celulas, className }: { celulas: CelulaDaFaixa[]; className?: string }) {
  return (
    <Card
      variant="conteudo"
      data-slot="faixa-numeros"
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden border border-line bg-line",
        celulas.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
        className,
      )}
    >
      {celulas.map((c) => (
        <div key={c.chave} data-indicador={c.chave} className="flex min-w-0 flex-col gap-2 bg-raised px-5 py-4">
          <div className="flex min-h-5 items-center justify-between gap-2">
            <StatRotulo className="truncate">{c.rotulo}</StatRotulo>
            {c.selo}
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <StatValor className={c.classeDoValor} data-slot="faixa-valor">
                  {c.valor}
                </StatValor>
                {c.complemento && (
                  <span className="text-apoio font-semibold tabular-nums text-ink-2" data-slot="faixa-complemento">
                    {c.complemento}
                  </span>
                )}
              </div>
              <p className="truncate text-legenda text-ink-3">{c.frase}</p>
            </div>
            {c.serie && c.serie.pontos.length >= 2 && (
              <ChartSparkline
                dados={c.serie.pontos}
                nome={c.serie.nome}
                formatar={c.serie.formatar}
                className="w-24 shrink-0 max-xl:hidden"
              />
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}
