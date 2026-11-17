import { useCallback } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { FRESCO_CONFIG_MS } from "@/lib/query/cliente";
import { invalidarComAtraso } from "@/lib/query/invalidar";
import { tirarDaPagina } from "@/lib/query/cache";
import { PAGINA_PEDIDOS, ehAberto, type PedidoItem, type PedidoResolvido } from "../regras";
import { aplicarNaLista, itensDaLista, type ListaNoCache, type PaginaDePedidos } from "../api/cache";
import { chavesDePedidos, type FiltroDaLista } from "../api/chaves";
import { CONTAGENS_PEDIDOS_VAZIAS, type ContagensPedidos, type FontePedidos } from "../api/fonte";
import { sincronizarConversa } from "../api/sincronizar";

// AS PORTAS DA TELA DE PEDIDOS PARA OS DADOS (docs/plano-dados-e-estado.md, 2.2):
// cada bloco lê pelo cache, com as chaves de `api/chaves.ts`, direto do banco pelo
// RLS (D1). A fonte vem de quem monta a tela (o banco, ou a memória no /design).

/** A lista da aba, 10 por vez, mais ao rolar; trocar busca ou filtro mantém a anterior na tela. */
export function useListaDePedidos(fonte: FontePedidos, fora: string[], f: FiltroDaLista, ativa = true) {
  const q = useInfiniteQuery({
    enabled: ativa,
    queryKey: chavesDePedidos.lista(f),
    queryFn: async ({ pageParam }): Promise<PaginaDePedidos> => {
      const itens = await fonte.pagina({ ...f, fora }, pageParam, PAGINA_PEDIDOS);
      return { itens, temMais: itens.length === PAGINA_PEDIDOS };
    },
    initialPageParam: null as PedidoItem | null,
    getNextPageParam: (ultima) => (ultima.temMais ? (ultima.itens[ultima.itens.length - 1] ?? undefined) : undefined),
    placeholderData: keepPreviousData,
  });
  return { ...q, itens: itensDaLista(q.data) };
}

/** Os números das abas, seguindo o filtro de motivo (senão a aba mentiria). */
export function useContagensDePedidos(fonte: FontePedidos, fora: string[], motivo: string | null): ContagensPedidos {
  const q = useQuery({
    queryKey: chavesDePedidos.contagem(motivo),
    queryFn: () => fonte.contagens(fora, motivo),
    placeholderData: keepPreviousData,
  });
  return q.data ?? CONTAGENS_PEDIDOS_VAZIAS;
}

/** A equipe, para dizer quem resolveu. Configuração: muda pouco. */
export function useMembrosDePedidos(fonte: FontePedidos) {
  return useQuery({ queryKey: chavesDePedidos.membros(), queryFn: () => fonte.membros(), staleTime: FRESCO_CONFIG_MS }).data ?? [];
}

/** UM pedido pelo id (o `?abrir=` do aviso), lido só quando ele não está na lista guardada. */
export function usePedidoPorId(fonte: FontePedidos, fora: string[], id: number | null, jaNaLista: boolean) {
  return useQuery({
    queryKey: chavesDePedidos.detalhe(id ?? 0),
    queryFn: () => fonte.porId(fora, id as number),
    enabled: id != null && !jaNaLista,
  });
}

/** A história de um pedido (três leituras pequenas), só quando ele é aberto. */
export function useHistoriaDoPedido(fonte: FontePedidos, p: PedidoItem, ativa: boolean) {
  return useQuery({
    queryKey: chavesDePedidos.historia(p.id, ehAberto(p) ? null : p.closedAt),
    queryFn: () => fonte.historia(p),
    enabled: ativa,
  });
}

/**
 * O pedido saiu dos abertos (orientado ou resolvido, depois da resposta da rota,
 * como antes): sai das listas na hora, os números andam juntos, e a fila da
 * conversa é refeita (a mesma ida da ponte do realtime). Os resolvidos guardados
 * ficam velhos e relêem quando alguém olhar.
 */
export function concluirNoCache(
  qc: QueryClient,
  fonte: FontePedidos,
  fora: string[],
  fechado: PedidoResolvido,
  aoVivo: boolean
): void {
  qc.setQueriesData<ListaNoCache>({ queryKey: chavesDePedidos.listas() }, (d) => {
    const sem = tirarDaPagina<PedidoItem>(fechado.id)(d) as ListaNoCache | undefined;
    return sem;
  });
  qc.setQueriesData<ContagensPedidos>({ queryKey: chavesDePedidos.contagens() }, (c) =>
    c ? { abertos: Math.max(0, c.abertos - 1), resolvidos: c.resolvidos + 1 } : c
  );
  for (const q of qc.getQueryCache().findAll({ queryKey: chavesDePedidos.listas() })) {
    const f = q.queryKey[3] as FiltroDaLista;
    if (f.aba === "resolvidos" && f.busca === "" && f.motivo === null) {
      qc.setQueryData<ListaNoCache>(q.queryKey, (d) => aplicarNaLista(d, (itens) => [fechado, ...itens.filter((x) => x.id !== fechado.id)]));
    }
  }
  if (aoVivo) void sincronizarConversa(qc, fonte, fora, fechado.phone, [fechado.id]);
  else invalidarComAtraso(qc, chavesDePedidos.tudo);
}

export function useConcluirPedido(fonte: FontePedidos, fora: string[], aoVivo: boolean) {
  const qc = useQueryClient();
  return useCallback((fechado: PedidoResolvido) => concluirNoCache(qc, fonte, fora, fechado, aoVivo), [qc, fonte, fora, aoVivo]);
}
