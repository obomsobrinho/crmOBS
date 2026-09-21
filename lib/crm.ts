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

/**
 * Quem está atendendo uma conversa. UMA pergunta, três respostas possíveis.
 *
 * A regra mora aqui porque a lista de conversas e o board do pipeline desenham o
 * mesmo indicador, e duas cópias da mesma regra é o começo de duas telas
 * discordando sobre o mesmo contato.
 *
 * A invariante que faz isso ter resposta única: **IA e pessoa nunca atendem a
 * mesma conversa ao mesmo tempo.** Quando alguém responde, a IA é pausada (pelo
 * nó "Pausar IA (Franck digitou)" do n8n, se a resposta saiu do WhatsApp, ou pelo
 * `POST /api/send`, se saiu do CRM).
 *
 * ⚠️ Desde 19/09/2026 a invariante vale no BANCO nos DOIS sentidos, e não só no
 * envio: **atribuir pausa a IA** e **religar a IA larga o responsável**
 * (`components/ConversationView.tsx`, mais o `POST /api/conversations/resolve`).
 * Antes disso, esta função era a única coisa impedindo a tela de mostrar as duas
 * coisas ao mesmo tempo, e o banco guardava o estado contraditório assim mesmo.
 *
 * ⚠️ Isto NÃO responde "precisa de você": essa é outra pergunta, e quem responde
 * é `handoff_at`. As duas coexistem de propósito, porque pausar não resolve a
 * pendência: dá para ter uma pessoa atendendo E um handoff em aberto.
 */
export type QuemAtende = "ia" | "pessoa" | "ninguem";

export function quemAtende(input: {
  /** dados_cliente.atendimento_ia === 'pause' */
  pausada: boolean;
  /** Existe alguém do time responsável (conversations.assigned_user_id). */
  temAtendente: boolean;
}): QuemAtende {
  if (!input.pausada) return "ia";
  // Pausada e sem responsável = ninguém atende. É o estado dos contatos que
  // ficaram travados pelo handoff antigo, e mostrar isso é o ponto: a dívida
  // vira lista de tarefas visível em vez de silêncio.
  return input.temAtendente ? "pessoa" : "ninguem";
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

/**
 * Teto de tamanho do documento da base de conhecimento.
 *
 * ⚠️ MORA AQUI porque a tela e o servidor discordavam (achado de 21/09/2026): a
 * área de envio prometia "até 8 MB" e a rota recusava só acima de 20 MB, com a
 * mensagem de erro citando 20. Duas verdades sobre o mesmo limite é como alguém
 * sobe um arquivo de 15 MB depois de ler que o teto era 8.
 *
 * Ficou no MENOR dos dois, e não no maior: 8 MB é o número que a tela promete há
 * tempo, e alinhar por cima aumentaria em silêncio um limite que ninguém pediu
 * para aumentar. Documento grande vira muitos trechos, e todo trecho é
 * embedding pago no processamento.
 */
export const KNOWLEDGE_MAX_BYTES = 8 * 1024 * 1024;
export const KNOWLEDGE_MAX_LABEL = "8 MB";
