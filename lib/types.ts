// Schema real usado pelo n8n + Evolution.

// Uma linha = uma troca: user_message (cliente) + bot_message (IA ou humano).
export interface ChatRow {
  id: number;
  phone: string; // JID do WhatsApp, ex.: 553584774753@s.whatsapp.net
  nomewpp: string | null;
  user_message: string | null;
  bot_message: string | null;
  message_type: string | null; // 'text' (IA) | 'manual' (humano) | ...
  active: boolean | null;
  created_at: string;
  media_url?: string | null; // arquivo (Supabase Storage) quando há mídia
  media_type?: string | null; // image | audio | video | document
}

export interface Cliente {
  id: number;
  telefone: string; // JID do WhatsApp (unique)
  nomewpp: string | null;
  atendimento_ia: string | null; // 'ativa' | 'pausada' | ...
  created_at: string;
  display_name?: string | null; // nome editado no CRM (precede nomewpp)
  custom_fields?: Record<string, unknown> | null;
}

// Item da lista de conversas (inbox). Vem da tabela `conversations`, mantida
// por trigger a partir de chat_messages.
export interface InboxItem {
  phone: string;
  name: string | null;
  lastPreview: string;
  lastFrom: "in" | "out";
  lastMessageAt: string;
  unread: number;
  /** Atendente humano responsável (conversations.assigned_user_id) ou null. */
  assignedUserId: string | null;
}

// Balão renderizado na thread (uma linha vira 1–2 balões).
export interface Bubble {
  key: string;
  side: "in" | "out";
  author: "cliente" | "ia" | "voce";
  content: string;
  created_at: string;
  status?: "pending" | "failed";
  mediaUrl?: string | null;
  mediaType?: string | null; // image | audio | video | document
}
