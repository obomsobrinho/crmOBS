"use client";

import * as React from "react";

import { MOLDURA_DO_BALAO } from "@/components/ui/balao";
import { cn } from "@/lib/utils";

/**
 * Mapa de calor (15/10/2026): uma grade de células cuja intensidade é a
 * magnitude (dia da semana x hora, por exemplo). Mora na camada base ao lado do
 * `chart` porque é o gráfico que o Recharts não desenha, e segue as mesmas
 * regras:
 * - UM matiz (a marca) em cinco degraus, do vazio ao cheio (`--chart-rampa-0..4`
 *   em `app/globals.css`); a escala está na legenda;
 * - o pico tem contorno próprio (e a legenda diz o que o contorno significa);
 * - todo valor mora no balão da célula, ao passar o mouse e ao navegar pelo
 *   teclado (a grade é um só ponto de tabulação; as setas andam entre as
 *   células);
 * - o texto é de quem desenha (`descrever`, que é também o rótulo de leitor de
 *   tela), nunca HTML.
 *
 * Quem chama decide os números (a grade, o máximo e o pico); aqui só se desenha.
 * Não importa o Recharts (a moldura do balão vem de `balao.ts`).
 */

const NIVEIS = [1, 2, 3, 4] as const;

/** Degrau de cor da célula: 0 é vazia; 1 a 4 é a fração do máximo, arredondada para cima. */
export function nivelDoCalor(n: number, maximo: number): 0 | 1 | 2 | 3 | 4 {
  if (!(n > 0) || !(maximo > 0)) return 0;
  return Math.min(4, Math.max(1, Math.ceil((n / maximo) * 4))) as 1 | 2 | 3 | 4;
}

type Posicao = { linha: number; coluna: number };

const Celula = React.memo(function Celula({
  id,
  linha,
  coluna,
  valor,
  nivel,
  ativa,
  ehPico,
  rotulo,
  aoAtivar,
}: {
  id: string;
  linha: number;
  coluna: number;
  valor: number;
  nivel: number;
  ativa: boolean;
  ehPico: boolean;
  rotulo: string;
  aoAtivar: (linha: number, coluna: number) => void;
}) {
  return (
    <span
      id={id}
      role="gridcell"
      aria-label={rotulo}
      data-slot="mapa-celula"
      data-linha={linha}
      data-coluna={coluna}
      data-n={valor}
      data-nivel={nivel}
      data-pico={ehPico ? "" : undefined}
      onPointerEnter={() => aoAtivar(linha, coluna)}
      className={cn(
        "block h-5 rounded-sm",
        ativa && "outline outline-2 outline-ink-3",
        ehPico && "outline outline-2 outline-ink",
      )}
      style={{ background: `var(--chart-rampa-${nivel})` }}
    />
  );
});

function MapaDeCalor({
  rotulosDasLinhas,
  colunas,
  rotuloDaColuna,
  valores,
  maximo,
  pico,
  descrever,
  legenda,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  rotulosDasLinhas: readonly string[];
  colunas: number;
  /** O rótulo do eixo de cima para a coluna `c`; vazio esconde (nem toda hora precisa de número). */
  rotuloDaColuna: (coluna: number) => string;
  /** valores[linha][coluna] */
  valores: readonly (readonly number[])[];
  maximo: number;
  pico: Posicao | null;
  /** O texto da célula ("quarta, 14h: 23 turnos"): o balão e o rótulo de leitor de tela. */
  descrever: (linha: number, coluna: number, n: number) => string;
  legenda: { menos: string; mais: string; pico: string };
}) {
  const id = React.useId();
  const caixa = React.useRef<HTMLDivElement>(null);
  const [ativa, setAtiva] = React.useState<Posicao | null>(null);
  const [ancora, setAncora] = React.useState<{ x: number; y: number; largura: number } | null>(null);

  const chave = (l: number, c: number) => `${l}-${c}`;

  // A célula ativa se acha pelo DOM (data-linha e data-coluna): sem um ref por célula.
  const ativar = React.useCallback((l: number, c: number) => {
    const dono = caixa.current;
    setAtiva({ linha: l, coluna: c });
    const el = dono?.querySelector(`[data-slot="mapa-celula"][data-linha="${l}"][data-coluna="${c}"]`);
    if (!el || !dono) return;
    const a = el.getBoundingClientRect();
    const b = dono.getBoundingClientRect();
    setAncora({ x: a.left - b.left + a.width / 2, y: a.top - b.top, largura: b.width });
  }, []);

  function limpar() {
    setAtiva(null);
    setAncora(null);
  }

  function aoTeclar(e: React.KeyboardEvent) {
    const atual = ativa ?? pico ?? { linha: 0, coluna: 0 };
    let { linha, coluna } = atual;
    if (e.key === "ArrowRight") coluna = Math.min(colunas - 1, coluna + 1);
    else if (e.key === "ArrowLeft") coluna = Math.max(0, coluna - 1);
    else if (e.key === "ArrowDown") linha = Math.min(valores.length - 1, linha + 1);
    else if (e.key === "ArrowUp") linha = Math.max(0, linha - 1);
    else if (e.key === "Home") coluna = 0;
    else if (e.key === "End") coluna = colunas - 1;
    else if (e.key === "Escape") return limpar();
    else return;
    e.preventDefault();
    ativar(linha, coluna);
  }

  const n = ativa ? (valores[ativa.linha]?.[ativa.coluna] ?? 0) : 0;
  const metade = 96;

  return (
    <div {...props} ref={caixa} data-slot="mapa-de-calor" className={cn("relative", className)}>
      <div
        role="grid"
        tabIndex={0}
        aria-activedescendant={ativa ? `${id}-${chave(ativa.linha, ativa.coluna)}` : undefined}
        onKeyDown={aoTeclar}
        onFocus={() => {
          if (!ativa) {
            const ponto = pico ?? { linha: 0, coluna: 0 };
            ativar(ponto.linha, ponto.coluna);
          }
        }}
        onBlur={limpar}
        onPointerLeave={limpar}
        className="grid grid-cols-[auto_repeat(var(--colunas),minmax(0,1fr))] items-center gap-[2px]"
        style={{ "--colunas": colunas } as React.CSSProperties}
      >
        <div role="row" className="contents">
          <span aria-hidden />
          {Array.from({ length: colunas }, (_, c) => (
            <span key={c} aria-hidden className="text-center text-legenda leading-none text-ink-3">
              {rotuloDaColuna(c)}
            </span>
          ))}
        </div>
        {valores.map((linha, l) => (
          <div key={l} role="row" className="contents">
            <span role="rowheader" className="pr-1.5 text-legenda text-ink-3">
              {rotulosDasLinhas[l]}
            </span>
            {linha.map((valor, c) => (
              <Celula
                key={c}
                id={`${id}-${chave(l, c)}`}
                linha={l}
                coluna={c}
                valor={valor}
                nivel={nivelDoCalor(valor, maximo)}
                ativa={ativa?.linha === l && ativa.coluna === c}
                ehPico={pico?.linha === l && pico.coluna === c}
                rotulo={descrever(l, c, valor)}
                aoAtivar={ativar}
              />
            ))}
          </div>
        ))}
      </div>

      {ativa && ancora && (
        <div
          data-slot="mapa-balao"
          role="status"
          className={cn(MOLDURA_DO_BALAO, "pointer-events-none absolute z-10 w-max max-w-56")}
          style={{
            left: Math.min(Math.max(ancora.x, metade), Math.max(metade, ancora.largura - metade)),
            top: ancora.y,
            transform: "translate(-50%, calc(-100% - 6px))",
          }}
        >
          <p className="font-semibold text-ink">{descrever(ativa.linha, ativa.coluna, n)}</p>
        </div>
      )}

      <div data-slot="mapa-legenda" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-legenda text-ink-3">
        <span className="flex items-center gap-1.5">
          {legenda.menos}
          <span aria-hidden className="flex gap-[2px]">
            {[0, ...NIVEIS].map((nv) => (
              <span
                key={nv}
                className="block h-3 w-3.5 rounded-sm"
                style={{ background: `var(--chart-rampa-${nv})` }}
              />
            ))}
          </span>
          {legenda.mais}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="block h-3 w-3.5 rounded-sm outline outline-2 outline-ink" />
          {legenda.pico}
        </span>
      </div>
    </div>
  );
}

export { MapaDeCalor };
