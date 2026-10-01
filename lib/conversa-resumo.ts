import type { SupabaseClient } from "@supabase/supabase-js";

// Total de mensagens e data da primeira de UMA conversa, para a ficha do
// contato (`/inbox/[id]` e `/clientes/[id]`). Uma ida ao banco (R-14,
// 01/10/2026): antes eram um count exato e uma leitura da primeira linha.
export interface ResumoConversa {
  total: number;
  primeira: string | null;
}

export async function resumoDaConversa(
  supabase: SupabaseClient,
  phone: string
): Promise<ResumoConversa> {
  const { data, error } = await supabase
    .rpc("chat_resumo_conversa", { p_phone: phone })
    .maybeSingle();
  if (!error && data) {
    const r = data as { total: number | string; primeira: string | null };
    return { total: Number(r.total), primeira: r.primeira };
  }

  // Função ainda não aplicada no banco: as duas consultas de antes. Sai quando a
  // migration `conversa_resumo_e_membros_do_cliente` estiver em todos os ambientes.
  const [{ count }, { data: primeira }] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone),
    supabase
      .from("chat_messages")
      .select("created_at")
      .eq("phone", phone)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    total: count ?? 0,
    primeira: (primeira as { created_at: string } | null)?.created_at ?? null,
  };
}
