import { NextResponse, type NextRequest } from "next/server";
import { sessaoDaRota } from "@/lib/rota";
import { createServiceClient } from "@/lib/supabase/service";
import { connectionState, logoutInstance } from "@/lib/evolution";

// DESCONECTAR O WHATSAPP (03/10/2026). Único caminho que derruba uma instância
// ABERTA: ação explícita do dono, atrás de diálogo de confirmação na tela. Serve
// a "Desconectar" e a "Trocar número" (que desconecta e depois reaproveita o
// fluxo de QR ou código de /connect, na MESMA instância).
//
// A instância e `clients.evolution_instance` ficam como estão: o n8n resolve o
// tenant por esse nome, e a Evolution mantém instância e webhook depois do
// logout. As conversas e os contatos são do tenant e continuam no CRM.
//
// O agente vira Desativado (`agent_enabled = false`, `agent_published_at` NUNCA
// é limpo): sem número conectado ele não tem como responder, e ao conectar o
// novo número quem decide religar é o dono.
//
// Write via service_role: a RLS de `clients` não dá UPDATE a `authenticated`.
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/disconnect-whatsapp">
) {
  const { id } = await ctx.params;

  const r = await sessaoDaRota({
    id,
    dono: "só o dono pode desconectar o WhatsApp",
    ativa: true,
    revalidar: true,
  });
  if ("erro" in r) return r.erro;
  const { mine } = r;

  if (mine.evolution_instance) {
    try {
      // Já fechada = nada a derrubar (o logout de uma instância fechada falha
      // na Evolution e não é erro nosso). Estado ilegível tenta o logout.
      const st = await connectionState(mine.evolution_instance);
      const estado = st.ok
        ? ((await st.json()) as { instance?: { state?: string }; state?: string })
        : null;
      const atual = estado?.instance?.state ?? estado?.state ?? null;
      if (atual !== "close") {
        const out = await logoutInstance(mine.evolution_instance);
        if (!out.ok) {
          return NextResponse.json(
            { error: "não foi possível desconectar o WhatsApp. Tente de novo." },
            { status: 502 }
          );
        }
      }
    } catch {
      return NextResponse.json(
        { error: "falha ao contatar a Evolution" },
        { status: 502 }
      );
    }
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("clients")
    .update({ agent_enabled: false })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    return NextResponse.json(
      { error: "WhatsApp desconectado, mas falhou ao desativar o agente", detail: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
