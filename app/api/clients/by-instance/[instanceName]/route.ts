import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Chamado pelo n8n no início do fluxo para descobrir o tenant a partir do
// instanceName do payload da Evolution. Protegido por segredo compartilhado.
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/clients/by-instance/[instanceName]">
) {
  const secret = process.env.N8N_LOOKUP_SECRET;
  if (!secret || req.headers.get("x-lookup-secret") !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const { instanceName } = await ctx.params;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("clients")
    .select("id, name, persona, evolution_instance, notify_group_jid")
    .eq("evolution_instance", instanceName)
    .maybeSingle();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });

  return NextResponse.json({
    client_id: data.id,
    name: data.name,
    persona: data.persona,
    evolution_instance: data.evolution_instance,
    notify_group_jid: data.notify_group_jid,
  });
}
