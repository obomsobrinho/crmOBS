import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import type { TablesInsert } from "@/lib/database.types";

/**
 * Registra uma versão publicada do agente (`agent_publications`). SALVAR JÁ É
 * PUBLICAR: todo save que muda a persona vira uma linha, com a persona COMPILADA
 * (é ela que responde "o que o agente estava dizendo na terça?").
 *
 * Um lugar só para as duas portas que publicam: o `PUT` de agent-config e a rota
 * das regras salvas (`agent-rules`). Best-effort e nunca lança: perder o
 * registro é ruim, derrubar o save do dono por causa dele é pior (mesmo
 * princípio do `logTurn`).
 */
export async function registrarPublicacao(
  svc: ReturnType<typeof createServiceClient>,
  linha: Pick<TablesInsert<"agent_publications">, "client_id" | "config" | "persona" | "prompt_mode" | "published_by">
): Promise<void> {
  try {
    const { error } = await svc.from("agent_publications").insert(linha);
    if (error) console.error("falha ao registrar a versão:", error.message);
  } catch (e) {
    console.error("falha ao registrar a versão:", e);
  }
}
