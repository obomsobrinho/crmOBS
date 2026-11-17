"use client";

import { useCallback } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { PAGINA_EMPRESAS, type EmpresaItem, type FonteEmpresas, type ParamsEmpresas } from "@/lib/admin-empresas";
import type { EstadoDoWhatsApp } from "@/lib/admin-alertas";
import { chavesDaCentral } from "../api/chaves";

// AS PORTAS DA CENTRAL DO DONO PARA OS DADOS (docs/plano-dados-e-estado.md, passo 5).
// A central lê pelas rotas `/api/admin/*` (service_role no servidor, D1) e NÃO tem
// realtime: a volta do foco relê o que está na tela (`refetchOnWindowFocus`, 2.4).
// O que o servidor já leu (a primeira página da lista) entra como dado fresco só
// para a chave que ele leu (D16).

interface PaginaDeEmpresas {
  itens: EmpresaItem[];
  temMais: boolean;
}

/** A primeira página que o servidor leu, e para qual recorte. */
export interface PrimeiraDoServidor {
  params: ParamsEmpresas;
  itens: EmpresaItem[];
}

const mesmoRecorte = (a: ParamsEmpresas, b: ParamsEmpresas) => a.busca === b.busca && a.situacao === b.situacao;

/** A lista de clientes, 10 por vez, mais ao rolar; trocar busca ou filtro mantém a anterior na tela. */
export function useListaDaCentral(fonte: FonteEmpresas, params: ParamsEmpresas, servidor: PrimeiraDoServidor | null) {
  const doServidor = servidor && mesmoRecorte(servidor.params, params) ? servidor.itens : null;
  const q = useInfiniteQuery({
    queryKey: chavesDaCentral.lista(params),
    queryFn: async ({ pageParam }): Promise<PaginaDeEmpresas> => {
      const itens = await fonte.pagina(params, pageParam, PAGINA_EMPRESAS);
      return { itens, temMais: itens.length === PAGINA_EMPRESAS };
    },
    initialPageParam: null as EmpresaItem | null,
    getNextPageParam: (ultima) => (ultima.temMais ? (ultima.itens[ultima.itens.length - 1] ?? undefined) : undefined),
    initialData: doServidor
      ? { pages: [{ itens: doServidor, temMais: doServidor.length === PAGINA_EMPRESAS }], pageParams: [null] }
      : undefined,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return { ...q, itens: q.data ? q.data.pages.flatMap((p) => p.itens) : [] };
}

/**
 * Uma leitura de aba do detalhe (Uso de IA, Atendimento, um mês do histórico, as cobranças).
 * Mesma forma do antigo `useCarga`: `dados` é `null` até chegar, e `tentarDeNovo` lê de novo.
 */
export function useLeituraDaCentral<T>(chave: QueryKey, ler: () => Promise<T>) {
  const q = useQuery({
    queryKey: chave,
    queryFn: () =>
      ler().catch((e: unknown) => {
        console.error("leitura da central:", e);
        throw e;
      }),
    refetchOnWindowFocus: true,
    retry: false,
  });
  const { refetch } = q;
  const tentarDeNovo = useCallback(() => void refetch(), [refetch]);
  return { dados: q.data === undefined ? null : q.data, erro: q.isError && q.data === undefined, tentarDeNovo };
}

/** Adianta a leitura de uma aba no gesto de intenção (mouse, foco ou toque no gatilho). */
export function useAdiantarDaCentral() {
  const qc = useQueryClient();
  return useCallback(
    <T,>(chave: QueryKey, ler: () => Promise<T>) => {
      void qc.prefetchQuery({ queryKey: chave, queryFn: ler }).catch(() => {});
    },
    [qc],
  );
}

/**
 * O WhatsApp do cliente, ao vivo na Evolution: UMA leitura ao abrir o detalhe (a fonte
 * nunca falha, devolve `desconhecido`), sem reler no foco; "checar de novo" relê.
 * `null` = checando.
 */
export function useWhatsappDoCliente(id: string, ativo: boolean, ler: () => Promise<EstadoDoWhatsApp>) {
  const q = useQuery({
    queryKey: chavesDaCentral.whatsapp(id),
    queryFn: ler,
    enabled: ativo,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const { refetch } = q;
  const checarDeNovo = useCallback(() => void refetch(), [refetch]);
  return { whatsapp: q.isFetching ? null : (q.data ?? null), checarDeNovo };
}

/**
 * Depois de uma escrita da central (limite, conta, apagar): tudo da central fica velho,
 * menos o WhatsApp (uma escrita da conta não muda a conexão, e ele lê a Evolution ao vivo).
 */
export function useInvalidarCentral() {
  const qc = useQueryClient();
  return useCallback(
    () =>
      void qc.invalidateQueries({
        queryKey: chavesDaCentral.tudo,
        predicate: (q) => q.queryKey[3] !== "whatsapp",
      }),
    [qc],
  );
}
