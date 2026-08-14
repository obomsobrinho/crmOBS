import type { InboxItem } from "./types";

// Pipeline (funil) do tenant. Módulo puro (sem server-only / supabase): usado no
// Server Component, no board (client) e no /design. A fonte de verdade dos
// estágios é a tabela pipeline_stages; conversations.stage guarda a `key`.

// Estágio como a UI usa (camelCase).
export interface Stage {
  id: number;
  key: string; // slug estável; conversations.stage referencia isto
  name: string; // rótulo exibido
  position: number;
  isCanonical: boolean; // a IA pode setar sozinha
  isDefault: boolean; // onde a conversa nova (stage null) aparece
  archived: boolean;
  color: string;
}

// Linha crua de pipeline_stages.
export interface StageRow {
  id: number;
  key: string;
  name: string;
  position: number;
  is_canonical: boolean;
  is_default: boolean;
  archived: boolean;
  color: string;
}

export function rowToStage(r: StageRow): Stage {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    position: r.position,
    isCanonical: r.is_canonical,
    isDefault: r.is_default,
    archived: r.archived,
    color: r.color,
  };
}

// Card do board = uma conversa. Junta o item do inbox com o resumo da IA (última
// qualificação) e o estado da IA (pausada = precisa de você).
export interface PipelineCard {
  phone: string;
  name: string | null;
  lastPreview: string;
  lastFrom: "in" | "out";
  lastMessageAt: string;
  unread: number;
  assignedUserId: string | null;
  stage: string | null;
  summary: string | null; // resumo da IA (motivo do handoff), se houver
  paused: boolean; // atendimento_ia === 'pause'
}

// Última qualificação (summary) por telefone. A lista já vem do mais recente.
export function lastQualByPhone(
  rows: { phone: string; summary: string | null }[] | null
): Record<string, string> {
  const m: Record<string, string> = {};
  for (const q of rows ?? []) if (!m[q.phone] && q.summary) m[q.phone] = q.summary;
  return m;
}

export function buildCards(
  items: InboxItem[],
  ia: Record<string, string | null>,
  qual: Record<string, string>
): PipelineCard[] {
  return items.map((it) => ({
    phone: it.phone,
    name: it.name,
    lastPreview: it.lastPreview,
    lastFrom: it.lastFrom,
    lastMessageAt: it.lastMessageAt,
    unread: it.unread,
    assignedUserId: it.assignedUserId,
    stage: it.stage,
    summary: qual[it.phone] ?? null,
    paused: ia[it.phone] === "pause",
  }));
}

// Distribui os cards nas colunas (estágios não arquivados, em ordem). Card com
// stage null, desconhecido ou de um estágio arquivado cai na coluna default.
export function stageColumns(
  stages: Stage[],
  cards: PipelineCard[]
): { stage: Stage; cards: PipelineCard[] }[] {
  const active = stages
    .filter((s) => !s.archived)
    .sort((a, b) => a.position - b.position);
  if (active.length === 0) return [];
  const defaultStage = active.find((s) => s.isDefault) ?? active[0];
  const byKey = new Map(active.map((s) => [s.key, s]));
  const buckets = new Map<string, PipelineCard[]>();
  for (const s of active) buckets.set(s.key, []);
  for (const c of cards) {
    const target = c.stage && byKey.has(c.stage) ? c.stage : defaultStage.key;
    buckets.get(target)!.push(c);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }
  return active.map((s) => ({ stage: s, cards: buckets.get(s.key)! }));
}

// Paleta das colunas (sólida, mesma família da identidade). Chave -> cor.
export const STAGE_COLORS: Record<string, string> = {
  gray: "#8b84a6",
  blue: "#3b82f6",
  violet: "#7c4dff",
  amber: "#f59e0b",
  green: "#14b8a6",
  pink: "#e0498a",
  orange: "#f97316",
};
export const STAGE_COLOR_KEYS = Object.keys(STAGE_COLORS);

export function stageColor(color: string): string {
  return STAGE_COLORS[color] ?? STAGE_COLORS.gray;
}

// ---- Movimento automático do card pela IA (/api/agent) ----
// Estágio canônico que uma decisão da IA indica. null = não move o card.
// action=agendar/pausar => a conversa precisa de um humano.
export function stageForAction(action: string): string | null {
  if (action === "agendar" || action === "pausar") return "aguardando_humano";
  return null;
}

// Decide para qual estágio canônico a IA deve mover o card (ou null = no-op).
// Regras: (1) nunca mexe se o humano definiu o stage; (2) nunca mexe se a
// conversa está num estágio não canônico (manual); (3) só AVANÇA (posição
// maior). Segura contra tenant sem esse canônico (renomeou/arquivou a key).
export function nextIaStage(params: {
  action: string;
  currentStage: string | null;
  stageSource: string | null;
  canonical: { key: string; position: number }[]; // canônicos ATIVOS do tenant
}): string | null {
  const { action, currentStage, stageSource, canonical } = params;
  if (stageSource === "human") return null;
  const targetKey = stageForAction(action);
  if (!targetKey) return null;
  const target = canonical.find((s) => s.key === targetKey);
  if (!target) return null;
  const current = currentStage
    ? canonical.find((s) => s.key === currentStage)
    : null;
  if (currentStage && !current) return null; // está num estágio manual
  const currentPos = current ? current.position : -1;
  if (target.position <= currentPos) return null; // só avança
  return target.key;
}

// Remove acentos decompondo (NFD) e tirando os sinais diacríticos.
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Gera um slug (key) estável a partir do nome do estágio, único entre os
// existentes. Sem acento, minúsculo, só [a-z0-9_].
export function slugifyStage(name: string, taken: string[]): string {
  const base =
    stripDiacritics(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "estagio";
  if (!taken.includes(base)) return base;
  let i = 2;
  while (taken.includes(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
