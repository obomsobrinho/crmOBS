import type { SupabaseClient } from "@supabase/supabase-js";

// Membro (login) de um tenant. Vem da RPC public.tenant_members(), que resolve
// o e-mail em auth.users (o CRM roda como `authenticated` e não pode ler
// auth.users direto). Usado na tela de Equipe e para nomear o atendente de cada
// conversa.
export interface Member {
  userId: string;
  email: string;
  role: string; // 'dono' | 'atendente'
}

export async function fetchMembers(
  supabase: SupabaseClient
): Promise<Member[]> {
  const { data, error } = await supabase.rpc("tenant_members");
  if (error || !data) return [];
  return (data as { user_id: string; email: string; role: string }[]).map(
    (r) => ({ userId: r.user_id, email: r.email, role: r.role })
  );
}

export function roleLabel(role: string): string {
  return role === "dono" ? "Dono" : "Atendente";
}

// Nome curto e legível de um membro a partir do e-mail (parte antes do @).
export function memberName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._-]+/g, " ").trim() || email;
}

// Iniciais para avatar do atendente (uma ou duas letras).
export function memberInitials(email: string): string {
  const name = memberName(email);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
