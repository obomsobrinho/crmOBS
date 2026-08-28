import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { AgentError, type ChatTurn } from "@/lib/agent";
import { processTurn, TurnError } from "@/lib/agent-turn";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildAdvancedPersona,
  buildPersona,
  validateConfig,
  LIMITS,
} from "@/lib/agent-prompt";

// Bancada de teste (playground), dono-only. Fala direto com o cérebro REAL
// (processTurn, o mesmo do /api/agent) em modo dryRun: não persiste nada (nem
// chat_messages, nem qualificação, nem move o card) e o histórico/estágio/
// orientação vêm do corpo. Autenticado pela sessão do dono, então NÃO usa o
// segredo do n8n (que nunca vai ao browser). client_id sempre vem da sessão.
//
// PERSONA EM EDIÇÃO: o corpo pode trazer a configuração que a pessoa está mexendo
// no `/agente` (`mode` mais `config` ou `persona`), e aí o teste roda contra ela
// em vez da que está salva. É o que resolve o problema real: salvar JÁ É publicar
// (o n8n lê `clients.persona` ao vivo), então testar salvando é mexer no agente
// que está atendendo cliente de verdade.
//
// Quem COMPILA é o servidor, sempre. O browser manda a configuração crua e aqui
// ela passa por `validateConfig` mais `buildPersona` (guiado) ou por
// `buildAdvancedPersona` (avançado, que tira do texto qualquer seção da base e
// recola o rabo invariante). Se o browser pudesse mandar a persona final, o teste
// poderia rodar sem o contrato de saída e mentiria sobre o agente real.

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
    /** Configuração em edição: "guiado" usa `config`, "avancado" usa `persona`. */
    mode?: string;
    config?: unknown;
    persona?: string;
    /** Base do aviso de handoff em edição (só usada no modo avançado). */
    handoffNotice?: string;
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

  // Persona da configuração em edição. Ausente = testa a que está salva, que é o
  // comportamento antigo e segue valendo.
  let personaOverride: string | null = null;
  if (body.mode === "guiado") {
    // Mesma validação do save. Config incompleta não é teste válido: uma persona
    // sem nome de empresa responde outra coisa, e o teste diria pouco. Devolve os
    // campos que faltam para a bancada apontar onde.
    const r = validateConfig(body.config);
    if (!r.ok) {
      return NextResponse.json(
        { error: "configuração incompleta", fields: r.errors },
        { status: 400 }
      );
    }
    personaOverride = buildPersona(r.value);
  } else if (body.mode === "avancado") {
    const escrito = typeof body.persona === "string" ? body.persona : "";
    if (!escrito.trim()) {
      return NextResponse.json(
        { error: "o prompt não pode ficar vazio" },
        { status: 400 }
      );
    }
    // `buildAdvancedPersona` faz as duas coisas que importam: tira do texto dele
    // qualquer seção da base (para não duplicar) e RECOLA o rabo invariante. Sem
    // recolar, o teste rodaria sem contrato de saída e não provaria nada.
    personaOverride = buildAdvancedPersona(escrito, {
      handoffNotice:
        typeof body.handoffNotice === "string" ? body.handoffNotice : undefined,
    });
  }
  if (personaOverride && personaOverride.length > LIMITS.persona) {
    return NextResponse.json({ error: "prompt muito longo" }, { status: 400 });
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
      // dryRun travado em true: esta rota nunca escreve conversa, nunca move
      // card e nunca manda nada no WhatsApp. É também o que autoriza o
      // personaOverride (processTurn só o honra em dryRun).
      dryRun: true,
      history: body.history,
      currentStage: body.currentStage ?? null,
      stageSource: body.stageSource ?? null,
      instruction: body.instruction ?? null,
      personaOverride,
    });

    // Marca `onboarding_tested_at` na primeira conversa que der certo.
    // Best-effort e só uma vez (a checagem evita escrita em toda mensagem); um
    // erro aqui não pode derrubar o teste do dono.
    //
    // ⚠️ Isto NÃO é mais pré-requisito para ativar (ver `publishBlockers`), mas
    // segue sendo gravado: é o único registro de que alguém falou com o agente
    // antes de soltá-lo.
    if (!client.montagem.feito.testar) {
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
