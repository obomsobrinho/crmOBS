import type { ConversationNote } from "@/lib/crm";
import type { EventoBanco } from "@/lib/use-canal-ao-vivo";

/**
 * O evento de `conversation_notes` aplicado à lista de notas de UMA conversa (puro).
 *
 * DELETE traz só a chave primária em `antigo` (teste de 13/11/2026, passo 0 de
 * docs/plano-dados-e-estado.md; regra em `realtime.md`): ele só tira um id que já está
 * na tela, nunca decide de que conversa a nota era. Antes lia `conversation_id` desse
 * `antigo`, não achava nada, e a nota apagada em outra aba nunca saía. Um id que não
 * está na lista é ignorado (devolve a mesma lista).
 *
 * INSERT e UPDATE trazem a linha inteira em `novo`: entram só se forem desta conversa,
 * encaixadas por id e na ordem de criação (mais nova primeiro).
 */
export function aplicarEventoDeNota(
  notas: ConversationNote[],
  ev: Pick<EventoBanco, "tipo" | "novo" | "antigo">,
  conversationId: number | null
): ConversationNote[] {
  if (ev.tipo === "DELETE") {
    const id = ev.antigo?.id;
    return typeof id === "number" && notas.some((n) => n.id === id) ? notas.filter((n) => n.id !== id) : notas;
  }
  const r = ev.novo;
  if (!r || conversationId == null || r.conversation_id !== conversationId) return notas;
  const id = r.id as number;
  const nota: ConversationNote = {
    id,
    body: r.body as string,
    authorUserId: (r.author_user_id as string | null) ?? null,
    createdAt: r.created_at as string,
  };
  return (notas.some((n) => n.id === id) ? notas.map((n) => (n.id === id ? nota : n)) : [nota, ...notas]).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}
