import { NextResponse, type NextRequest } from "next/server";
import { sessaoDaRota } from "@/lib/rota";
import { AgentError, type ChatTurn } from "@/lib/agent";
import { processTurn, TurnError } from "@/lib/agent-turn";
import { createServiceClient } from "@/lib/supabase/service";
import { compilePersona, type BusinessHours } from "@/lib/agent-prompt";
import { horarioCadastrado } from "@/lib/horarios";

// Bancada de teste (playground), dono-only. Fala direto com o cérebro REAL
// (processTurn, o mesmo do /api/agent) em modo dryRun: não persiste nada (nem
// chat_messages, nem qualificação, nem move o card) e o histórico/estágio/
// orientação vêm do corpo. Autenticado pela sessão do dono, então NÃO usa o
// segredo do n8n (que nunca vai ao browser). client_id sempre vem da sessão.
//
// PERSONA EM EDIÇÃO: o corpo pode trazer a configuração que a pessoa está mexendo
// no `/agente` (`mode` mais `config` ou `persona`), e aí o teste roda contra ela
// em vez da que está salva. É o que resolve o problema real: salvar JÁ É publicar
// (a persona salva vira a base do que o turno monta), então testar salvando é mexer no agente
// que está atendendo cliente de verdade.
//
// Quem COMPILA é o servidor, sempre. O browser manda a configuração crua e aqui
// ela passa por `validateConfig` mais `buildPersona` (guiado) ou por
// `buildAdvancedPersona` (avançado, que tira do texto qualquer seção da base e
// recola o rabo invariante). Se o browser pudesse mandar a persona final, o teste
// poderia rodar sem o contrato de saída e mentiria sobre o agente real.

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const r = await sessaoDaRota({ dono: "acesso negado" });
  if ("erro" in r) return r.erro;
  const client = r.mine;

  let body: {
    message?: string;
    history?: ChatTurn[];
    currentStage?: string | null;
    stageSource?: string | null;
    instruction?: string | null;
    /**
     * A bancada orientou um pedido de ajuda (29/09/2026): a IA responde SEM
     * mensagem nova do cliente, como no atendimento de verdade.
     */
    retomada?: { instruction?: string } | null;
    /** Pedidos de ajuda abertos na conversa de teste. */
    pedidosAbertos?: string[];
    /** Configuração em edição: "guiado" usa `config`, "avancado" usa `persona`. */
    mode?: string;
    config?: unknown;
    persona?: string;
    /** Base do aviso de handoff em edição (só usada no modo avançado). */
    handoffNotice?: string;
    /** Hora fixa do turno (ISO), para a bateria de testes de data e horário. */
    agoraTeste?: string;
    /**
     * Horário fixo no modo avançado (o guiado traz o seu em `config.hours`).
     * Existe para a bateria (`e2e/bateria/`) não depender do horário salvo no
     * tenant. A rota é sempre dryRun, então nunca chega ao atendimento.
     */
    hours?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const retomada =
    typeof body.retomada?.instruction === "string" && body.retomada.instruction.trim()
      ? { instruction: body.retomada.instruction.trim().slice(0, 2000) }
      : null;
  if (!message && !retomada) {
    return NextResponse.json({ error: "mensagem obrigatória" }, { status: 400 });
  }

  // Persona da configuração em edição. Ausente = testa a que está salva, que é o
  // comportamento antigo e segue valendo.
  let personaOverride: string | null = null;
  // Horário em edição, que alimenta o `### CALENDÁRIO`. Só o guiado tem horário
  // no formulário; o avançado usa o salvo (undefined = o do tenant).
  let horarioOverride: BusinessHours | null | undefined = undefined;
  // ⚠️ MESMO despacho do save e do turno (`compilePersona`). Se a bancada
  // compilasse por conta própria, ela testaria um texto que o agente nunca vai
  // receber, que é o oposto do que ela existe para provar.
  if (body.mode === "guiado") {
    // Mesma validação do save. Config incompleta não é teste válido: uma persona
    // sem nome de empresa responde outra coisa, e o teste diria pouco. Devolve os
    // campos que faltam para a bancada apontar onde.
    const r = compilePersona({ mode: "guiado", config: body.config });
    if (!r.ok) {
      if (r.motivo === "campos") {
        return NextResponse.json(
          { error: "configuração incompleta", fields: r.fields },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: "prompt muito longo" }, { status: 400 });
    }
    personaOverride = r.persona;
    horarioOverride = horarioCadastrado(r.config);
  } else if (body.mode === "avancado") {
    if (body.hours !== undefined) horarioOverride = horarioCadastrado({ hours: body.hours });
    // `buildAdvancedPersona` faz as duas coisas que importam: tira do texto dele
    // qualquer seção da base (para não duplicar) e RECOLA o rabo invariante. Sem
    // recolar, o teste rodaria sem contrato de saída e não provaria nada.
    const r = compilePersona({
      mode: "avancado",
      persona: body.persona,
      handoffNotice:
        typeof body.handoffNotice === "string" ? body.handoffNotice : undefined,
    });
    if (!r.ok) {
      return NextResponse.json(
        {
          error:
            r.motivo === "vazio"
              ? "o prompt não pode ficar vazio"
              : "prompt muito longo",
        },
        { status: 400 }
      );
    }
    personaOverride = r.persona;
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
      retomada,
      pedidosAbertos: Array.isArray(body.pedidosAbertos) ? body.pedidosAbertos : [],
      personaOverride,
      agoraTeste: typeof body.agoraTeste === "string" ? body.agoraTeste : null,
      horarioOverride,
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
