import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONTAGENS_VAZIAS,
  PAGINA_INBOX,
  compararItens,
  paraItem,
  type Contagens,
  type Cursor,
  type FiltroInbox,
  type ItemLista,
  type LinhaInbox,
} from "./inbox-lista";
import { normalizar } from "./clientes";

// DE ONDE A LISTA DE CONVERSAS TIRA OS DADOS (fase 1 do plano de carregamento).
//
// Duas fontes com o MESMO contrato: o banco (`inbox_pagina` e `inbox_contagens`,
// as funções SQL, com RLS de quem chama) e a memória, que existe só para o
// preview `/design`, sem sessão. A de memória imita o SQL; quem prova o SQL de
// verdade é a suíte com login.

export interface ParamsLista {
  inicio: string | null;
  filtro: FiltroInbox;
  busca: string;
  eu: string | null;
  fora: string[];
}

export interface FonteInbox {
  pagina(p: ParamsLista, cursor: Cursor | null, limite?: number): Promise<ItemLista[]>;
  /** Uma conversa só, com o recorte de agora: `null` = saiu do recorte. */
  linha(p: ParamsLista, phone: string): Promise<ItemLista | null>;
  contagens(p: Omit<ParamsLista, "filtro" | "busca">): Promise<Contagens>;
}

function argsPagina(clientId: string, p: ParamsLista) {
  return {
    p_client: clientId,
    p_inicio: p.inicio,
    p_filtro: p.filtro,
    p_eu: p.eu,
    p_busca: p.busca.trim() || null,
    p_fora: p.fora,
  };
}

export function fonteDoBanco(supabase: SupabaseClient, clientId: string): FonteInbox {
  return {
    async pagina(p, cursor, limite = PAGINA_INBOX) {
      const { data, error } = await supabase.rpc("inbox_pagina", {
        ...argsPagina(clientId, p),
        p_cursor_grupo: cursor?.grupo ?? null,
        p_cursor_em: cursor?.em ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_limite: limite,
      });
      if (error) throw error;
      return ((data ?? []) as LinhaInbox[]).map(paraItem);
    },
    async linha(p, phone) {
      const { data, error } = await supabase.rpc("inbox_pagina", {
        ...argsPagina(clientId, p),
        p_telefone: phone,
        p_limite: 1,
      });
      if (error) throw error;
      const l = ((data ?? []) as LinhaInbox[])[0];
      return l ? paraItem(l) : null;
    },
    async contagens(p) {
      const { data, error } = await supabase.rpc("inbox_contagens", {
        p_client: clientId,
        p_inicio: p.inicio,
        p_eu: p.eu,
        p_fora: p.fora,
      });
      if (error) throw error;
      const c = ((data ?? []) as Contagens[])[0];
      return c ? normalizarContagens(c) : CONTAGENS_VAZIAS;
    },
  };
}

function normalizarContagens(c: Contagens): Contagens {
  return {
    todas: Number(c.todas) || 0,
    esperando: Number(c.esperando) || 0,
    sem_resposta: Number(c.sem_resposta) || 0,
    suas: Number(c.suas) || 0,
    grupo_time: Number(c.grupo_time) || 0,
    grupo_ia: Number(c.grupo_ia) || 0,
    existe_alguma: !!c.existe_alguma,
  };
}

// ---------------------------------------------------------------------------
// Preview: a mesma regra do SQL, sobre uma lista na memória.
// ---------------------------------------------------------------------------

function dentro(it: ItemLista, inicio: string | null): boolean {
  return inicio == null || it.handoffAt != null || Date.parse(it.lastMessageAt) >= Date.parse(inicio);
}

function grupoDe(it: ItemLista, p: ParamsLista): number {
  if (p.filtro !== "all" || p.busca.trim()) return 0;
  if (it.handoffAt) return 0;
  return it.assignedUserId ? 1 : 2;
}

export function fonteDaMemoria(
  todos: ItemLista[],
  mensagens: { phone: string; texto: string }[] = []
): FonteInbox {
  const filtrar = (p: ParamsLista): ItemLista[] => {
    const q = normalizar(p.busca.trim());
    const dig = p.busca.replace(/\D/g, "");
    return todos
      .map((it) => ({ ...it, grupo: grupoDe(it, p), trecho: null as string | null }))
      .filter((it) => {
        if (!q && !dentro(it, p.inicio)) return false;
        if (p.filtro === "needs" && !it.handoffAt) return false;
        if (p.filtro === "unanswered" && it.lastFrom !== "in") return false;
        if (p.filtro === "mine" && (!p.eu || it.assignedUserId !== p.eu)) return false;
        return true;
      })
      .flatMap((it) => {
        if (!q) return [it];
        const porNome = normalizar(it.name ?? "").includes(q) || (dig.length >= 3 && it.phone.includes(dig));
        if (porNome) return [it];
        const m = q.length >= 2 ? mensagens.find((x) => x.phone === it.phone && normalizar(x.texto).includes(q)) : null;
        return m ? [{ ...it, trecho: m.texto }] : [];
      })
      .sort(compararItens);
  };
  return {
    async pagina(p, cursor, limite = PAGINA_INBOX) {
      const lista = filtrar(p);
      if (!cursor) return lista.slice(0, limite);
      const ref = { grupo: cursor.grupo, lastMessageAt: cursor.em, id: cursor.id };
      const ini = lista.findIndex((i) => compararItens(i, ref) > 0);
      return ini < 0 ? [] : lista.slice(ini, ini + limite);
    },
    async linha(p, phone) {
      return filtrar(p).find((i) => i.phone === phone) ?? null;
    },
    async contagens(p) {
      const base = todos.filter((it) => dentro(it, p.inicio));
      const naJanela = (it: ItemLista) => p.inicio == null || Date.parse(it.lastMessageAt) >= Date.parse(p.inicio);
      return {
        todas: base.length,
        esperando: todos.filter((it) => it.handoffAt).length,
        sem_resposta: base.filter((it) => it.lastFrom === "in").length,
        suas: p.eu ? base.filter((it) => it.assignedUserId === p.eu).length : 0,
        grupo_time: todos.filter((it) => naJanela(it) && !it.handoffAt && it.assignedUserId).length,
        grupo_ia: todos.filter((it) => naJanela(it) && !it.handoffAt && !it.assignedUserId).length,
        existe_alguma: todos.length > 0,
      };
    },
  };
}
