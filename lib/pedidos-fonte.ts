import type { Supa } from "@/lib/supabase/tipos";
import type { ArgsRpc } from "@/lib/supabase/schema";
import {
  PAGINA_PEDIDOS,
  casaBuscaPedido,
  ehAberto,
  inicioDosResolvidos,
  montarFila,
  montarResolvidos,
  ordemAbertos,
  ordemResolvidos,
  paraPedido,
  type ContatoLinha,
  type PedidoAberto,
  type PedidoItem,
  type PedidoLinha,
  type PedidoResolvido,
  type PedidoResolvidoLinha,
} from "./pedidos";

// DE ONDE A PÁGINA DE PEDIDOS TIRA OS DADOS (02/10/2026, auditoria F3, R-07).
//
// UMA fonte, usada pela página do servidor (primeira página de cada aba) e pelo
// navegador (próximas páginas, busca e a linha que o realtime mexeu). Antes a
// página e o componente escreviam, cada um, a mesma consulta de handoffs mais a
// de nomes. Duas implementações com o MESMO contrato: o banco
// (`pedidos_pagina`/`pedidos_contagens`, RLS de quem chama) e a memória, só para
// o preview `/design`. A regra pura (nome, ordem, busca) é a de lib/pedidos.ts.

export type AbaPedidos = "abertos" | "resolvidos";

export interface ParamsPedidos {
  aba: AbaPedidos;
  busca: string;
  /** Grafias do número de avisos, só dígitos (`foraDaLista`): nunca é pedido. */
  fora: string[];
}

export interface ContagensPedidos {
  abertos: number;
  resolvidos: number;
}

export const CONTAGENS_PEDIDOS_VAZIAS: ContagensPedidos = { abertos: 0, resolvidos: 0 };

export interface FontePedidos {
  /** Até `n` pedidos da aba depois de `depois` (null = do começo). */
  pagina(p: ParamsPedidos, depois: PedidoItem | null, n?: number): Promise<PedidoItem[]>;
  /** UM pedido pelo id, aberto ou resolvido (a linha que o realtime mexeu). */
  porId(fora: string[], id: number): Promise<PedidoItem | null>;
  /** A fila aberta de UMA conversa, com posição e total refeitos. */
  abertosDoFone(fora: string[], phone: string): Promise<PedidoAberto[]>;
  contagens(fora: string[]): Promise<ContagensPedidos>;
}

export function fonteDoBanco(supabase: Supa, clientId: string): FontePedidos {
  async function chamar(args: ArgsRpc<"pedidos_pagina", "p_client">): Promise<PedidoItem[]> {
    const { data, error } = await supabase.rpc("pedidos_pagina", { p_client: clientId, ...args });
    if (error) throw error;
    return (data ?? []).map(paraPedido);
  }
  return {
    pagina(p, depois, n = PAGINA_PEDIDOS) {
      return chamar({
        p_aba: p.aba,
        p_busca: p.busca.trim() || null,
        p_fora: p.fora,
        // O instante é lido a cada chamada: aba aberta por dias não envelhece.
        p_desde: p.aba === "resolvidos" ? inicioDosResolvidos(Date.now()) : null,
        p_cursor_em: depois ? (ehAberto(depois) ? depois.openedAt : depois.closedAt) : null,
        p_cursor_id: depois?.id ?? null,
        p_limite: n,
      });
    },
    async porId(fora, id) {
      return (await chamar({ p_fora: fora, p_id: id, p_limite: 1 }))[0] ?? null;
    },
    async abertosDoFone(fora, phone) {
      const l = await chamar({ p_aba: "abertos", p_fora: fora, p_telefone: phone, p_limite: 50 });
      return l.filter(ehAberto);
    },
    async contagens(fora) {
      const { data, error } = await supabase.rpc("pedidos_contagens", {
        p_client: clientId,
        p_fora: fora,
        p_desde: inicioDosResolvidos(Date.now()),
      });
      if (error) throw error;
      const c = (data ?? [])[0];
      return c
        ? { abertos: Number(c.abertos) || 0, resolvidos: Number(c.resolvidos) || 0 }
        : CONTAGENS_PEDIDOS_VAZIAS;
    },
  };
}

// ---------------------------------------------------------------------------
// Preview: a mesma regra do SQL sobre listas na memória.
// ---------------------------------------------------------------------------

export function fonteDaMemoria(
  abertosRaw: PedidoLinha[],
  resolvidosRaw: PedidoResolvidoLinha[],
  contatos: ContatoLinha[],
  avisos: string | null
): FontePedidos {
  const abertos = montarFila(abertosRaw, contatos, avisos);
  const resolvidos = montarResolvidos(resolvidosRaw, contatos, avisos);
  return {
    async pagina(p, depois, n = PAGINA_PEDIDOS) {
      const lista: PedidoItem[] = (p.aba === "abertos" ? abertos : resolvidos).filter((x) =>
        casaBuscaPedido(x, p.busca)
      );
      if (!depois) return lista.slice(0, n);
      const ini = lista.findIndex((x) =>
        p.aba === "abertos"
          ? ordemAbertos(x as PedidoAberto, depois as PedidoAberto) > 0
          : ordemResolvidos(x as PedidoResolvido, depois as PedidoResolvido) > 0
      );
      return ini < 0 ? [] : lista.slice(ini, ini + n);
    },
    async porId(_fora, id) {
      return abertos.find((x) => x.id === id) ?? resolvidos.find((x) => x.id === id) ?? null;
    },
    async abertosDoFone(_fora, phone) {
      return abertos.filter((x) => x.phone === phone);
    },
    async contagens() {
      return { abertos: abertos.length, resolvidos: resolvidos.length };
    },
  };
}
