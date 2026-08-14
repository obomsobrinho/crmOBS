import { NextResponse, type NextRequest } from "next/server";
import { AgentError, type ChatTurn } from "@/lib/agent";
import { processTurn, TurnError } from "@/lib/agent-turn";

// Cérebro do agente, chamado pelo n8n (que virou só o cano). STATELESS por turno.
// Recebe { client_id, phone, instance, message, nomewpp? }, e a orquestração
// (persona + histórico + RAG + modelo + guardrail + pipeline) mora em
// lib/agent-turn (reaproveitada pela bancada de teste). Responde
// { output: { messages, action, summary, preferencia_horario }, diagnostics }.
// O n8n só lê `output`; `diagnostics` é aditivo e não quebra os nós seguintes.
//
// Protegido por segredo compartilhado no header (mesmo padrão de by-instance).
// dryRun (opcional): não persiste nada e o histórico/estágio vêm do corpo. Usado
// pela bancada de teste via a rota dono-only (que reaproveita processTurn direto,
// sem passar por aqui). Aceito aqui também por simetria do contrato.

// Vercel: o cérebro chama modelo + retrieval; dá folga além do padrão de 10s.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.N8N_LOOKUP_SECRET;
  if (!secret || req.headers.get("x-lookup-secret") !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  let body: {
    client_id?: string;
    phone?: string;
    instance?: string;
    message?: string;
    nomewpp?: string;
    dryRun?: boolean;
    history?: ChatTurn[];
    currentStage?: string | null;
    stageSource?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  const phone = typeof body.phone === "string" ? body.phone : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!clientId || !phone || !message) {
    return NextResponse.json(
      { error: "client_id, phone e message são obrigatórios" },
      { status: 400 }
    );
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
      clientId,
      phone,
      message,
      apiKey,
      dryRun: body.dryRun === true,
      history: body.history,
      currentStage: body.currentStage ?? null,
      stageSource: body.stageSource ?? null,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AgentError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    if (e instanceof TurnError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("erro inesperado no /api/agent:", e);
    return NextResponse.json({ error: "erro inesperado no agente" }, { status: 500 });
  }
}
