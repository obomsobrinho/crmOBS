import type { MutationOptions, QueryClient, QueryKey } from "@tanstack/react-query";
import { remendarLinha, tirarDaPagina } from "./cache";
import { invalidarComAtraso } from "./invalidar";

/** O que `onMutate` guarda: a rota do clique, para o aviso global (lib/query/cliente.ts). */
export interface ContextoDaEscrita {
  rota: string | null;
}

type Id = string | number;

interface Base {
  qc: QueryClient;
  /** Prefixo de TODAS as listas que mostram a entidade (`chavesDeLeads.listas()`). */
  listas: QueryKey;
  /** `[área, entidade]`: o teste de "última escrita pendente" olha aqui (2.5). */
  entidade: readonly [string, string];
  /** A ação, terceiro nível da chave de escrita (`"tirar"`, `"marcar"`). */
  acao: string;
  atrasoMs?: number;
}

function rotaAtual(): string | null {
  return typeof window === "undefined" ? null : window.location.pathname;
}

/** Só a ÚLTIMA escrita pendente da entidade invalida (ela ainda conta aqui: 1 é "sou a última"). */
function invalidarSeForAUltima(b: Base) {
  if (b.qc.isMutating({ mutationKey: [...b.entidade] }) === 1) invalidarComAtraso(b.qc, b.listas, b.atrasoMs);
}

/**
 * Tirar uma linha de lista, otimista (docs/plano-dados-e-estado.md, 2.6):
 * some no clique, com o total; se a rota recusa, a invalidação final traz a
 * linha de volta (não há operação inversa). A fonte já trata "não encontrado"
 * como sucesso e lança `ErroDaApi` no resto.
 */
export function opcoesDeTirar<V extends Id>(
  b: Base & { executar: (id: V) => Promise<unknown> }
): MutationOptions<unknown, Error, V, ContextoDaEscrita> {
  return {
    mutationKey: [...b.entidade, b.acao],
    mutationFn: b.executar,
    onMutate: async (id) => {
      await b.qc.cancelQueries({ queryKey: b.listas });
      b.qc.setQueriesData({ queryKey: b.listas }, tirarDaPagina(id));
      return { rota: rotaAtual() };
    },
    onSettled: () => invalidarSeForAUltima(b),
  };
}

/** Mudar campos de uma linha, otimista, pelas mesmas regras de `opcoesDeTirar`. */
export function opcoesDeRemendar<V extends { id: Id }, L extends { id: Id }>(
  b: Base & { executar: (v: V) => Promise<unknown>; remendo: (v: V) => Partial<L> }
): MutationOptions<unknown, Error, V, ContextoDaEscrita> {
  return {
    mutationKey: [...b.entidade, b.acao],
    mutationFn: b.executar,
    onMutate: async (v) => {
      await b.qc.cancelQueries({ queryKey: b.listas });
      b.qc.setQueriesData({ queryKey: b.listas }, remendarLinha<L>(v.id as L["id"], b.remendo(v)));
      return { rota: rotaAtual() };
    },
    onSettled: () => invalidarSeForAUltima(b),
  };
}
