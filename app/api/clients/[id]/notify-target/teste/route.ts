import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { sendText } from "@/lib/evolution";
import { TEXTO_TESTE_AVISO } from "@/lib/avisos";

// "Mandar teste": manda uma mensagem ao destino de avisos SALVO, para a pessoa
// ver chegar antes de depender disso. Dono-only.
//
// ⚠️ Manda WhatsApp de verdade. Nenhum teste automatizado chama esta rota: o
// envio real é o teste do dono com o chip.
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/notify-target/teste">
) {
  const { id } = await ctx.params;
  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.id !== id)
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  if (mine.role !== "dono")
    return NextResponse.json(
      { error: "só o dono pode testar os avisos" },
      { status: 403 }
    );
  if (!mine.evolution_instance) {
    return NextResponse.json(
      { error: "conecte o WhatsApp antes de mandar o teste." },
      { status: 409 }
    );
  }

  // Lido aqui, e não do `getMyClient`: ele é memoizado por request, e o destino
  // pode ter acabado de ser salvo (ver a nota no CLAUDE.md).
  const svc = createServiceClient();
  const { data } = await svc
    .from("clients")
    .select("notify_group_jid")
    .eq("id", id)
    .maybeSingle();
  const destino = (data?.notify_group_jid as string | null) ?? null;
  if (!destino) {
    return NextResponse.json(
      { error: "salve para onde vão os avisos antes de mandar o teste." },
      { status: 409 }
    );
  }

  let ok = false;
  try {
    ok = await sendText(mine.evolution_instance, destino, TEXTO_TESTE_AVISO);
  } catch {
    ok = false;
  }
  if (!ok) {
    return NextResponse.json(
      {
        error:
          "o WhatsApp não aceitou a mensagem. Confira se o número está conectado e se o destino existe no WhatsApp.",
      },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
