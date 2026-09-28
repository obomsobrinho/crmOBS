import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";

type Svc = ReturnType<typeof createServiceClient>;

// FILA DE PEDIDOS DE AJUDA (27/09/2026, decisão do dono). Uma conversa pode ter
// mais de um pedido aberto, e eles se resolvem do MAIS ANTIGO para o mais novo:
// é o que a caixa de escrita mostra ("1 de 2"). `conversations.handoff_at`
// continua sendo o sinal de "Precisa de você" e guarda a abertura do pedido
// aberto mais antigo, que é o que mede a espera real.
//
// As três portas que fecham um pedido (orientar, "Eu respondo" e "Resolvido")
// passam por aqui, para nenhuma esquecer de recalcular o `handoff_at`: fechar o
// pedido e deixar a conversa em "Esperando" com o próximo já resolvido, ou
// tirá-la de lá com outro ainda aberto, é o erro que isto existe para evitar.

/**
 * Fecha UM pedido aberto: o `id` pedido (se ainda estiver aberto) ou, sem `id`,
 * o mais antigo. Devolve o id fechado, ou `null` se não havia o que fechar.
 */
export async function fecharPedido(
  svc: Svc,
  p: {
    clientId: string;
    phone: string;
    id?: number | null;
    como: "ia" | "resolvido";
    por: string | null;
    instrucao?: string | null;
  }
): Promise<number | null> {
  let alvo = p.id ?? null;
  if (alvo == null) {
    const { data } = await svc
      .from("handoffs")
      .select("id")
      .eq("client_id", p.clientId)
      .eq("phone", p.phone)
      .is("closed_at", null)
      .order("opened_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    alvo = (data?.id as number | undefined) ?? null;
  }
  if (alvo == null) return null;

  const { data: fechado, error } = await svc
    .from("handoffs")
    .update({
      closed_at: new Date().toISOString(),
      closed_how: p.como,
      closed_by: p.por,
      ...(p.instrucao ? { instruction: p.instrucao } : {}),
    })
    .eq("id", alvo)
    .eq("client_id", p.clientId)
    .eq("phone", p.phone)
    .is("closed_at", null)
    .select("id");
  if (error) throw new Error(error.message);

  await recalcularEspera(svc, p.clientId, p.phone);
  return fechado && fechado.length > 0 ? alvo : null;
}

/** `handoff_at` = abertura do pedido aberto mais antigo, ou nulo se não sobrou nenhum. */
export async function recalcularEspera(svc: Svc, clientId: string, phone: string) {
  const { data } = await svc
    .from("handoffs")
    .select("opened_at")
    .eq("client_id", clientId)
    .eq("phone", phone)
    .is("closed_at", null)
    .order("opened_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { error } = await svc
    .from("conversations")
    .update({ handoff_at: (data?.opened_at as string | undefined) ?? null })
    .eq("client_id", clientId)
    .eq("phone", phone);
  if (error) console.error("falha ao recalcular a espera:", error.message);
}
