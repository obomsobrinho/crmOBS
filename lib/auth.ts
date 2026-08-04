import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface MyClient {
  id: string;
  name: string;
  evolution_instance: string | null;
  imported_at: string | null;
  /** Papel do usuário logado neste tenant: 'dono' | 'atendente' | null. */
  role: string | null;
  /** uid do usuário logado (útil para atribuição de conversa). */
  userId: string;
}

// Cliente (tenant) do usuário logado. A RLS já restringe `clients` ao(s)
// tenant(s) do usuário, então um simples select retorna o dele. Também resolve
// o papel do usuário nesse tenant (a policy de user_clients libera a própria
// linha), usado para gatear ações de dono (convidar/remover membro).
export async function getMyClient(): Promise<MyClient | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("clients")
    .select("id, name, evolution_instance, imported_at")
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const client = data as {
    id: string;
    name: string;
    evolution_instance: string | null;
    imported_at: string | null;
  };

  const { data: membership } = await supabase
    .from("user_clients")
    .select("role")
    .eq("user_id", user.id)
    .eq("client_id", client.id)
    .maybeSingle();

  return {
    ...client,
    role: (membership as { role: string } | null)?.role ?? null,
    userId: user.id,
  };
}
