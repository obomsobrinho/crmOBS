// PÁGINA DE PEDIDOS ABERTOS (29/09/2026, docs/plano-pedidos.md).
//
// Módulo PURO: o servidor monta a primeira lista, o browser remonta a cada
// evento de realtime, e o /design desenha com dado falso, os três pela mesma
// função. Nada aqui fecha pedido: quem fecha são as rotas de sempre
// (orientar, resolve e send), todas por `fecharPedido` (lib/handoffs.ts).

import { cleanName } from "./inbox";
import { semNumeroDeAvisos } from "./avisos";

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

// ---------------------------------------------------------------------------
// HISTÓRICO DE RESOLVIDOS (30/09/2026, docs/plano-fechar-p0.md, itens 1 e 2).
// ---------------------------------------------------------------------------

/** Quantos dias de resolvidos a página mostra (D5 do dono, 30/09/2026). */
export const DIAS_DE_RESOLVIDOS = 30;

/** O instante mais antigo de resolução que a página traz. */
export function inicioDosResolvidos(agora: number): string {
  return new Date(agora - DIAS_DE_RESOLVIDOS * 86_400_000).toISOString();
}

export interface PedidoResolvidoLinha {
  id: number;
  phone: string;
  opened_at: string;
  summary: string | null;
  instruction: string | null;
  closed_at: string;
  closed_how: string | null;
  closed_by: string | null;
}

export interface PedidoResolvido {
  id: number;
  phone: string;
  openedAt: string;
  closedAt: string;
  summary: string | null;
  nome: string | null;
  /** `ia` = orientado e a IA respondeu; `resolvido` = alguém do time fechou. */
  como: "ia" | "resolvido" | null;
  /** A orientação que o time deu, quando foi por ela. */
  orientacao: string | null;
  /** Quem fechou (user id), para a tela nomear pelo membro. */
  porQuem: string | null;
}

/**
 * Os resolvidos, do MAIS RECENTE para o mais antigo (é histórico: o que acabou
 * de acontecer vem primeiro, ao contrário da fila dos abertos). O número de
 * avisos fica fora, como em toda lista.
 */
export function montarResolvidos(
  linhas: PedidoResolvidoLinha[],
  contatos: ContatoLinha[],
  avisos: string | null
): PedidoResolvido[] {
  const nomes = new Map<string, string | null>();
  for (const c of contatos) {
    nomes.set(c.telefone, cleanName(c.display_name) ?? cleanName(c.nomewpp));
  }
  return semNumeroDeAvisos(linhas, avisos, (p) => p.phone)
    .sort((a, b) => Date.parse(b.closed_at) - Date.parse(a.closed_at) || b.id - a.id)
    .map((p) => ({
      id: p.id,
      phone: p.phone,
      openedAt: p.opened_at,
      closedAt: p.closed_at,
      summary: p.summary,
      nome: nomes.get(p.phone) ?? null,
      como: p.closed_how === "ia" || p.closed_how === "resolvido" ? p.closed_how : null,
      orientacao: p.instruction?.trim() || null,
      porQuem: p.closed_by,
    }));
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Busca por cliente (nome ou telefone) e pelo que foi pedido. */
export function casaBuscaPedido(
  p: { nome: string | null; phone: string; summary: string | null },
  q: string
): boolean {
  const nq = normalizar(q.trim());
  if (!nq) return true;
  if (normalizar([p.nome, p.summary].filter(Boolean).join(" ")).includes(nq)) return true;
  const dq = q.replace(/\D/g, "");
  return dq.length >= 2 && p.phone.replace(/\D/g, "").includes(dq);
}
