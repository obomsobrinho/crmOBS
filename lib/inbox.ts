import type { ChatRow, InboxItem } from "./types";

// "Você" vem do pushName de mensagens ENVIADAS (fromMe) — nunca é nome de
// contato. Trata isso (e vazios) como "sem nome".
export function cleanName(n: string | null | undefined): string | null {
  const t = n?.trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (low === "você" || low === "voce") return null;
  return t;
}

// Linha crua da tabela `conversations` (o que o inbox lê).
export interface ConvRow {
  phone: string;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_from: string | null;
  unread_count: number | null;
  assigned_user_id: string | null;
}

// Linha crua de `dados_cliente` usada para resolver nome e estado da IA.
export interface ContatoRow {
  telefone: string;
  nomewpp: string | null;
  atendimento_ia: string | null;
  display_name?: string | null;
}

// Monta a lista do inbox a partir das conversas (já ordenadas por
// last_message_at) e do cadastro de contatos. O nome vem de dados_cliente
// (fonte de verdade do contato); sem nome real, a UI mostra o telefone. Puro:
// usado tanto no Server Component quanto no refetch em realtime do cliente.
export function buildInbox(
  convs: ConvRow[],
  contatos: ContatoRow[]
): { items: InboxItem[]; ia: Record<string, string | null> } {
  const nameByPhone = new Map<string, string | null>();
  const ia: Record<string, string | null> = {};
  for (const c of contatos) {
    // display_name (editado no CRM) precede o nomewpp (pushName do WhatsApp).
    nameByPhone.set(c.telefone, cleanName(c.display_name) ?? cleanName(c.nomewpp));
    ia[c.telefone] = c.atendimento_ia ?? null;
  }
  const items: InboxItem[] = convs.map((c) => ({
    phone: c.phone,
    name: nameByPhone.get(c.phone) ?? null,
    lastPreview: c.last_message_preview ?? "",
    lastFrom: c.last_message_from === "out" ? "out" : "in",
    lastMessageAt: c.last_message_at,
    unread: c.unread_count ?? 0,
    assignedUserId: c.assigned_user_id ?? null,
  }));
  return { items, ia };
}

// Melhor nome de contato entre um conjunto de linhas (qualquer ordem).
export function bestName(rows: ChatRow[]): string | null {
  for (const r of rows) {
    const nm = cleanName(r.nomewpp);
    if (nm) return nm;
  }
  return null;
}

// Iniciais para avatar. Retorna null quando não há nome real (a UI mostra um
// ícone de pessoa em vez de "55" derivado do telefone). Centraliza a lógica que
// estava duplicada em ContactSidebar/Thread/ContextPanel.
// Cor de avatar determinística (sólida, sem gradiente) a partir de uma chave
// (telefone/nome). Paleta com saturação controlada — cor sem virar arco-íris.
const AVATAR_COLORS = [
  "#7c4dff",
  "#f97316",
  "#14b8a6",
  "#3b82f6",
  "#e0498a",
  "#0ea5a4",
  "#8b5cf6",
  "#ef6f53",
];

export function avatarColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string | null): string | null {
  const n = cleanName(name);
  if (!n) return null;
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}
