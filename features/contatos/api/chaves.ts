import type { FiltroClientes } from "@/lib/clientes";

/**
 * As chaves de Contatos no cache de dados (docs/plano-dados-e-estado.md, 2.5):
 * `[area, entidade, tipo, params?]`, sempre por aqui. O "hoje" e o "frio" que a
 * função do banco recebe saem do relógio na hora da leitura e não entram na chave
 * (mudariam a cada milissegundo); `fora` vem da sessão, que não muda dentro do cliente.
 */
export interface FiltroDaLista {
  filtro: FiltroClientes;
  busca: string;
}

export const chavesDeContatos = {
  tudo: ["contatos"] as const,
  contatos: ["contatos", "contatos"] as const,
  listas: () => [...chavesDeContatos.contatos, "lista"] as const,
  lista: (f: FiltroDaLista) => [...chavesDeContatos.listas(), f] as const,
  contagens: () => ["contatos", "contagens"] as const,
  fichas: () => [...chavesDeContatos.contatos, "ficha"] as const,
  ficha: (id: number) => [...chavesDeContatos.fichas(), id] as const,
};
