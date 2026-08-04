// Tipos e utilitários das entidades do CRM (tags, notas, respostas rápidas,
// campos personalizados). Tabelas donas do CRM: o browser faz CRUD direto via
// RLS por tenant (não passa pelo n8n).

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface ConversationNote {
  id: number;
  body: string;
  authorUserId: string | null;
  createdAt: string;
}

export interface QuickReply {
  id: number;
  title: string;
  body: string;
}

// Qualificação produzida pela IA (gravada por /api/agent em
// conversation_qualifications). O CRM só lê. Usada para explicar por que a
// conversa caiu em "Precisa de você" e mostrar o resumo do caso.
export type QualAction = "none" | "agendar" | "pausar";

export interface Qualification {
  action: QualAction;
  summary: string;
  preferenciaHorario: string;
  createdAt: string;
}

// Rótulo curto do motivo do handoff, para lista e painel.
export function qualReasonLabel(action: QualAction): string {
  if (action === "agendar") return "Marcar conversa com o time";
  if (action === "pausar") return "Pediu uma pessoa do time";
  return "";
}

// Documento da base de conhecimento (RAG). O CRM lista/gerencia; o processamento
// (extração, chunk, embedding) roda no servidor.
export interface KnowledgeDoc {
  id: string;
  title: string;
  status: "processing" | "ready" | "error";
  chunkCount: number;
  byteSize: number | null;
  error: string | null;
  createdAt: string;
}

export function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Paleta fixa de cores das tags (chave guardada em tags.color).
export const TAG_COLORS: Record<string, string> = {
  purple: "#7c4dff",
  green: "#16a34a",
  amber: "#b45309",
  red: "#dc2626",
  blue: "#3b82f6",
  gray: "#6b7280",
};
export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS);

export function tagColor(color: string): string {
  return TAG_COLORS[color] ?? TAG_COLORS.gray;
}

// Campos personalizados: guardados como objeto jsonb (chave -> valor). A UI
// edita como lista ordenada de pares.
export interface CustomField {
  key: string;
  value: string;
}

export function customFieldsToList(
  cf: Record<string, unknown> | null | undefined
): CustomField[] {
  if (!cf) return [];
  return Object.entries(cf).map(([key, value]) => ({
    key,
    value: value == null ? "" : String(value),
  }));
}

export function listToCustomFields(list: CustomField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of list) {
    const k = key.trim();
    if (k) out[k] = value.trim();
  }
  return out;
}
