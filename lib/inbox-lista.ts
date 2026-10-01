import { nomeDoContato, diaSP, JANELAS, type JanelaKey } from "./inbox";
import { grafiasDeDigitos } from "./avisos";
import type { InboxItem } from "./types";
import type { LinhaRpc } from "./supabase/schema";

// LISTA DE CONVERSAS PAGINADA (01/10/2026, docs/plano-carregamento.md, fase 1).
//
// Módulo PURO. A lista deixou de baixar até 500 conversas e filtrar na memória:
// ela pede ao banco 10 por vez (`inbox_pagina`), com o recorte, o filtro e a
// busca aplicados LÁ. Aqui moram as peças que o navegador ainda precisa:
// transformar a linha do banco em item, a ORDEM (para encaixar a linha que o
// realtime atualizou sem recarregar nada) e o início da janela de tempo.
//
// ⚠️ A ordem daqui e a do SQL são a MESMA regra escrita duas vezes (o banco
// ordena a página, o navegador reposiciona uma linha). Mudou uma, muda a outra:
// grupo (pedido aberto, time, IA) só na lista inteira sem busca, depois a
// mensagem mais recente, depois o id.

export const PAGINA_INBOX = 10;

export type FiltroInbox = "all" | "unanswered" | "mine" | "needs";

/** A linha que `inbox_pagina` devolve. */
export type LinhaInbox = LinhaRpc<
  "inbox_pagina",
  | "last_message_preview"
  | "last_message_from"
  | "unread_count"
  | "assigned_user_id"
  | "handoff_at"
  | "stage"
  | "display_name"
  | "nomewpp"
  | "atendimento_ia"
  | "foto_path"
  | "resumo"
  | "trecho"
>;

/** O item da lista, com o que a linha precisa além do `InboxItem`. */
export interface ItemLista extends InboxItem {
  id: number;
  grupo: number;
  ia: string | null;
  /** O que a IA entendeu do último pedido (só com pedido aberto). */
  resumo: string | null;
  /** A mensagem que casou com a busca, quando não foi o nome que casou. */
  trecho: string | null;
}

export interface Contagens {
  todas: number;
  esperando: number;
  sem_resposta: number;
  suas: number;
  grupo_time: number;
  grupo_ia: number;
  existe_alguma: boolean;
}

export const CONTAGENS_VAZIAS: Contagens = {
  todas: 0,
  esperando: 0,
  sem_resposta: 0,
  suas: 0,
  grupo_time: 0,
  grupo_ia: 0,
  existe_alguma: false,
};

export interface Cursor {
  grupo: number;
  em: string;
  id: number;
}

export function paraItem(l: LinhaInbox): ItemLista {
  return {
    id: l.id,
    phone: l.phone,
    name: nomeDoContato(l),
    fotoPath: l.foto_path,
    lastPreview: l.last_message_preview ?? "",
    lastFrom: l.last_message_from === "out" ? "out" : "in",
    lastMessageAt: l.last_message_at,
    unread: l.unread_count ?? 0,
    assignedUserId: l.assigned_user_id,
    stage: l.stage,
    handoffAt: l.handoff_at,
    grupo: l.grupo,
    ia: l.atendimento_ia,
    resumo: l.resumo,
    trecho: l.trecho,
  };
}

export function cursorDe(it: ItemLista): Cursor {
  return { grupo: it.grupo, em: it.lastMessageAt, id: it.id };
}

/** Negativo = `a` vem antes de `b`. A mesma ordem do `order by` do SQL. */
export function compararItens(a: Pick<ItemLista, "grupo" | "lastMessageAt" | "id">, b: Pick<ItemLista, "grupo" | "lastMessageAt" | "id">): number {
  if (a.grupo !== b.grupo) return a.grupo - b.grupo;
  const ta = Date.parse(a.lastMessageAt);
  const tb = Date.parse(b.lastMessageAt);
  if (ta !== tb) return tb - ta;
  return b.id - a.id;
}

/**
 * Encaixa a linha que mudou (realtime) sem recarregar a lista.
 *
 * - `linha` nula: a conversa saiu do recorte (foi resolvida, mudou de dono com
 *   o filtro "Suas" ligado): sai da lista.
 * - Com mais páginas por carregar, a linha só entra se cair DENTRO do que já
 *   está na tela. Abaixo do último item ela vai chegar pela rolagem, e
 *   inseri-la agora a faria aparecer duas vezes.
 */
export function encaixar(
  itens: ItemLista[],
  phone: string,
  linha: ItemLista | null,
  temMais: boolean
): ItemLista[] {
  const sem = itens.filter((i) => i.phone !== phone);
  if (!linha) return sem.length === itens.length ? itens : sem;
  const ultimo = sem[sem.length - 1];
  if (temMais && ultimo && compararItens(linha, ultimo) > 0) return sem;
  const pos = sem.findIndex((i) => compararItens(linha, i) < 0);
  if (pos < 0) return [...sem, linha];
  return [...sem.slice(0, pos), linha, ...sem.slice(pos)];
}

/**
 * O instante em que a janela começa: meia-noite de São Paulo do primeiro dia
 * dela. `null` = "Tudo". É o mesmo dia civil de `dentroDaJanela`.
 */
export function inicioDaJanela(janela: JanelaKey, agora: number): string | null {
  const dias = JANELAS[janela].dias;
  return dias == null ? null : inicioDeDias(dias, agora);
}

/**
 * Meia-noite de São Paulo do dia que abre uma janela de `dias` dias civis
 * contando hoje (1 = hoje). Antes dela, a mensagem tem `dias` ou mais dias.
 */
export function inicioDeDias(dias: number, agora: number): string {
  const dia = diaSP(agora - (dias - 1) * 86_400_000);
  const ano = Math.floor(dia / 10000);
  const mes = Math.floor((dia % 10000) / 100);
  const d = dia % 100;
  // Meia-noite de SP em UTC: tenta o deslocamento de hoje (sem horário de
  // verão desde 2019, é -3), confirmando pelo próprio dia civil.
  for (const h of [3, 2, 4]) {
    const t = Date.UTC(ano, mes - 1, d, h);
    if (diaSP(t) === dia && diaSP(t - 3_600_000) !== dia) return new Date(t).toISOString();
  }
  return new Date(Date.UTC(ano, mes - 1, d, 3)).toISOString();
}

/**
 * As grafias do número de avisos, só dígitos, para o `p_fora` do SQL (que
 * compara a parte antes do `@`): com e sem o nono dígito.
 */
export function foraDaLista(destino: string | null | undefined): string[] {
  if (!destino || destino.includes("@g.us")) return [];
  const d = destino.split("@")[0].replace(/\D/g, "");
  if (!d) return [];
  return grafiasDeDigitos(d);
}
