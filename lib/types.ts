import type { Tables } from "./database.types";

// Uma linha = uma troca: user_message (cliente) + bot_message (IA ou humano).
// Derivada do banco (lib/database.types.ts). phone = JID do WhatsApp; message_type
// = 'text' (IA) | 'manual' (humano) | ...; media_type = image | audio | video |
// document. created_at é anulável NO BANCO (o n8n escreve a tabela).
export type ChatRow = Pick<
  Tables<"chat_messages">,
  | "id"
  | "phone"
  | "nomewpp"
  | "user_message"
  | "bot_message"
  | "message_type"
  | "active"
  | "created_at"
> &
  Partial<Pick<Tables<"chat_messages">, "media_url" | "media_type">>;

// Contato (dados_cliente). telefone = JID (unique); atendimento_ia = 'ativa' |
// 'pausada' | ...; display_name = nome editado no CRM (precede nomewpp);
// birth_date = AAAA-MM-DD; foto_path = foto guardada (lib/fotos.ts).
export type Cliente = Pick<
  Tables<"dados_cliente">,
  "id" | "telefone" | "nomewpp" | "atendimento_ia" | "created_at"
> &
  Partial<
    Pick<
      Tables<"dados_cliente">,
      "display_name" | "custom_fields" | "email" | "birth_date" | "foto_path"
    >
  >;

// Item da lista de conversas (inbox). Vem da tabela `conversations`, mantida
// por trigger a partir de chat_messages.
export interface InboxItem {
  phone: string;
  name: string | null;
  /** Foto de perfil guardada (lib/fotos.ts). */
  fotoPath?: string | null;
  lastPreview: string;
  lastFrom: "in" | "out";
  lastMessageAt: string;
  unread: number;
  /** Atendente humano responsável (conversations.assigned_user_id) ou null. */
  assignedUserId: string | null;
  /** Estágio do pipeline (conversations.stage) ou null (= coluna default). */
  stage: string | null;
  /**
   * Quando a IA abriu o handoff e ninguém do time respondeu ainda
   * (conversations.handoff_at), ou null. É o sinal de "Precisa de você": antes
   * esse corte era "IA pausada", o que confundia "a IA pediu ajuda" com
   * "alguém assumiu" e deixava a IA desligada para sempre.
   */
  handoffAt: string | null;
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
