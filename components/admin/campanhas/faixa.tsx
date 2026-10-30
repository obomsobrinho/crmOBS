"use client";

import { Card } from "@/components/ui/card";
import { ChartMiniColunas, ChartSparkline, type PontoDeTendencia } from "@/components/ui/chart";
import { StatRotulo, StatValor } from "@/components/ui/stat";
import { numeroBR } from "@/lib/format";
import { cn } from "@/lib/utils";

// A FAIXA DE NÚMEROS do topo de Leads, Campanhas, da busca e da campanha
// (29/10/2026, dono: "alguns estão muito pobres e outros estão todos com barra
// de progresso, vamos ser criativos"; referências Dribbble "CRM Dashboard for
// Sales Performance" e "CureDesk"). Um cartão só, cortado em células iguais, e
// cada célula escolhe o desenho que combina com o número dela:
// - `area`: uma tendência no tempo (leads novos por semana, respostas por dia);
// - `colunas`: uma contagem por dia ou por faixa (envios por dia, tempo até responder);
// - `anel`: a parte de um todo (quem tem celular, taxa de resposta);
// - `partes`: a composição em pedaços com o nome de cada um (o desfecho, o tipo de telefone).
// O número está sempre em texto ao lado; o desenho não é a única leitura.

export type DesenhoDaCelula =
  | { tipo: "area"; pontos: PontoDeTendencia[]; nome: string }
  | { tipo: "colunas"; pontos: PontoDeTendencia[]; nome: string; destaque?: "maior" | "ultima" }
  | { tipo: "anel"; valor: number }
  | { tipo: "partes"; partes: { chave: string; rotulo: string; n: number; cor: string }[] };

export interface CelulaDaFaixa {
  chave: string;
  rotulo: string;
  valor: string;
  /** Ao lado do número, menor ("19%"). */
  complemento?: string;
  frase: string;
  /** O selo de variação (`Selo` do painel), no canto. */
  selo?: React.ReactNode;
  desenho?: DesenhoDaCelula | null;
  /** Cor de estado no número (o âmbar de "pediram para parar"). */
  classeDoValor?: string;
}

/** O anel de uma parte do todo: decorativo, a porcentagem está escrita no centro e no cartão. */
function Anel({ valor }: { valor: number }) {
  const r = 20;
  const volta = 2 * Math.PI * r;
  const cheio = Math.max(0, Math.min(100, valor));
  return (
    <span aria-hidden data-slot="faixa-anel" className="relative grid size-14 shrink-0 place-items-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-[var(--chart-rampa-1)]" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(cheio / 100) * volta} ${volta}`}
          className="stroke-[var(--chart-1)] transition-[stroke-dasharray] duration-700 motion-reduce:transition-none"
        />
      </svg>
      <span className="text-legenda font-semibold tabular-nums text-ink">{Math.round(cheio)}%</span>
    </span>
  );
}

/** A composição: uma barra em pedaços e, embaixo, o nome e o número de cada pedaço. */
function Partes({ partes }: { partes: { chave: string; rotulo: string; n: number; cor: string }[] }) {
  return (
    <div className="flex flex-col gap-1.5" data-slot="faixa-partes">
      <div aria-hidden className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
        {partes
          .filter((p) => p.n > 0)
          .map((p) => (
            <span key={p.chave} style={{ flexGrow: p.n, background: p.cor }} className="h-full first:rounded-l-full last:rounded-r-full" />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-legenda text-ink-3">
        {partes.map((p) => (
          <li key={p.chave} className="flex items-center gap-1" data-parte={p.chave} data-n={p.n}>
            <span aria-hidden className="size-2 rounded-[2px]" style={{ background: p.cor }} />
            {p.rotulo} <span className="font-semibold tabular-nums text-ink-2">{numeroBR(p.n)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Desenho({ d }: { d: DesenhoDaCelula }) {
  if (d.tipo === "anel") return <Anel valor={d.valor} />;
  if (d.tipo === "partes") return null; // embaixo, largura inteira
  if (d.pontos.length < 2) return null;
  return d.tipo === "area" ? (
    <ChartSparkline dados={d.pontos} nome={d.nome} formatar={numeroBR} className="w-28 shrink-0" />
  ) : (
    <ChartMiniColunas dados={d.pontos} nome={d.nome} formatar={numeroBR} destaque={d.destaque} className="w-28 shrink-0" />
  );
}

export function FaixaDeNumeros({ celulas, className }: { celulas: CelulaDaFaixa[]; className?: string }) {
  return (
    <Card
      variant="conteudo"
      data-slot="faixa-numeros"
      className={cn(
        "grid grid-cols-1 gap-px overflow-hidden border border-line bg-line sm:grid-cols-2",
        celulas.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3",
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
            {c.desenho && <Desenho d={c.desenho} />}
          </div>
          {c.desenho?.tipo === "partes" && <Partes partes={c.desenho.partes} />}
        </div>
      ))}
    </Card>
  );
}
