import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { connectionState } from "@/lib/evolution";

// Estado da conexão da instância do tenant logado (para o polling do QR).
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/whatsapp-status">
) {
  const { id } = await ctx.params;

  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.id !== id)
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  if (!mine.evolution_instance)
    return NextResponse.json({ state: "close" });

  try {
    const res = await connectionState(mine.evolution_instance);
    if (!res.ok) return NextResponse.json({ state: "unknown" });
    const data = (await res.json()) as {
      instance?: { state?: string };
      state?: string;
    };
    const state = data.instance?.state ?? data.state ?? "unknown";
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json({ state: "unknown" });
  }
}
