import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

// Remove um membro do tenant do dono logado (desfaz o vínculo em user_clients;
// não apaga o login, que pode pertencer a outros tenants).
// - Só o dono remove.
// - Não pode remover a si mesmo, nem o último dono do tenant.
// Write via service_role (user_clients sem policy de DELETE para authenticated).
export async function POST(req: NextRequest) {
  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.role !== "dono")
    return NextResponse.json(
      { error: "só o dono pode remover membros" },
      { status: 403 }
    );

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
  }
  if (userId === mine.userId) {
    return NextResponse.json(
      { error: "você não pode remover a si mesmo" },
      { status: 400 }
    );
  }

  const svc = createServiceClient();

  // Guarda: não deixar o tenant sem nenhum dono.
  const { data: target } = await svc
    .from("user_clients")
    .select("role")
    .eq("client_id", mine.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json(
      { error: "esse membro não faz parte do time" },
      { status: 404 }
    );
  }
  if ((target as { role: string }).role === "dono") {
    const { count } = await svc
      .from("user_clients")
      .select("user_id", { count: "exact", head: true })
      .eq("client_id", mine.id)
      .eq("role", "dono");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "o time precisa de pelo menos um dono" },
        { status: 400 }
      );
    }
  }

  const { error } = await svc
    .from("user_clients")
    .delete()
    .eq("client_id", mine.id)
    .eq("user_id", userId);
  if (error) {
    return NextResponse.json(
      { error: "falha ao remover o membro", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
