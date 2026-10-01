import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanName } from "./inbox";
import { inicioDeDias } from "./inbox-lista";
import {
  LIMIAR_FRIO_DIAS,
  casaBusca,
  passaFiltro,
  type ClienteItem,
  type FiltroClientes,
} from "./clientes";

// DE ONDE A TELA DE CLIENTES TIRA OS DADOS (fase 3 do plano de carregamento).
// O banco (`clientes_pagina`/`clientes_contagens`, 10 por vez, busca e filtro
// lá) ou a memória, só para o preview /design. A regra de busca e de filtro do
// SQL é a de `casaBusca`/`passaFiltro` (lib/clientes.ts); a de memória usa as
// próprias funções.

export const PAGINA_CLIENTES = 10;

export interface ParamsClientes {
  filtro: FiltroClientes;
  busca: string;
  fora: string[];
  /** Meia-noite de hoje em SP: "em conversa" é mensagem daí em diante. */
  hoje: string;
  /** Antes disso, a última mensagem tem 60+ dias civis: contato frio. */
  frioAntes: string;
}

export interface ContagensClientes {
  todos: number;
  conversa: number;
  frio: number;
  nunca: number;
  incompleto: number;
}

export const CONTAGENS_CLIENTES_VAZIAS: ContagensClientes = {
  todos: 0,
  conversa: 0,
  frio: 0,
  nunca: 0,
  incompleto: 0,
};

export function paramsClientes(
  filtro: FiltroClientes,
  busca: string,
  fora: string[],
  agora: number
): ParamsClientes {
  return {
    filtro,
    busca,
    fora,
    hoje: inicioDeDias(1, agora),
    frioAntes: inicioDeDias(LIMIAR_FRIO_DIAS, agora),
  };
}

/** A linha que `clientes_pagina` devolve. */
interface LinhaCliente {
  id: number;
  telefone: string;
  nomewpp: string | null;
  display_name: string | null;
  atendimento_ia: string | null;
  custom_fields: Record<string, unknown> | null;
  email: string | null;
  birth_date: string | null;
  foto_path: string | null;
  conversa_id: number | null;
  last_message_at: string | null;
  assigned_user_id: string | null;
  tags: { name: string; color: string | null }[] | null;
  k: string;
}

function paraCliente(l: LinhaCliente): ClienteItem {
  return {
    id: l.id,
    phone: l.telefone,
    name: cleanName(l.display_name) ?? cleanName(l.nomewpp),
    nomeCadastrado: !!l.display_name?.trim(),
    lastMessageAt: l.last_message_at,
    conversationId: l.conversa_id,
    pausada: l.atendimento_ia === "pause",
    temAtendente: !!l.assigned_user_id,
    tags: l.tags ?? [],
    campos: Object.values(l.custom_fields ?? {})
      .map((v) => (v == null ? "" : String(v)))
      .filter(Boolean),
    email: l.email,
    birthDate: l.birth_date,
    fotoPath: l.foto_path,
    ordem: l.k,
  };
}

export interface FonteClientes {
  pagina(p: ParamsClientes, depois: ClienteItem | null, n?: number): Promise<ClienteItem[]>;
  contagens(p: ParamsClientes): Promise<ContagensClientes>;
}

export function fonteClientesDoBanco(supabase: SupabaseClient, clientId: string): FonteClientes {
  return {
    async pagina(p, depois, n = PAGINA_CLIENTES) {
      const { data, error } = await supabase.rpc("clientes_pagina", {
        p_client: clientId,
        p_filtro: p.filtro,
        p_busca: p.busca.trim() || null,
        p_fora: p.fora,
        p_hoje: p.hoje,
        p_frio_antes: p.frioAntes,
        p_cursor_em: depois ? depois.ordem ?? "-infinity" : null,
        p_cursor_id: depois?.id ?? null,
        p_limite: n,
      });
      if (error) throw error;
      return ((data ?? []) as LinhaCliente[]).map(paraCliente);
    },
    async contagens(p) {
      const { data, error } = await supabase.rpc("clientes_contagens", {
        p_client: clientId,
        p_fora: p.fora,
        p_hoje: p.hoje,
        p_frio_antes: p.frioAntes,
      });
      if (error) throw error;
      const c = ((data ?? []) as Record<keyof ContagensClientes, number | string>[])[0];
      if (!c) return CONTAGENS_CLIENTES_VAZIAS;
      return {
        todos: Number(c.todos) || 0,
        conversa: Number(c.conversa) || 0,
        frio: Number(c.frio) || 0,
        nunca: Number(c.nunca) || 0,
        incompleto: Number(c.incompleto) || 0,
      };
    },
  };
}

// --- Preview: as funções puras de lib/clientes.ts sobre a lista na memória ---

function k(c: ClienteItem): number {
  const t = c.lastMessageAt ? Date.parse(c.lastMessageAt) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
}

function antes(a: ClienteItem, b: ClienteItem): number {
  return k(b) - k(a) || b.id - a.id;
}

export function fonteClientesDaMemoria(todos: ClienteItem[], agora: number): FonteClientes {
  const ordenados = [...todos].sort(antes);
  return {
    async pagina(p, depois, n = PAGINA_CLIENTES) {
      const lista = ordenados.filter((c) => passaFiltro(c, p.filtro, agora) && casaBusca(c, p.busca));
      const ini = depois ? lista.findIndex((c) => antes(c, depois) > 0) : 0;
      return ini < 0 ? [] : lista.slice(ini, ini + n);
    },
    async contagens() {
      return {
        todos: todos.length,
        conversa: todos.filter((c) => passaFiltro(c, "conversa", agora)).length,
        frio: todos.filter((c) => passaFiltro(c, "frio", agora)).length,
        nunca: todos.filter((c) => passaFiltro(c, "nunca", agora)).length,
        incompleto: todos.filter((c) => passaFiltro(c, "incompleto", agora)).length,
      };
    },
  };
}
