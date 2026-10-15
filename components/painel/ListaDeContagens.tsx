import { Medidor } from "@/components/ui/medidor";
import { cn } from "@/lib/utils";

// A LISTA DE CONTAGENS com barra: o rótulo, o número e uma barra do tamanho do
// maior. Veio de "Por que a IA te chamou" (`PainelMotivos`) e é a mesma peça nos
// motivos e nas soluções dos pedidos de ajuda (central do dono, aba Atendimento).
//
// ⚠️ UMA cor só (a da marca) e cinza para o que não é uma categoria de verdade
// ("Sem motivo", "Ainda abertos"): `neutro`. Contagem de categoria não é boa nem
// ruim, então nada de verde, âmbar ou vermelho (regra do painel,
// .claude/rules/dashboard.md). Quem conta e ordena é quem chama; aqui só se desenha.

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
  className,
  ...props
}: Omit<React.ComponentProps<"ul">, "children"> & {
  itens: ItemDeContagem[];
  /** Nome do atributo `data-*` que cada `li` leva com a chave (os testes de cada tela o usam). */
  atributoDoItem?: string;
}) {
  const maior = Math.max(1, ...itens.map((i) => i.n));
  return (
    <ul {...props} className={cn("flex flex-col gap-3", className)}>
      {itens.map((it) => (
        <li key={it.chave} {...{ [atributoDoItem]: it.chave }} className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-2.5">
            <span className={cn("min-w-0 truncate text-corpo", it.neutro ? "text-ink-3" : "text-ink")}>
              {it.rotulo}
            </span>
            <span className="shrink-0 font-display text-corpo font-semibold tabular-nums text-ink">{it.n}</span>
          </span>
          <Medidor valor={(it.n / maior) * 100} tom={it.neutro ? "neutro" : "marca"} />
        </li>
      ))}
    </ul>
  );
}
