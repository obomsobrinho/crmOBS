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
  /** Handoff em aberto: é o que vira "Sua vez" no card. */
  handoffAt: string | null;
  /** Quem pôs o card nesta coluna: 'ia', 'human' ou null (nunca foi movido). */
  stageSource: "human" | "ia" | null;
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
  qual: Record<string, string>,
  source: Record<string, "human" | "ia" | null> = {}
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
    handoffAt: it.handoffAt ?? null,
    stageSource: source[it.phone] ?? null,
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


// ---------------------------------------------------------------------------
// Texto dos cards (rodada de design de 18/09/2026). Puros de propósito: a regra
// de "o que este card está esperando" é a mesma na tela e no teste.
// ---------------------------------------------------------------------------

/**
 * Idade em palavra, do jeito que o desenho pede: "hoje", "1 dia", "12 dias".
 * ⚠️ Conta DIAS DE CALENDÁRIO em America/Sao_Paulo, e não blocos de 24h: uma
 * mensagem de ontem às 23h é "1 dia" mesmo com duas horas de diferença, porque é
 * assim que a pessoa lê a própria agenda.
 */
export function idadeEmDias(iso: string | null, agora = Date.now()): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const dia = (d: number) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(d));
  const a = dia(ms);
  const b = dia(agora);
  if (a === b) return "hoje";
  const dias = Math.round(
    (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000
  );
  if (dias <= 0) return "hoje";
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/**
 * A linha "de onde veio" no pé do card.
 * ⚠️ O desenho escreve "Ana moveu", com o NOME de quem moveu. O banco não guarda
 * isso: `stage_source` diz só se foi humano ou IA, e o responsável do card não é
 * necessariamente quem arrastou. Então o texto do time é impessoal, porque pôr um
 * nome ali seria inventar um fato sobre uma pessoa.
 */
export function origemDoCard(source: "human" | "ia" | null): string {
  if (source === "ia") return "A IA moveu";
  if (source === "human") return "Movido pelo time";
  return "Entrou pelo WhatsApp";
}

/**
 * Subtítulo da coluna: "mais antigo há 1 dia", "2 esperando você". Devolve null
 * quando não há o que dizer, e a coluna então não desenha a linha.
 */
export function resumoDaColuna(
  cards: PipelineCard[],
  agora = Date.now()
): string | null {
  if (cards.length === 0) return null;
  const partes: string[] = [];
  const esperando = cards.filter((c) => c.handoffAt).length;
  if (esperando > 0)
    partes.push(
      esperando === 1 ? "1 esperando você" : `${esperando} esperando você`
    );
  const antigo = cards
    .map((c) => Date.parse(c.lastMessageAt))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b)[0];
  const idade = antigo ? idadeEmDias(new Date(antigo).toISOString(), agora) : null;
  if (idade && idade !== "hoje") partes.push(`mais antigo há ${idade}`);
  return partes.length ? partes.join(" · ") : null;
}
