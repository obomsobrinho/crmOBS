import type { Supa } from "@/lib/supabase/tipos";
import type { ArgsRpc } from "@/lib/supabase/schema";
import {
  PAGINA_PEDIDOS,
  casaBuscaPedido,
  casaMotivo,
  ehAberto,
  inicioDosResolvidos,
  montarFila,
  montarResolvidos,
  ordemAbertos,
  ordemResolvidos,
  paraPedido,
  podeVirarRegra,
  type ContatoLinha,
  type PedidoAberto,
  type PedidoItem,
  type PedidoLinha,
  type PedidoResolvido,
  type PedidoResolvidoLinha,
} from "./pedidos";
import {
  COLUNAS_HISTORIA,
  FILTRO_DE_RESPOSTA,
  FILTRO_DO_CLIENTE,
  LINHAS_ANTES,
  LINHAS_DEPOIS,
  MENSAGENS_DURANTE,
  fimDepois,
  inicioAntes,
  inicioDepois,
  janelaDoPedido,
  mensagensDurante,
  mensagensQueLevaram,
  recorteAntes,
  recorteDurante,
  recorteDepois,
  type HistoriaDoPedido,
  type LinhaHistoria,
} from "./historia-do-pedido";
import { MANUAL } from "./mensagem";

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
  /** Filtro por motivo (chave de lib/motivos.ts); ausente/null = todos. */
  motivo?: string | null;
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
  /** Os números das abas, seguindo o filtro de motivo (senão a aba mentiria). */
  contagens(fora: string[], motivo?: string | null): Promise<ContagensPedidos>;
  /**
   * A história de UM pedido (lib/historia-do-pedido.ts): só quando ele é aberto,
   * nunca na lista. Três consultas pequenas por `client_id` + `phone` + janela.
   */
  historia(p: PedidoItem): Promise<HistoriaComRegra>;
}

/**
 * A história mais `regraSalvaEm` (P1 item 5): quando a orientação deste pedido
 * virou regra do agente, ou null. Vem JUNTO das mensagens (mesmo `Promise.all`),
 * e só é lida para um pedido que pode virar regra (`podeVirarRegra`).
 */
export type HistoriaComRegra = HistoriaDoPedido & { regraSalvaEm: string | null };

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
        p_motivo: p.motivo ?? null,
      });
    },
    async porId(fora, id) {
      return (await chamar({ p_fora: fora, p_id: id, p_limite: 1 }))[0] ?? null;
    },
    async abertosDoFone(fora, phone) {
      const l = await chamar({ p_aba: "abertos", p_fora: fora, p_telefone: phone, p_limite: 50 });
      return l.filter(ehAberto);
    },
    async contagens(fora, motivo) {
      const { data, error } = await supabase.rpc("pedidos_contagens", {
        p_client: clientId,
        p_fora: fora,
        p_desde: inicioDosResolvidos(Date.now()),
        p_motivo: motivo ?? null,
      });
      if (error) throw error;
      const c = (data ?? [])[0];
      return c
        ? { abertos: Number(c.abertos) || 0, resolvidos: Number(c.resolvidos) || 0 }
        : CONTAGENS_PEDIDOS_VAZIAS;
    },
    async historia(p) {
      const janela = janelaDoPedido(p);
      // A base das três leituras: as linhas desta conversa, colunas explícitas.
      const linhas = () =>
        supabase.from("chat_messages").select(COLUNAS_HISTORIA).eq("client_id", clientId).eq("phone", p.phone);
      const doCliente = "user_message.not.is.null,media_url.not.is.null";
      // O limite do "durante" conta SÓ linhas do cliente (`FILTRO_DO_CLIENTE` = `linhaDoCliente`).
      const durante = linhas().gte("created_at", janela.openedAt).or(FILTRO_DO_CLIENTE);
      // "Depois" lê só RESPOSTAS: resolvido, da IA ou do time na janela; aberto, só do
      // time (envio manual), da abertura em diante (ninguém respondeu o pedido ainda).
      const respostas = janela.closedAt
        ? linhas()
            .gte("created_at", inicioDepois(janela))
            .lte("created_at", fimDepois(janela))
            .or(FILTRO_DE_RESPOSTA)
        : linhas().gte("created_at", janela.openedAt).eq("message_type", MANUAL);
      // O MESMO recorte de `recorteAntes`/`recorteDurante`/`recorteDepois` (a memória do /design).
      const [antes, enquanto, depois, regra] = await Promise.all([
        linhas()
          .gte("created_at", inicioAntes(janela))
          .lt("created_at", janela.openedAt)
          .or(doCliente)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(LINHAS_ANTES),
        // As 10 mais NOVAS do período de espera, e uma a mais para saber se cortou.
        (janela.closedAt ? durante.lte("created_at", janela.closedAt) : durante)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(MENSAGENS_DURANTE + 1),
        respostas
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(LINHAS_DEPOIS),
        podeVirarRegra(p)
          ? supabase.from("handoffs").select("regra_salva_em").eq("client_id", clientId).eq("id", p.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (antes.error) throw antes.error;
      if (enquanto.error) throw enquanto.error;
      if (depois.error) throw depois.error;
      if (regra.error) throw regra.error;
      return {
        antes: mensagensQueLevaram(antes.data ?? []),
        ...mensagensDurante(enquanto.data ?? []),
        depois: depois.data ?? [],
        regraSalvaEm: regra.data?.regra_salva_em ?? null,
      };
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
  avisos: string | null,
  /** As linhas falsas de `chat_messages`, por telefone (a história do pedido). */
  mensagens: Record<string, LinhaHistoria[]> = {},
  /** Pedidos cuja orientação já virou regra (id -> quando). */
  regrasSalvas: Record<number, string> = {}
): FontePedidos {
  const abertos = montarFila(abertosRaw, contatos, avisos);
  const resolvidos = montarResolvidos(resolvidosRaw, contatos, avisos);
  return {
    async pagina(p, depois, n = PAGINA_PEDIDOS) {
      const lista: PedidoItem[] = (p.aba === "abertos" ? abertos : resolvidos).filter(
        (x) => casaBuscaPedido(x, p.busca) && casaMotivo(x, p.motivo)
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
    async contagens(_fora, motivo) {
      return {
        abertos: abertos.filter((x) => casaMotivo(x, motivo)).length,
        resolvidos: resolvidos.filter((x) => casaMotivo(x, motivo)).length,
      };
    },
    async historia(p) {
      const linhas = mensagens[p.phone] ?? [];
      const janela = janelaDoPedido(p);
      return {
        antes: recorteAntes(linhas, janela),
        ...recorteDurante(linhas, janela),
        depois: recorteDepois(linhas, janela),
        regraSalvaEm: regrasSalvas[p.id] ?? null,
      };
    },
  };
}
