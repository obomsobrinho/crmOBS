import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildAdvancedPersona,
  buildPersona,
  normalizeHours,
  stripBaseTail,
  validateConfig,
  LIMITS,
} from "@/lib/agent-prompt";

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
    /** Só no mode "horario". */
    hours?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (
    body.mode !== "guiado" &&
    body.mode !== "avancado" &&
    body.mode !== "horario"
  ) {
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
  // Seções que a base tomou de volta no modo avançado. Vai na resposta para a
  // tela poder AVISAR em vez de o texto do tenant sumir em silêncio.
  let removidos: string[] = [];

  // Horário de atendimento salvo SOZINHO. Existe porque no modo avançado a
  // persona é escrita à mão, e salvar pelo formulário guiado a substituiria.
  // Faz merge no agent_config e não toca em persona nem em prompt_mode: o
  // horário é dado da empresa, não do prompt.
  if (body.mode === "horario") {
    const hours = normalizeHours(body.hours);
    const anterior = (current?.agent_config as Record<string, unknown> | null) ?? {};
    update = {
      agent_config: { ...anterior, hours },
      agent_config_updated_at: new Date().toISOString(),
    };
  } else if (body.mode === "guiado") {
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
    // avancado: o tenant escreve o que quiser, e o RABO DA BASE é sempre
    // recolado no fim (precedência, quando chamar humano, anti-manipulação,
    // OUTPUT). Sem isso, quem está no avançado nunca mais recebe melhoria nossa,
    // que foi exatamente o que aconteceu com a regra de handoff.
    const escrito = typeof body.persona === "string" ? body.persona : "";
    if (!escrito.trim()) {
      return NextResponse.json(
        { error: "o prompt não pode ficar vazio" },
        { status: 400 }
      );
    }
    // O handoffNotice do tenant, quando ele tem agent_config. Sem config vale o
    // padrão: o rabo não pode depender de dado que o tenant talvez não tenha.
    const cfgAtual = current?.agent_config as { handoffNotice?: string } | null;
    const { removed } = stripBaseTail(escrito);
    const persona = buildAdvancedPersona(escrito, {
      handoffNotice: cfgAtual?.handoffNotice,
    });
    if (persona.length > LIMITS.persona) {
      return NextResponse.json({ error: "prompt muito longo" }, { status: 400 });
    }
    update = { persona, prompt_mode: "avancado" };
    removidos = removed;
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

  // No mode "horario" não existe persona no update (de propósito): a resposta
  // não pode assumir que ela está lá.
  const persona = typeof update.persona === "string" ? update.persona : null;

  // Registra a versão. Como salvar JÁ É publicar (o n8n lê clients.persona ao
  // vivo), todo save que muda a persona é uma versão nova.
  //
  // Guarda a persona COMPILADA, e não só a config: é ela que responde "o cliente
  // reclamou de uma resposta na terça, o que o agente estava dizendo na terça?".
  // Cruzando com agent_turns fecha o diagnóstico.
  //
  // O mode "horario" NÃO gera versão: ele não toca a persona, só faz merge do
  // horário no agent_config.
  //
  // Best-effort e nunca lança: perder o registro é ruim, derrubar o save do dono
  // por causa do registro é pior. Mesmo princípio do logTurn.
  if (persona) {
    try {
      const { error: pubErr } = await svc.from("agent_publications").insert({
        client_id: id,
        config: (update.agent_config as unknown) ?? null,
        persona,
        prompt_mode: (update.prompt_mode as string) ?? "guiado",
        published_by: mine.userId,
      });
      if (pubErr) console.error("falha ao registrar a versão:", pubErr.message);
    } catch (e) {
      console.error("falha ao registrar a versão:", e);
    }
  }

  return NextResponse.json({
    ok: true,
    persona,
    chars: persona ? persona.length : 0,
    removed: removidos,
  });
}
