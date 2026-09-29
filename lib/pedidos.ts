// PÁGINA DE PEDIDOS ABERTOS (29/09/2026, docs/plano-pedidos.md).
//
// Módulo PURO: o servidor monta a primeira lista, o browser remonta a cada
// evento de realtime, e o /design desenha com dado falso, os três pela mesma
// função. Nada aqui fecha pedido: quem fecha são as rotas de sempre
// (orientar, resolve e send), todas por `fecharPedido` (lib/handoffs.ts).

import { cleanName } from "./inbox";
import { semNumeroDeAvisos } from "./avisos";
import { respostaDaIa } from "./mensagem";

export interface PedidoLinha {
  id: number;
  phone: string;
  opened_at: string;
  summary: string | null;
}

export interface ContatoLinha {
  telefone: string;
  nomewpp: string | null;
  display_name?: string | null;
}

export interface PedidoAberto {
  id: number;
  phone: string;
  openedAt: string;
  summary: string | null;
  /** Nome do contato, ou null (a tela mostra o telefone). */
  nome: string | null;
  /** Posição na fila DA CONVERSA (1 = o mais antigo dela). */
  posicao: number;
  /** Quantos pedidos abertos a conversa tem. */
  total: number;
}

/**
 * A fila da página: todos os pedidos abertos de todas as conversas, do MAIS
 * ANTIGO para o mais novo (decisão do dono, 29/09/2026: quem espera há mais
 * tempo fica no topo, a mesma ordem da fila "1 de 2" da caixa de escrita).
 * O número de avisos fica fora, como em toda lista (lib/avisos.ts).
 */
export function montarFila(
  pedidos: PedidoLinha[],
  contatos: ContatoLinha[],
  avisos: string | null
): PedidoAberto[] {
  const nomes = new Map<string, string | null>();
  for (const c of contatos) {
    nomes.set(c.telefone, cleanName(c.display_name) ?? cleanName(c.nomewpp));
  }
  const ordenados = semNumeroDeAvisos(pedidos, avisos, (p) => p.phone).sort(
    (a, b) => Date.parse(a.opened_at) - Date.parse(b.opened_at) || a.id - b.id
  );
  const total = new Map<string, number>();
  for (const p of ordenados) total.set(p.phone, (total.get(p.phone) ?? 0) + 1);
  const vistos = new Map<string, number>();
  return ordenados.map((p) => {
    const posicao = (vistos.get(p.phone) ?? 0) + 1;
    vistos.set(p.phone, posicao);
    return {
      id: p.id,
      phone: p.phone,
      openedAt: p.opened_at,
      summary: p.summary,
      nome: nomes.get(p.phone) ?? null,
      posicao,
      total: total.get(p.phone) ?? 1,
    };
  });
}

export interface MensagemContexto {
  autor: "cliente" | "ia" | "time";
  texto: string;
  em: string;
}

/**
 * As últimas mensagens da conversa, para quem vai orientar saber o que o
 * cliente disse sem sair da página. Uma linha de `chat_messages` pode ter a
 * mensagem recebida E a resposta; e o n8n grava um turno de duas mensagens
 * unido por " | ", que aqui volta a ser um balão por mensagem (como no painel).
 * `linhas` em ordem cronológica; devolve as `max` últimas mensagens.
 */
export function mensagensDeContexto(
  linhas: {
    user_message: string | null;
    bot_message: string | null;
    message_type: string | null;
    created_at: string;
  }[],
  max = 6
): MensagemContexto[] {
  const out: MensagemContexto[] = [];
  for (const l of linhas) {
    if (l.user_message?.trim()) {
      out.push({ autor: "cliente", texto: l.user_message.trim(), em: l.created_at });
    }
    if (l.bot_message?.trim()) {
      const autor = respostaDaIa(l) ? "ia" : "time";
      for (const parte of l.bot_message.split(" | ")) {
        if (parte.trim()) out.push({ autor, texto: parte.trim(), em: l.created_at });
      }
    }
  }
  return out.slice(-max);
}
