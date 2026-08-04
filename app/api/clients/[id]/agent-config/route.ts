import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { buildPersona, validateConfig, LIMITS } from "@/lib/agent-prompt";

// Salva a configuração do agente do tenant logado.
// - modo "guiado": grava agent_config + persona compilada (buildPersona).
// - modo "avancado": grava a persona escrita à mão, sem tocar em agent_config.
// O n8n lê SEMPRE `clients.persona` ao vivo, então o efeito é imediato.
// Write via service_role: a RLS de `clients` não tem policy de UPDATE para
// `authenticated` (um update do browser afetaria 0 linhas em silêncio).
export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/agent-config">
) {
  const { id } = await ctx.params;

  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.id !== id)
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  // Só o dono edita o agente (atendente não tem acesso ao /agente).
  if (mine.role !== "dono")
    return NextResponse.json(
      { error: "só o dono pode editar o agente" },
      { status: 403 }
    );

  let body: {
    mode?: string;
    config?: unknown;
    persona?: string;
    confirmOverwrite?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.mode !== "guiado" && body.mode !== "avancado") {
    return NextResponse.json({ error: "modo inválido" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Estado atual (para a guarda anti-destruição do prompt manual).
  const { data: current, error: readErr } = await svc
    .from("clients")
    .select("persona, agent_config")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json(
      { error: "falha ao ler a configuração", detail: readErr.message },
      { status: 500 }
    );
  }

  let update: Record<string, unknown>;

  if (body.mode === "guiado") {
    const result = validateConfig(body.config);
    if (!result.ok) {
      return NextResponse.json(
        { error: "configuração incompleta", fields: result.errors },
        { status: 400 }
      );
    }
    const persona = buildPersona(result.value);
    if (persona.length > LIMITS.persona) {
      return NextResponse.json({ error: "prompt muito longo" }, { status: 400 });
    }

    // Existe persona manual (nunca configurada pela UI) → exige confirmação.
    const hasManual =
      current?.agent_config == null &&
      typeof current?.persona === "string" &&
      current.persona.trim().length > 0;
    if (hasManual && !body.confirmOverwrite) {
      return NextResponse.json(
        { error: "já existe um prompt manual; confirme a substituição" },
        { status: 409 }
      );
    }

    update = {
      agent_config: result.value,
      persona,
      prompt_mode: "guiado",
      agent_config_updated_at: new Date().toISOString(),
    };
  } else {
    // avancado
    const persona = typeof body.persona === "string" ? body.persona : "";
    if (!persona.trim()) {
      return NextResponse.json(
        { error: "o prompt não pode ficar vazio" },
        { status: 400 }
      );
    }
    if (persona.length > LIMITS.persona) {
      return NextResponse.json({ error: "prompt muito longo" }, { status: 400 });
    }
    update = { persona, prompt_mode: "avancado" };
  }

  const { data, error } = await svc
    .from("clients")
    .update(update)
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    return NextResponse.json(
      { error: "falha ao salvar a configuração", detail: error?.message },
      { status: 500 }
    );
  }

  const persona = update.persona as string;
  return NextResponse.json({ ok: true, persona, chars: persona.length });
}
