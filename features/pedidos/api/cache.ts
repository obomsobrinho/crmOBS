import type { InfiniteData } from "@tanstack/react-query";
import type { PedidoItem } from "../regras";

/**
 * O formato de uma página da lista de Pedidos no cache (lista infinita do
 * TanStack): os itens e se o banco ainda tem mais depois deles. `temMais` mora
 * na página, e não no tamanho dela, porque o realtime junta as páginas (abaixo).
 */
export interface PaginaDePedidos {
  itens: PedidoItem[];
  temMais: boolean;
}

export type ListaNoCache = InfiniteData<PaginaDePedidos, PedidoItem | null>;

/** Os itens de todas as páginas carregadas, na ordem. */
export function itensDaLista(d: { pages: PaginaDePedidos[] } | undefined): PedidoItem[] {
  return d ? d.pages.flatMap((p) => p.itens) : [];
}

/**
 * Aplica à lista INTEIRA carregada uma regra que trabalha numa lista plana (as de
 * `regras.ts`: `encaixarAbertosDaConversa`, `encaixarResolvido`, tirar um id) e
 * guarda o resultado como UMA página (puro).
 *
 * Por que juntar: o encaixe pode mudar quantos itens cabem em cada página (um
 * pedido novo entra na primeira e empurra os outros), e redistribuir não ganha
 * nada. O cursor da próxima página é o último item (`getNextPageParam`), e ele
 * continua o último. `temMais` é o da última página. Sem mudança, devolve o MESMO
 * objeto (o TanStack não avisa ninguém).
 */
export function aplicarNaLista(
  d: ListaNoCache | undefined,
  regra: (itens: PedidoItem[], temMais: boolean) => PedidoItem[]
): ListaNoCache | undefined {
  if (!d || d.pages.length === 0) return d;
  const antes = itensDaLista(d);
  const temMais = d.pages[d.pages.length - 1].temMais;
  const depois = regra(antes, temMais);
  if (depois.length === antes.length && depois.every((x, i) => x === antes[i])) return d;
  return { pages: [{ itens: depois, temMais }], pageParams: [d.pageParams[0] ?? null] };
}

/**
 * Antes de reler uma lista inteira (reconectou, voltou o foco), fica só a primeira
 * página: reler 15 páginas roladas seriam 15 leituras, e a de hoje (`usePaginada`)
 * relê só o começo. Quem rolar pede o resto de novo.
 */
export function soPrimeiraPagina(d: ListaNoCache | undefined): ListaNoCache | undefined {
  if (!d || d.pages.length <= 1) return d;
  return { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) };
}
