"use client";

import { Medidor } from "@/components/ui/medidor";
import { numeroBR, pct, plural } from "@/lib/format";
import type { GrupoDaBase } from "@/lib/prospeccao";

// O RANKING da base (por cidade, por segmento): as maiores primeiro, cada uma
// numa linha com o número, a parte da base numa barra fina e quantas já foram
// contatadas e responderam. Fica do mesmo tamanho com 3 ou com 300 cidades: as
// `limite` maiores e uma linha "Outras N" com a soma (dono, 29/10/2026: "a
// tendência é ficar gigantesco").

/**
 * O funil da base: cada degrau numa linha com o número, a barra (a parte da
 * base inteira) e quanto passou do degrau anterior. Ocupa a altura do cartão
 * (os degraus se espalham), sem o vazio do gráfico de barras que havia antes.
 */
export function FunilDaBase({ passos }: { passos: { chave: string; rotulo: string; n: number }[] }) {
  const base = passos[0]?.n ?? 0;
  return (
    <ol className="mt-4 flex flex-1 flex-col justify-between gap-4" data-slot="leads-funil">
      {passos.map((p, i) => (
        <li key={p.chave} className="flex flex-col gap-1.5" data-degrau={p.chave} data-n={p.n}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-apoio text-ink">{p.rotulo}</span>
            <span className="text-apoio tabular-nums">
              <span className="font-semibold text-ink">{numeroBR(p.n)}</span>
              {i > 0 && <span className="ml-1.5 text-legenda text-ink-3">{pct(p.n, passos[i - 1].n)}% do anterior</span>}
            </span>
          </div>
          <Medidor valor={pct(p.n, base)} tom="marca" className="h-2.5" rotulo={`${p.rotulo}: ${numeroBR(p.n)}`} />
        </li>
      ))}
    </ol>
  );
}

export function RankingDaBase({
  grupos,
  total,
  limite = 6,
  unidade,
  slot,
}: {
  grupos: GrupoDaBase[];
  /** O total da base, para a parte de cada grupo. */
  total: number;
  limite?: number;
  /** ["cidade", "cidades"], para a linha "Outras". */
  unidade: [string, string];
  slot: string;
}) {
  const vistos = grupos.slice(0, limite);
  const resto = grupos.slice(limite);
  const outras = resto.reduce(
    (s, g) => ({ ...s, total: s.total + g.total, contatados: s.contatados + g.contatados, responderam: s.responderam + g.responderam }),
    { nome: "", total: 0, aContatar: 0, contatados: 0, responderam: 0 },
  );
  const linhas = resto.length > 0 ? [...vistos, { ...outras, nome: `Outras ${resto.length} ${plural(resto.length, ...unidade)}` }] : vistos;
  return (
    <ul className="mt-4 flex flex-col gap-3.5" data-slot={slot}>
      {linhas.map((g, i) => (
        <li key={`${g.nome}-${i}`} className="flex flex-col gap-1.5" data-grupo={g.nome} data-total={g.total}>
          <div className="flex items-baseline justify-between gap-3">
            <span className={`min-w-0 truncate text-apoio ${i === vistos.length ? "text-ink-3" : "text-ink"}`}>{g.nome}</span>
            <span className="shrink-0 text-apoio tabular-nums">
              <span className="font-semibold text-ink">{numeroBR(g.total)}</span>
              <span className="ml-1.5 text-legenda text-ink-3">{pct(g.total, total)}%</span>
            </span>
          </div>
          <Medidor valor={pct(g.total, total)} tom={i === vistos.length ? "neutro" : "marca"} />
          <span className="text-legenda tabular-nums text-ink-3">
            {numeroBR(g.contatados)} {plural(g.contatados, "contatado", "contatados")}, {numeroBR(g.responderam)}{" "}
            {plural(g.responderam, "respondeu", "responderam")}
          </span>
        </li>
      ))}
    </ul>
  );
}
