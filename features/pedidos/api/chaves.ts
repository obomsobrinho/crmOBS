import type { AbaPedidos } from "./fonte";

/**
 * As chaves de Pedidos no cache de dados (docs/plano-dados-e-estado.md, 2.5):
 * `[area, entidade, tipo, params?]`, sempre por aqui, nunca escritas na tela.
 * A invalidação é por prefixo: `listas()` relê toda lista e guarda os detalhes.
 *
 * `fora` (as grafias do número de avisos) não entra na chave: ele vem da sessão,
 * e o cliente de dados nasce por identidade (2.4), então não muda dentro dele.
 */
export interface FiltroDaLista {
  aba: AbaPedidos;
  busca: string;
  motivo: string | null;
}

export const chavesDePedidos = {
  tudo: ["pedidos"] as const,
  pedidos: ["pedidos", "pedidos"] as const,
  listas: () => [...chavesDePedidos.pedidos, "lista"] as const,
  lista: (f: FiltroDaLista) => [...chavesDePedidos.listas(), f] as const,
  detalhes: () => [...chavesDePedidos.pedidos, "detalhe"] as const,
  detalhe: (id: number) => [...chavesDePedidos.detalhes(), id] as const,
  /** A história de um pedido: muda de janela quando ele fecha, então o fechamento entra na chave. */
  historia: (id: number, fechadoEm: string | null) => [...chavesDePedidos.pedidos, "historia", id, fechadoEm] as const,
  contagens: () => ["pedidos", "contagens"] as const,
  contagem: (motivo: string | null) => [...chavesDePedidos.contagens(), { motivo }] as const,
  membros: () => ["pedidos", "membros", "lista"] as const,
  /** Escritas, `[area, entidade, ação]`: a conferência "última escrita pendente" olha `pedidos`. */
  escrita: (acao: "orientar" | "resolver") => [...chavesDePedidos.pedidos, acao] as const,
};
