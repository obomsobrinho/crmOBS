import type { SupabaseClient } from "@supabase/supabase-js";
import { nomeDoContato } from "./inbox";
import { normalizar } from "./clientes";
import type { PipelineCard, Stage } from "./pipeline";

// DE ONDE O PIPELINE TIRA OS CARDS (01/10/2026, docs/plano-carregamento.md,
// fase 5). Cada COLUNA busca os próprios cards, 10 por vez (`pipeline_coluna`),
// e os números de cada coluna vêm do banco (`pipeline_contagens`). A memória
// existe só para o preview /design. A coluna efetiva do card é a de
// `stageColumns`: o estágio dele se estiver ativo, senão a coluna padrão.

export const PAGINA_PIPELINE = 10;

export interface ParamsPipeline {
  padrao: string;
  ativos: string[];
  busca: string;
  /** "all", "none" ou o id do atendente. */
  atendente: string;
  soEsperando: boolean;
  fora: string[];
}

export interface NumerosColuna {
  total: number;
  esperando: number;
  maisAntigo: string | null;
}

export interface ContagensPipeline {
  porColuna: Record<string, NumerosColuna>;
  /** Quantos esperam você no funil inteiro, sem filtro nenhum. */
  esperandoGeral: number;
}

export const CONTAGENS_PIPELINE_VAZIAS: ContagensPipeline = { porColuna: {}, esperandoGeral: 0 };

/** O recorte das colunas a partir dos estágios ativos. `null` = nenhum estágio. */
export function paramsPipeline(
  stages: Stage[],
  filtros: Omit<ParamsPipeline, "padrao" | "ativos">
): ParamsPipeline | null {
  const ativos = stages.filter((s) => !s.archived).sort((a, b) => a.position - b.position);
  if (ativos.length === 0) return null;
  const padrao = (ativos.find((s) => s.isDefault) ?? ativos[0]).key;
  return { padrao, ativos: ativos.map((s) => s.key), ...filtros };
}

interface LinhaCard {
  id: number;
  phone: string;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_from: string | null;
  unread_count: number | null;
  assigned_user_id: string | null;
  coluna: string;
  stage_source: string | null;
  handoff_at: string | null;
  display_name: string | null;
  nomewpp: string | null;
  atendimento_ia: string | null;
  foto_path: string | null;
  resumo: string | null;
}

function paraCard(l: LinhaCard): PipelineCard {
  return {
    id: l.id,
    phone: l.phone,
    name: nomeDoContato(l),
    lastPreview: l.last_message_preview ?? "",
    lastFrom: l.last_message_from === "out" ? "out" : "in",
    lastMessageAt: l.last_message_at,
    unread: l.unread_count ?? 0,
    assignedUserId: l.assigned_user_id,
    stage: l.coluna,
    summary: l.resumo,
    paused: l.atendimento_ia === "pause",
    handoffAt: l.handoff_at,
    stageSource: l.stage_source === "human" || l.stage_source === "ia" ? l.stage_source : null,
  };
}

/** Negativo = `a` vem antes de `b` na coluna (a mesma ordem do SQL). */
export function compararCards(a: PipelineCard, b: PipelineCard): number {
  const ta = Date.parse(a.lastMessageAt);
  const tb = Date.parse(b.lastMessageAt);
  if (ta !== tb) return tb - ta;
  return (b.id ?? 0) - (a.id ?? 0);
}

export interface FontePipeline {
  coluna(p: ParamsPipeline, coluna: string, depois: PipelineCard | null, n?: number): Promise<PipelineCard[]>;
  /** Um card só, com a coluna efetiva dele; `null` = saiu do recorte. */
  card(p: ParamsPipeline, phone: string): Promise<PipelineCard | null>;
  contagens(p: ParamsPipeline): Promise<ContagensPipeline>;
}

function argsBase(clientId: string, p: ParamsPipeline) {
  return {
    p_client: clientId,
    p_padrao: p.padrao,
    p_ativos: p.ativos,
    p_busca: p.busca.trim() || null,
    p_atendente: p.atendente,
    p_so_esperando: p.soEsperando,
    p_fora: p.fora,
  };
}

export function fontePipelineDoBanco(supabase: SupabaseClient, clientId: string): FontePipeline {
  return {
    async coluna(p, coluna, depois, n = PAGINA_PIPELINE) {
      const { data, error } = await supabase.rpc("pipeline_coluna", {
        ...argsBase(clientId, p),
        p_coluna: coluna,
        p_cursor_em: depois?.lastMessageAt ?? null,
        p_cursor_id: depois?.id ?? null,
        p_limite: n,
      });
      if (error) throw error;
      return ((data ?? []) as LinhaCard[]).map(paraCard);
    },
    async card(p, phone) {
      const { data, error } = await supabase.rpc("pipeline_coluna", {
        ...argsBase(clientId, p),
        p_coluna: null,
        p_telefone: phone,
        p_limite: 1,
      });
      if (error) throw error;
      const l = ((data ?? []) as LinhaCard[])[0];
      return l ? paraCard(l) : null;
    },
    async contagens(p) {
      const { data, error } = await supabase.rpc("pipeline_contagens", argsBase(clientId, p));
      if (error) throw error;
      const out: ContagensPipeline = { porColuna: {}, esperandoGeral: 0 };
      for (const r of (data ?? []) as { coluna: string; total: number; esperando: number; mais_antigo: string | null }[]) {
        if (r.coluna === "*") out.esperandoGeral = Number(r.esperando) || 0;
        else out.porColuna[r.coluna] = { total: Number(r.total) || 0, esperando: Number(r.esperando) || 0, maisAntigo: r.mais_antigo };
      }
      return out;
    },
  };
}

// --- Preview: a mesma regra sobre os cards na memória ---

export function fontePipelineDaMemoria(todos: PipelineCard[]): FontePipeline {
  const efetiva = (c: PipelineCard, p: ParamsPipeline) =>
    c.stage && p.ativos.includes(c.stage) ? c.stage : p.padrao;
  const passa = (c: PipelineCard, p: ParamsPipeline) => {
    if (p.soEsperando && !c.handoffAt) return false;
    if (p.atendente === "none" && c.assignedUserId) return false;
    if (p.atendente !== "all" && p.atendente !== "none" && c.assignedUserId !== p.atendente) return false;
    const q = normalizar(p.busca.trim());
    if (q) {
      const dig = p.busca.replace(/\D/g, "");
      if (!normalizar(c.name ?? "").includes(q) && !(dig.length >= 3 && c.phone.includes(dig))) return false;
    }
    return true;
  };
  const lista = (p: ParamsPipeline) =>
    todos.filter((c) => passa(c, p)).map((c) => ({ ...c, stage: efetiva(c, p) })).sort(compararCards);
  return {
    async coluna(p, coluna, depois, n = PAGINA_PIPELINE) {
      const daColuna = lista(p).filter((c) => c.stage === coluna);
      const ini = depois ? daColuna.findIndex((c) => compararCards(c, depois) > 0) : 0;
      return ini < 0 ? [] : daColuna.slice(ini, ini + n);
    },
    async card(p, phone) {
      return lista(p).find((c) => c.phone === phone) ?? null;
    },
    async contagens(p) {
      const out: ContagensPipeline = {
        porColuna: {},
        esperandoGeral: todos.filter((c) => c.handoffAt).length,
      };
      for (const c of lista(p)) {
        const n = (out.porColuna[c.stage!] ??= { total: 0, esperando: 0, maisAntigo: null });
        n.total++;
        if (c.handoffAt) n.esperando++;
        if (!n.maisAntigo || Date.parse(c.lastMessageAt) < Date.parse(n.maisAntigo)) n.maisAntigo = c.lastMessageAt;
      }
      return out;
    },
  };
}

/** A primeira página de cada coluna e os números: o que o servidor entrega. */
export async function primeirasColunas(
  fonte: FontePipeline,
  p: ParamsPipeline | null
): Promise<{
  colunas: Record<string, { cards: PipelineCard[]; temMais: boolean; carregando: boolean }>;
  contagens: ContagensPipeline;
}> {
  if (!p) return { colunas: {}, contagens: CONTAGENS_PIPELINE_VAZIAS };
  const [listas, contagens] = await Promise.all([
    Promise.all(p.ativos.map((k) => fonte.coluna(p, k, null))),
    fonte.contagens(p),
  ]);
  return {
    colunas: Object.fromEntries(
      p.ativos.map((k, i) => [k, { cards: listas[i], temMais: listas[i].length === PAGINA_PIPELINE, carregando: false }])
    ),
    contagens,
  };
}
