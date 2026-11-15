import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { agoraMs } from "@/lib/periodo";
import type { ClienteItem } from "@/lib/clientes";
import { CONTAGENS_CLIENTES_VAZIAS, PAGINA_CLIENTES, paramsClientes, type ContagensClientes, type FonteClientes } from "../api/fonte";
import { chavesDeContatos, type FiltroDaLista } from "../api/chaves";
import type { FichaDoContato } from "../api/ficha";

// AS PORTAS DA TELA DE CONTATOS PARA OS DADOS (docs/plano-dados-e-estado.md, passo 3b):
// cada bloco lê pelo cache, direto do banco pelo RLS (D1). Contatos não tem realtime:
// a volta do foco e o contato salvo nesta aba (`contato-bus`) passam pela ponte de
// Contatos do layout (`api/ponte.ts`), que relê só a primeira página de cada lista.

interface PaginaDeContatos {
  itens: ClienteItem[];
  temMais: boolean;
}

/** A lista, 10 por vez, mais ao rolar; trocar filtro ou busca mantém a anterior na tela. */
export function useListaDeContatos(fonte: FonteClientes, fora: string[], f: FiltroDaLista) {
  const q = useInfiniteQuery({
    queryKey: chavesDeContatos.lista(f),
    queryFn: async ({ pageParam }): Promise<PaginaDeContatos> => {
      const itens = await fonte.pagina(paramsClientes(f.filtro, f.busca, fora, agoraMs()), pageParam, PAGINA_CLIENTES);
      return { itens, temMais: itens.length === PAGINA_CLIENTES };
    },
    initialPageParam: null as ClienteItem | null,
    getNextPageParam: (ultima) => (ultima.temMais ? (ultima.itens[ultima.itens.length - 1] ?? undefined) : undefined),
    placeholderData: keepPreviousData,
  });
  return { ...q, itens: q.data ? q.data.pages.flatMap((p) => p.itens) : [] };
}

/** Os números do filtro (todos, em conversa, frios...). */
export function useContagensDeContatos(fonte: FonteClientes, fora: string[]): { contagens: ContagensClientes; carregou: boolean } {
  const q = useQuery({
    queryKey: chavesDeContatos.contagens(),
    queryFn: () => fonte.contagens(paramsClientes("todos", "", fora, agoraMs())),
  });
  return { contagens: q.data ?? CONTAGENS_CLIENTES_VAZIAS, carregou: q.data !== undefined };
}

/** A ficha de um contato; `null` quando ele não existe. */
export function useFichaDoContato(id: number, ler: (id: number) => Promise<FichaDoContato | null>) {
  return useQuery({ queryKey: chavesDeContatos.ficha(id), queryFn: () => ler(id) });
}
