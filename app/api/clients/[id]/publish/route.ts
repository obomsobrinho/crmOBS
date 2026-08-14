import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { publishBlockers } from "@/lib/onboarding";

// Publica (ou despublica) o agente do tenant logado. Publicar é o interruptor
// real: com `agent_published_at` nulo, o /api/agent responde em silêncio e nenhum
// cliente recebe mensagem da IA.
//
// Write via service_role: a RLS de `clients` não dá UPDATE a `authenticated`
// (update do browser afetaria 0 linhas em silêncio). Por isso a checagem de
// linhas afetadas no fim.
export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/publish">
) {
  const { id } = await ctx.params;

  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.id !== id)
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  if (mine.role !== "dono")
    return NextResponse.json(
      { error: "só o dono pode publicar o agente" },
      { status: 403 }
    );

  let body: { published?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof body.published !== "boolean") {
    return NextResponse.json({ error: "informe published" }, { status: 400 });
  }

  // Gate de pré-requisitos: mesma regra que a UI mostra (lib/onboarding), para
  // não existirem duas opiniões sobre quando dá para publicar.
  if (body.published) {
    const faltas = publishBlockers({
      hasInstance: !!mine.evolution_instance,
      agentConfigured: !!mine.onboarding.steps.find((s) => s.key === "configurar")
        ?.done,
      tested: !!mine.onboarding.steps.find((s) => s.key === "testar")?.done,
      published: !!mine.agentPublishedAt,
    });
    if (faltas.length > 0) {
      return NextResponse.json(
        { error: `antes de publicar, falta: ${faltas.join(", ")}.`, faltas },
        { status: 409 }
      );
    }
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("clients")
    .update({
      agent_published_at: body.published ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("id, agent_published_at");

  if (error || !data?.length) {
    return NextResponse.json(
      { error: "falha ao salvar a publicação", detail: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    published: !!data[0].agent_published_at,
    publishedAt: data[0].agent_published_at,
  });
}
