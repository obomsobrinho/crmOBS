import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildFallbackPersona } from "@/lib/agent-prompt";
import { runAgent, AgentError, type ChatTurn } from "@/lib/agent";
import { embedTexts, toVector } from "@/lib/rag";

// Cérebro do agente, chamado pelo n8n (que virou só o cano). STATELESS por turno.
// Recebe { client_id, phone, instance, message, nomewpp? }, carrega a persona do
// tenant, monta o histórico a partir de chat_messages (client_id + phone, o que
// evita colisão de memória entre tenants com o mesmo telefone) e chama o modelo.
// Responde { output: { messages, action, summary, preferencia_horario } } para os
// nós seguintes do n8n seguirem funcionando sem reescrita.
//
// Protegido por segredo compartilhado no header (mesmo padrão de by-instance).

// Quantas linhas de chat_messages carregar de contexto. Cada linha tem user +
// bot, então ~10 linhas equivalem à janela de 20 mensagens do Postgres Chat
// Memory que o n8n usava.
const HISTORY_ROWS = 10;
const MAX_TURN_CHARS = 2000;

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

  const svc = createServiceClient();

  // Persona do tenant (o n8n lia clients.persona ao vivo; seguimos igual). NÃO
  // recompilar: persona já é o system prompt final.
  const { data: client, error: clientErr } = await svc
    .from("clients")
    .select("persona, name")
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr) {
    return NextResponse.json(
      { error: "falha ao carregar o tenant", detail: clientErr.message },
      { status: 500 }
    );
  }
  if (!client) {
    return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });
  }
  const persona =
    typeof client.persona === "string" && client.persona.trim()
      ? client.persona
      : buildFallbackPersona((client.name as string) ?? "a empresa");

  // Histórico da conversa a partir de chat_messages (escopo client_id + phone).
  // A mensagem atual ainda não está salva aqui: o n8n grava depois, no nó
  // "Salva chat_messages". Então o histórico é só o passado.
  const { data: rows, error: histErr } = await svc
    .from("chat_messages")
    .select("user_message, bot_message, created_at")
    .eq("client_id", clientId)
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(HISTORY_ROWS);
  if (histErr) {
    return NextResponse.json(
      { error: "falha ao carregar o histórico", detail: histErr.message },
      { status: 500 }
    );
  }

  const history: ChatTurn[] = [];
  for (const r of (rows ?? []).reverse()) {
    const um = typeof r.user_message === "string" ? r.user_message.trim() : "";
    const bm = typeof r.bot_message === "string" ? r.bot_message.trim() : "";
    if (um) history.push({ role: "user", content: um.slice(0, MAX_TURN_CHARS) });
    // O bot_message é gravado como "msg1 | msg2"; volta a virar linhas.
    if (bm)
      history.push({
        role: "assistant",
        content: bm.replace(/\s*\|\s*/g, "\n").slice(0, MAX_TURN_CHARS),
      });
  }

  // Retrieval da base de conhecimento (RAG). Best-effort: se o tenant não tem
  // base, ou se algo falhar, o agente segue sem os trechos. Só embeda a mensagem
  // quando existe pelo menos um chunk (evita custo à toa).
  let knowledge: string[] = [];
  try {
    const { count } = await svc
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);
    if ((count ?? 0) > 0) {
      const [queryVec] = await embedTexts(apiKey, [message.slice(0, MAX_TURN_CHARS)]);
      const { data: matches } = await svc.rpc("match_knowledge_chunks", {
        p_client_id: clientId,
        p_query_embedding: toVector(queryVec),
        p_match_count: 5,
      });
      knowledge = ((matches ?? []) as { content: string }[])
        .map((m) => m.content)
        .filter((c) => typeof c === "string" && c.trim() !== "");
    }
  } catch (e) {
    console.error("falha no retrieval do RAG:", e);
  }

  let output;
  try {
    output = await runAgent({
      persona,
      history,
      message: message.slice(0, MAX_TURN_CHARS),
      apiKey,
      knowledge,
    });
  } catch (e) {
    const detail = e instanceof AgentError ? e.message : "erro inesperado no agente";
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  // Persiste a qualificação quando o agente decide algo (agendar/pausar). Isso
  // alimenta a lista "Precisa de você" e o resumo da IA na conversa. Best-effort:
  // um erro aqui não pode derrubar a resposta ao cliente.
  if (output.action !== "none") {
    const { error: qErr } = await svc.from("conversation_qualifications").insert({
      client_id: clientId,
      phone,
      action: output.action,
      summary: output.summary,
      preferencia_horario: output.preferencia_horario,
    });
    if (qErr) console.error("falha ao gravar qualificação:", qErr.message);
  }

  return NextResponse.json({ output });
}
