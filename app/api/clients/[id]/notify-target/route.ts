import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

// Configura o destino das notificações do agente no WhatsApp (notify_group_jid).
// Hoje esse valor só existia por SQL. O n8n usa ele para avisar o time quando o
// agente marca uma conversa ("agendar") ou qualifica um lead. Sem ele, esse
// encaminhamento falha em silêncio.
//
// Só o dono configura. Write via service_role: a RLS de `clients` não dá UPDATE
// a `authenticated` (um update do browser afetaria 0 linhas em silêncio).
export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/notify-target">
) {
  const { id } = await ctx.params;

  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.id !== id)
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  if (mine.role !== "dono")
    return NextResponse.json(
      { error: "só o dono pode configurar as notificações" },
      { status: 403 }
    );

  let body: { jid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const raw = typeof body.jid === "string" ? body.jid.trim() : "";
  // Vazio limpa o destino (volta a null).
  let value: string | null = null;
  if (raw) {
    if (raw.length > 100) {
      return NextResponse.json({ error: "JID muito longo" }, { status: 400 });
    }
    // Um JID de grupo termina em @g.us; um contato, em @s.whatsapp.net.
    if (!raw.endsWith("@g.us") && !raw.endsWith("@s.whatsapp.net")) {
      return NextResponse.json(
        { error: "informe um JID válido, terminado em @g.us (grupo)" },
        { status: 400 }
      );
    }
    value = raw;
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("clients")
    .update({ notify_group_jid: value })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    return NextResponse.json(
      { error: "falha ao salvar o destino", detail: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, jid: value });
}
