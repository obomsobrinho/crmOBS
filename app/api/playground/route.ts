import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { AgentError, type ChatTurn } from "@/lib/agent";
import { processTurn, TurnError } from "@/lib/agent-turn";
import { createServiceClient } from "@/lib/supabase/service";

// Bancada de teste (playground), dono-only. Fala direto com o cérebro REAL
// (processTurn, o mesmo do /api/agent) em modo dryRun: não persiste nada (nem
// chat_messages, nem qualificação, nem move o card) e o histórico/estágio/
// orientação vêm do corpo. Autenticado pela sessão do dono, então NÃO usa o
// segredo do n8n (que nunca vai ao browser). client_id sempre vem da sessão.

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const client = await getMyClient();
  if (!client) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  if (client.role !== "dono") {
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  }

  let body: {
    message?: string;
    history?: ChatTurn[];
    currentStage?: string | null;
    stageSource?: string | null;
    instruction?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "mensagem obrigatória" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "o agente precisa de OPENAI_API_KEY configurada no servidor" },
      { status: 501 }
    );
  }

  try {
    const result = await processTurn({
      clientId: client.id,
      phone: `playground:${client.userId}`,
      message,
      apiKey,
      dryRun: true,
      history: body.history,
      currentStage: body.currentStage ?? null,
      stageSource: body.stageSource ?? null,
      instruction: body.instruction ?? null,
    });

    // Marca o passo "testar" do onboarding na primeira conversa que der certo.
    // Best-effort e só uma vez (a checagem evita escrita em toda mensagem); um
    // erro aqui não pode derrubar o teste do dono.
    if (!client.onboarding.steps.find((s) => s.key === "testar")?.done) {
      const svc = createServiceClient();
      const { error: markErr } = await svc
        .from("clients")
        .update({ onboarding_tested_at: new Date().toISOString() })
        .eq("id", client.id);
      if (markErr)
        console.error("falha ao marcar o teste do onboarding:", markErr.message);
    }

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AgentError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    if (e instanceof TurnError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("erro inesperado no /api/playground:", e);
    return NextResponse.json({ error: "erro inesperado no agente" }, { status: 500 });
  }
}
