import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { segredoConfere } from "@/lib/segredo";

// Descobre o tenant a partir do instanceName do payload da Evolution. Protegido
// por segredo compartilhado.
// ⚠️ O n8n NÃO chama esta rota (nenhum workflow versionado a usa) e NÃO devolve
// a persona (R-32, 01/10/2026): o prompt do tenant é propriedade intelectual
// dele e não precisa sair por aqui. Quem quiser a persona monta com
// `compilePersona`, no servidor.
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/clients/by-instance/[instanceName]">
) {
  const secret = process.env.N8N_LOOKUP_SECRET;
  if (!segredoConfere(req.headers.get("x-lookup-secret"), secret)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const { instanceName } = await ctx.params;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("clients")
    .select("id, name, evolution_instance, notify_group_jid")
    .eq("evolution_instance", instanceName)
    .maybeSingle();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });

  return NextResponse.json({
    client_id: data.id,
    name: data.name,
    evolution_instance: data.evolution_instance,
    notify_group_jid: data.notify_group_jid,
  });
}
