import { Medidor } from "@/components/ui/medidor";
import { coresDoRotulo } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

// A LISTA DE CONTAGENS com barra: o rótulo, o número e uma barra do tamanho do
// maior. Veio de "Por que a IA te chamou" (`PainelMotivos`) e é a mesma peça nos
// motivos e nas soluções dos pedidos de ajuda (central do dono, aba Atendimento).
//
// Cor: a da marca em todas por padrão, ou `colorido` (24/11/2026, decisão do dono,
// "Por que a IA te chamou"): o PRIMEIRO, o que mais pesa, na marca, e cada um dos
// seguintes num matiz da paleta de rótulos. Cinza para o que não é uma categoria de
// verdade ("Sem motivo", "Ainda abertos"): `neutro`. Contagem de categoria não é
// boa nem ruim, então nunca verde, âmbar ou vermelho (.claude/rules/dashboard.md).
// Quem conta e ordena é quem chama; aqui só se desenha.

/** Depois do primeiro (na marca), os matizes da paleta de rótulos nesta ordem. */
const SEQUENCIA = ["blue", "cyan", "pink", "indigo", "stone"] as const;

export interface ItemDeContagem {
  /** Chave estável do item (vai no atributo marcado por `atributoDoItem`). */
  chave: string;
  rotulo: string;
  n: number;
  /** Item sem categoria: rótulo e barra em cinza. */
  neutro?: boolean;
}

export default function ListaDeContagens({
  itens,
  atributoDoItem = "data-chave",
  colorido = false,
  className,
  ...props
}: Omit<React.ComponentProps<"ul">, "children"> & {
  itens: ItemDeContagem[];
  /** Nome do atributo `data-*` que cada `li` leva com a chave (os testes de cada tela o usam). */
  atributoDoItem?: string;
  /** Uma cor por posição (ver acima); sem ele, todas na marca. */
  colorido?: boolean;
}) {
  const maior = Math.max(1, ...itens.map((i) => i.n));
  return (
    <ul {...props} className={cn("flex flex-col gap-3", className)}>
      {itens.map((it, i) => (
        <li key={it.chave} {...{ [atributoDoItem]: it.chave }} className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-2.5">
            <span className={cn("min-w-0 truncate text-corpo", it.neutro ? "text-ink-3" : "text-ink")}>
              {it.rotulo}
            </span>
            <span
              className={cn(
                "shrink-0 font-display text-corpo font-semibold tabular-nums",
                colorido && i === 0 && !it.neutro ? "text-brand-ink" : "text-ink"
              )}
            >
              {it.n}
            </span>
          </span>
          <Medidor
            valor={(it.n / maior) * 100}
            tom={it.neutro ? "neutro" : colorido && i > 0 ? "paleta" : "marca"}
            style={
              colorido && i > 0
                ? ({ "--medidor-cor": coresDoRotulo(SEQUENCIA[(i - 1) % SEQUENCIA.length]).fill } as React.CSSProperties)
                : undefined
            }
            className={colorido ? "h-2" : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
