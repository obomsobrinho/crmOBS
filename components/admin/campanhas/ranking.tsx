"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Medidor } from "@/components/ui/medidor";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { numeroBR, pct, plural } from "@/lib/format";
import type { GrupoDaBase } from "@/lib/prospeccao";

// As peças de lista do painel de Leads (não são gráficos: cada linha já diz o
// seu número em texto): o funil da base e "Onde estão", o ranking por cidade OU
// por segmento num cartão só (dono, 29/10/2026: os dois rankings lado a lado
// eram "muito grandes"). Uma linha por grupo (nome, barra, número, parte da
// base), as 5 maiores e uma linha "Outras N" com a soma: o cartão tem o mesmo
// tamanho com 3 ou com 300 cidades. A lista inteira está no filtro de cidade da
// tabela "Todos os leads".

const LIMITE = 5;

/** O funil da base: cada degrau com o número, a barra (parte da base) e quanto passou do anterior. */
export function FunilDaBase({ passos }: { passos: { chave: string; rotulo: string; n: number }[] }) {
  const base = passos[0]?.n ?? 0;
  return (
    <ol className="mt-3 flex flex-col gap-3" data-slot="leads-funil">
      {passos.map((p, i) => (
        <li key={p.chave} className="flex flex-col gap-1.5" data-degrau={p.chave} data-n={p.n}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-apoio text-ink">{p.rotulo}</span>
            <span className="text-apoio tabular-nums">
              <span className="font-semibold text-ink">{numeroBR(p.n)}</span>
              {i > 0 && <span className="ml-1.5 text-legenda text-ink-3">{pct(p.n, passos[i - 1].n)}%</span>}
            </span>
          </div>
          <Medidor valor={pct(p.n, base)} tom="marca" rotulo={`${p.rotulo}: ${numeroBR(p.n)}`} />
        </li>
      ))}
    </ol>
  );
}

function LinhasDoRanking({ grupos, total, unidade }: { grupos: GrupoDaBase[]; total: number; unidade: [string, string] }) {
  const vistos = grupos.slice(0, LIMITE);
  const resto = grupos.slice(LIMITE);
  const somaDoResto = resto.reduce((s, g) => s + g.total, 0);
  const linhas = [
    ...vistos.map((g) => ({ ...g, outras: false })),
    ...(resto.length > 0
      ? [{ nome: `Outras ${resto.length} ${plural(resto.length, ...unidade)}`, total: somaDoResto, contatados: 0, responderam: 0, aContatar: 0, outras: true }]
      : []),
  ];
  return (
    <ul className="mt-3 flex flex-col gap-2.5" data-slot="leads-ranking">
      {linhas.map((g) => (
        <li
          key={g.nome}
          className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-apoio"
          data-grupo={g.nome}
          data-total={g.total}
          title={g.outras ? undefined : `${g.contatados} contatados, ${g.responderam} responderam`}
        >
          <span className={`truncate ${g.outras ? "text-ink-3" : "text-ink"}`}>{g.nome}</span>
          <Medidor valor={pct(g.total, total)} tom={g.outras ? "neutro" : "marca"} />
          <span className="w-20 text-right tabular-nums">
            <span className="font-semibold text-ink">{numeroBR(g.total)}</span>
            <span className="ml-1.5 text-legenda text-ink-3">{pct(g.total, total)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "Onde estão": o ranking por cidade ou por segmento, com o alternador no canto. */
export function OndeEstao({
  cidades,
  segmentos,
  total,
}: {
  cidades: GrupoDaBase[];
  segmentos: GrupoDaBase[];
  total: number;
}) {
  const [por, setPor] = useState<"cidade" | "segmento">("cidade");
  return (
    <Card variant="conteudo" className="p-5" data-bloco="leads-onde">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h3 className="text-rotulo uppercase text-ink-3">Onde estão</h3>
        <Tabs value={por} onValueChange={(v) => setPor(v === "segmento" ? "segmento" : "cidade")}>
          <TabsList variant="painel" aria-label="Agrupar por" className="bg-canvas">
            <TabsTrigger value="cidade" variant="painel" data-slot="leads-onde-cidade">
              Cidade
            </TabsTrigger>
            <TabsTrigger value="segmento" variant="painel" data-slot="leads-onde-segmento">
              Segmento
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {por === "cidade" ? (
        <LinhasDoRanking grupos={cidades} total={total} unidade={["cidade", "cidades"]} />
      ) : (
        <LinhasDoRanking grupos={segmentos} total={total} unidade={["segmento", "segmentos"]} />
      )}
    </Card>
  );
}
