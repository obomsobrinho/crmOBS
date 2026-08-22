import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { buildFallbackPersona } from "@/lib/agent-prompt";
import {
  runAgent,
  type AgentOutput,
  type ChatTurn,
  type TurnUsage,
} from "@/lib/agent";
import { applyGuardrail } from "@/lib/guardrail";
import { embedTexts, toVector } from "@/lib/rag";
import { nextIaStage } from "@/lib/pipeline";
import { accessState } from "@/lib/billing";
import type { TurnDiagnostics, RagMatchDiag } from "@/lib/agent-diagnostics";

// Orquestração de um turno do agente. STATELESS por turno; reaproveitável pelas
// duas rotas: /api/agent (n8n, autenticado pelo segredo) e a bancada de teste
// (playground, dono-only) em modo dryRun. Devolve { output, diagnostics }.
//
// dryRun = true: não persiste NADA (nem chat_messages, nem qualificação, nem
// move o card). O histórico e o estágio atual vêm do chamador (o playground os
// mantém do lado dele e reseta quando quiser). RAG e modelo rodam de verdade
// (são só leitura), então o diagnóstico reflete o comportamento real.

// Quantas linhas de chat_messages carregar de contexto (produção). Cada linha
// tem user + bot, então ~10 linhas equivalem à janela de 20 mensagens.
const HISTORY_ROWS = 10;
const MAX_TURN_CHARS = 2000;
const RAG_PREVIEW_CHARS = 240;

// Erro do turno com status HTTP para a rota mapear. Falha do modelo continua
// sendo AgentError (a rota mapeia para 502).
export class TurnError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "TurnError";
  }
}

export interface ProcessTurnParams {
  clientId: string;
  phone: string;
  message: string;
  apiKey: string;
  dryRun?: boolean;
  // Só no dryRun: histórico, estágio e orientação simulados vêm do chamador
  // (playground), sem tocar chat_messages / conversations.
  history?: ChatTurn[];
  currentStage?: string | null;
  stageSource?: string | null;
  instruction?: string | null;
  /**
   * Persona a usar NO LUGAR da que está salva em `clients.persona`.
   *
   * Existe para a bancada de teste dentro do `/agente` poder provar a
   * configuração que a pessoa está EDITANDO, sem salvar. Salvar já é publicar
   * (o n8n lê `clients.persona` ao vivo), então testar salvando significa mexer
   * no agente que está atendendo cliente de verdade.
   *
   * **Honrado SÓ no dryRun**, e a guarda é aqui e não na rota: uma persona que
   * chega de fora nunca pode atender no WhatsApp, mesmo que alguém erre a rota
   * um dia. Quem monta a persona é o servidor (o rabo da base é recolado lá),
   * então isto já chega compilado.
   */
  personaOverride?: string | null;
}

export async function processTurn(
  params: ProcessTurnParams
): Promise<{ output: AgentOutput; diagnostics: TurnDiagnostics }> {
  const { clientId, phone, message, apiKey } = params;
  const dryRun = params.dryRun === true;
  const svc = createServiceClient();
  const t0 = Date.now();

  // Persona do tenant (o n8n lia clients.persona ao vivo; seguimos igual). NÃO
  // recompilar: persona já é o system prompt final. As colunas de assinatura vêm
  // no mesmo select para o gate abaixo.
  const { data: client, error: clientErr } = await svc
    .from("clients")
    .select(
      "persona, name, subscription_status, trial_ends_at, grace_until, agent_published_at, agent_enabled"
    )
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr) throw new TurnError(500, "falha ao carregar o tenant");
  if (!client) throw new TurnError(404, "tenant não encontrado");

  // Gate de assinatura no servidor. Vem ANTES do modelo e do retrieval de
  // propósito: conta bloqueada não gasta token nosso e o agente fica em silêncio
  // (o nó do n8n recebe 402 e nada é enviado nem gravado). O layout do app cobre
  // as telas; este é o caminho que o n8n usa sem passar por layout nenhum.
  const access = accessState({
    subscription_status: (client.subscription_status as string) ?? "",
    trial_ends_at: (client.trial_ends_at as string | null) ?? null,
    grace_until: (client.grace_until as string | null) ?? null,
  });
  // DOIS gates, mesma resposta: turno silencioso, 200 e NÃO erro. O n8n segue o
  // fluxo e GRAVA a mensagem que o cliente mandou, então a conversa continua
  // aparecendo no inbox (como um WhatsApp Web aberto) e nada se perde. O que
  // para é o trabalho: nada de modelo, nada de RAG, nada de token gasto, nada de
  // qualificação nem de card se movendo.
  //
  // 1. Assinatura não está em dia (decisão de produto: em vez de derrubar a
  //    execução do n8n com erro, a IA emudece e as mensagens seguem chegando).
  // 2. Agente não publicado. Vale só fora do dryRun: o playground TEM que
  //    funcionar antes de publicar, senão o passo "testar" seria impossível.
  // Os dois silêncios também são registrados: "quantas mensagens chegaram
  // enquanto o agente estava pausado" é informação que o dono quer ver, e custa
  // uma linha (não houve chamada ao modelo).
  if (access.blocked) {
    const t = silentTurn(t0, { subscriptionBlocked: true });
    await logTurn(svc, {
      clientId,
      phone,
      dryRun,
      diagnostics: t.diagnostics,
      messagesSent: 0,
      silenced: "assinatura",
      model: null,
      usage: null,
    });
    return t;
  }
  // Duas condições, um silêncio: nunca foi ao ar (`agent_published_at` nulo) ou
  // está desligado na chave (`agent_enabled` false). São colunas separadas de
  // propósito: a primeira é o marco do onboarding e nunca é limpa, a segunda é o
  // switch da tela. `!== false` porque a coluna é NOT NULL default true, e na
  // dúvida atender é melhor que emudecer quem já estava no ar.
  const desligado = !client.agent_published_at || client.agent_enabled === false;
  if (!dryRun && desligado) {
    const t = silentTurn(t0, { notPublished: true });
    await logTurn(svc, {
      clientId,
      phone,
      dryRun,
      diagnostics: t.diagnostics,
      messagesSent: 0,
      silenced: "nao_publicado",
      model: null,
      usage: null,
    });
    return t;
  }

  // Persona em edição (bancada dentro do /agente) tem precedência, mas SÓ no
  // dryRun: fora dele a única fonte é o banco.
  const emEdicao =
    dryRun &&
    typeof params.personaOverride === "string" &&
    params.personaOverride.trim()
      ? params.personaOverride
      : null;
  const persona =
    emEdicao ??
    (typeof client.persona === "string" && client.persona.trim()
      ? client.persona
      : buildFallbackPersona((client.name as string) ?? "a empresa"));

  // Histórico: no dryRun vem do chamador (playground); em produção sai de
  // chat_messages (escopo client_id + phone). A mensagem atual ainda não está
  // salva (o n8n grava depois), então o histórico é só o passado.
  // Orientação do operador (handoff coach): no dryRun vem do chamador; em
  // produção sai de conversations.pending_instruction e é consumida uma vez.
  let history: ChatTurn[];
  let instruction: string | null;
  // Handoff já aberto nesta conversa (conversations.handoff_at). Serve para NÃO
  // sobrescrever o primeiro handoff em aberto: é o primeiro que dá a espera real
  // ("esperando há 6h"); o último só troca o resumo.
  let handoffAt: string | null = null;
  if (dryRun) {
    history = sanitizeHistory(params.history);
    instruction =
      typeof params.instruction === "string" && params.instruction.trim()
        ? params.instruction.trim()
        : null;
  } else {
    const [{ data: rows, error: histErr }, { data: conv }] = await Promise.all([
      svc
        .from("chat_messages")
        .select("user_message, bot_message, created_at")
        .eq("client_id", clientId)
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .limit(HISTORY_ROWS),
      svc
        .from("conversations")
        .select("pending_instruction, handoff_at")
        .eq("client_id", clientId)
        .eq("phone", phone)
        .maybeSingle(),
    ]);
    if (histErr) throw new TurnError(500, "falha ao carregar o histórico");
    history = buildHistory(rows);
    const pend = (conv?.pending_instruction as string | null) ?? null;
    instruction = pend && pend.trim() ? pend.trim() : null;
    handoffAt = (conv?.handoff_at as string | null) ?? null;
  }

  // Retrieval da base de conhecimento (RAG). Best-effort e só leitura, então
  // roda igual no dryRun. Só embeda a pergunta quando existe pelo menos um chunk.
  let ragSearched = false;
  let ragMatches: RagMatchDiag[] = [];
  let knowledge: string[] = [];
  try {
    const { count } = await svc
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);
    if ((count ?? 0) > 0) {
      ragSearched = true;
      const [queryVec] = await embedTexts(apiKey, [message.slice(0, MAX_TURN_CHARS)]);
      const { data: matches } = await svc.rpc("match_knowledge_chunks", {
        p_client_id: clientId,
        p_query_embedding: toVector(queryVec),
        p_match_count: 5,
      });
      const rows = ((matches ?? []) as { content: string; similarity: number }[]).filter(
        (m) => typeof m.content === "string" && m.content.trim() !== ""
      );
      knowledge = rows.map((m) => m.content);
      ragMatches = rows.map((m) => ({
        similarity: typeof m.similarity === "number" ? m.similarity : 0,
        preview: m.content.trim().slice(0, RAG_PREVIEW_CHARS),
      }));
    }
  } catch (e) {
    console.error("falha no retrieval do RAG:", e);
  }

  // Modelo. Lança AgentError em falha (a rota mapeia para 502).
  const run = await runAgent({
    persona,
    history,
    message: message.slice(0, MAX_TURN_CHARS),
    apiKey,
    knowledge,
    operatorInstruction: instruction,
  });
  const raw = run.output;

  // Guardrail: checa a resposta pronta antes de sair. Se reprovar, degrada com
  // segurança (pausar) e marca o diagnóstico. Nunca lança. A orientação do
  // operador também vale como fonte autorizada deste turno.
  const guarded = applyGuardrail(raw, { persona, knowledge, instruction });
  const guardrail = guarded.guardrail;

  // Política de handoff (decisão de produto, vale para todos os tenants):
  // HANDOFF NÃO PAUSA A IA E NÃO EMUDECE A IA.
  //
  // A versão anterior fazia as duas coisas: em action=pausar ela zerava
  // `messages` e pausava `dados_cliente.atendimento_ia`. Produção mostrou os dois
  // defeitos juntos numa conversa real: a pessoa perguntou de horário, a IA abriu
  // o handoff em silêncio, a pessoa perguntou "tem alguma vaga pra hoje?" 26
  // segundos depois e, com a IA pausada, esse pedido novo foi gravado mas nunca
  // classificado. Ficou 6h36 sem resposta. E a pausa é porta de mão única (alguém
  // precisa reativar na mão), então 46 dos 47 contatos da OBM estavam com a IA
  // desligada para sempre.
  //
  // Agora: a IA responde uma frase dizendo o que vai verificar (regra e texto
  // base no prompt, ver `handoffNotice` em lib/agent-prompt.ts), marca
  // `handoff_at` e SEGUE ATENDENDO. Cada mensagem nova gera um handoff novo, com
  // o resumo do último pedido. Pausa passa a significar só o que deveria: um
  // humano assumiu (nó "Pausar IA (Franck digitou)" do n8n) ou alguém desligou a
  // IA na chave.
  //
  // O guardrail continua protegido: quando ele reprova, ele mesmo já troca as
  // mensagens pela frase neutra antes de chegar aqui, então nada inventado sai.
  const output = guarded.output;

  // Consumo único: em produção, limpa a orientação depois de usada (best-effort;
  // um erro aqui não pode derrubar a resposta).
  if (!dryRun && instruction) {
    const { error: clrErr } = await svc
      .from("conversations")
      .update({
        pending_instruction: null,
        pending_instruction_at: null,
        pending_instruction_by: null,
      })
      .eq("client_id", clientId)
      .eq("phone", phone);
    if (clrErr) console.error("falha ao limpar a orientação:", clrErr.message);
  }

  // Estágio que a IA moveria; em produção, também aplica (best-effort).
  let stageWouldMove: string | null = null;
  if (output.action !== "none") {
    if (dryRun) {
      const canonical = await loadCanonical(svc, clientId);
      stageWouldMove = nextIaStage({
        action: output.action,
        currentStage: params.currentStage ?? null,
        stageSource: params.stageSource ?? null,
        canonical,
      });
    } else {
      // Persiste a qualificação (alimenta a lista "Precisa de você" e o resumo
      // da IA). Best-effort: um erro aqui não derruba a resposta ao cliente.
      const { error: qErr } = await svc.from("conversation_qualifications").insert({
        client_id: clientId,
        phone,
        action: output.action,
        summary: output.summary,
        preferencia_horario: output.preferencia_horario,
      });
      if (qErr) console.error("falha ao gravar qualificação:", qErr.message);
      stageWouldMove = await advanceStage(svc, clientId, phone, output.action);

      // Abre o handoff: marca que a IA pediu ajuda e o time ainda não respondeu.
      // Só grava quando está nulo, porque o valor que interessa é o PRIMEIRO
      // handoff em aberto (é ele que mede a espera). O resumo do último pedido
      // vem de conversation_qualifications, que ganha uma linha por turno.
      // Quem limpa é o envio manual (/api/send). Best-effort: um erro aqui não
      // pode derrubar a resposta ao cliente.
      if (!handoffAt) {
        const { error: hErr } = await svc
          .from("conversations")
          .update({ handoff_at: new Date().toISOString() })
          .eq("client_id", clientId)
          .eq("phone", phone);
        if (hErr) console.error("falha ao abrir o handoff:", hErr.message);
      }
    }
  }

  const diagnostics: TurnDiagnostics = {
    latencyMs: Date.now() - t0,
    action: output.action,
    summary: output.summary,
    preferenciaHorario: output.preferencia_horario,
    ragSearched,
    ragMatches,
    stageWouldMove,
    guardrail,
    handoffOpened:
      output.action === "pausar" || output.action === "agendar" || guardrail.blocked,
  };

  // Registro do turno. Inclui o dryRun (o token foi gasto de verdade), marcado
  // para o painel filtrar. Best-effort de propósito: medição nunca pode derrubar
  // o atendimento de um cliente.
  await logTurn(svc, {
    clientId,
    phone,
    dryRun,
    diagnostics,
    messagesSent: output.messages.length,
    silenced: null,
    model: run.model,
    usage: run.usage,
  });

  return { output, diagnostics };
}

// Grava o turno em agent_turns. NUNCA lança: um erro de medição não pode virar
// erro de atendimento. O `rag_top_similarity` guarda o melhor trecho recuperado,
// que é o que diz se a base de conhecimento está sendo útil.
async function logTurn(
  svc: ReturnType<typeof createServiceClient>,
  t: {
    clientId: string;
    phone: string;
    dryRun: boolean;
    diagnostics: TurnDiagnostics;
    messagesSent: number;
    silenced: "nao_publicado" | "assinatura" | null;
    model: string | null;
    usage: TurnUsage | null;
  }
): Promise<void> {
  try {
    const top = t.diagnostics.ragMatches.reduce(
      (max, m) => (m.similarity > max ? m.similarity : max),
      0
    );
    const { error } = await svc.from("agent_turns").insert({
      client_id: t.clientId,
      phone: t.phone,
      dry_run: t.dryRun,
      action: t.diagnostics.action,
      messages_sent: t.messagesSent,
      silenced: t.silenced,
      rag_searched: t.diagnostics.ragSearched,
      rag_matches: t.diagnostics.ragMatches.length,
      rag_top_similarity: t.diagnostics.ragMatches.length > 0 ? top : null,
      guardrail_blocked: t.diagnostics.guardrail.blocked,
      guardrail_reason: t.diagnostics.guardrail.reason,
      latency_ms: t.diagnostics.latencyMs,
      model: t.model,
      input_tokens: t.usage?.inputTokens ?? null,
      output_tokens: t.usage?.outputTokens ?? null,
      // Quanto da entrada veio do cache. É o que separa margem medida de margem
      // chutada: sem ele, input_tokens cobra todo turno como entrada nova.
      // `?? null` cobre os dois casos sem número: turno silencioso (não chama o
      // modelo) e resposta que não trouxe o campo.
      cached_input_tokens: t.usage?.cachedInputTokens ?? null,
    });
    if (error) console.error("falha ao registrar o turno:", error.message);
  } catch (e) {
    console.error("falha ao registrar o turno:", e);
  }
}

// Turno que não acontece: a IA fica muda mas o contrato de saída é o normal, com
// 200, para o n8n seguir gravando a mensagem do cliente. A flag no diagnóstico
// diz qual gate silenciou (aparece no playground e no log do n8n).
function silentTurn(
  t0: number,
  flags: { subscriptionBlocked?: boolean; notPublished?: boolean }
): { output: AgentOutput; diagnostics: TurnDiagnostics } {
  return {
    output: { messages: [], action: "none", summary: "", preferencia_horario: "" },
    diagnostics: {
      latencyMs: Date.now() - t0,
      action: "none",
      summary: "",
      preferenciaHorario: "",
      ragSearched: false,
      ragMatches: [],
      stageWouldMove: null,
      guardrail: { blocked: false, reason: null, draft: null },
      handoffOpened: false,
      ...flags,
    },
  };
}

// Normaliza o histórico vindo do chamador (dryRun): mantém só papéis válidos e
// conteúdo não vazio, trunca por turno e limita a janela.
function sanitizeHistory(input: ChatTurn[] | undefined): ChatTurn[] {
  if (!Array.isArray(input)) return [];
  const out: ChatTurn[] = [];
  for (const t of input.slice(-2 * HISTORY_ROWS)) {
    if (!t || (t.role !== "user" && t.role !== "assistant")) continue;
    const content = typeof t.content === "string" ? t.content.trim() : "";
    if (content) out.push({ role: t.role, content: content.slice(0, MAX_TURN_CHARS) });
  }
  return out;
}

// Reconstrói o histórico a partir das linhas de chat_messages (produção).
function buildHistory(
  rows: { user_message: string | null; bot_message: string | null }[] | null
): ChatTurn[] {
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
  return history;
}

// Canônicos ativos do tenant (para calcular o estágio que a IA moveria).
async function loadCanonical(
  svc: ReturnType<typeof createServiceClient>,
  clientId: string
): Promise<{ key: string; position: number }[]> {
  const { data: stages } = await svc
    .from("pipeline_stages")
    .select("key, position, is_canonical, archived")
    .eq("client_id", clientId);
  return ((stages ?? []) as {
    key: string;
    position: number;
    is_canonical: boolean;
    archived: boolean;
  }[])
    .filter((s) => s.is_canonical && !s.archived)
    .map((s) => ({ key: s.key, position: s.position }));
}

// Avança o card da conversa no pipeline quando a IA decide algo. Só toca os
// estágios canônicos do tenant, só avança e nunca sobrescreve um stage que um
// humano definiu (stage_source='human'). No-op seguro se o tenant não tem
// pipeline ou a conversa ainda não existe. Retorna o estágio movido (ou null).
async function advanceStage(
  svc: ReturnType<typeof createServiceClient>,
  clientId: string,
  phone: string,
  action: string
): Promise<string | null> {
  try {
    const canonical = await loadCanonical(svc, clientId);
    if (canonical.length === 0) return null;

    const { data: conv } = await svc
      .from("conversations")
      .select("stage, stage_source")
      .eq("client_id", clientId)
      .eq("phone", phone)
      .maybeSingle();
    if (!conv) return null;

    const target = nextIaStage({
      action,
      currentStage: (conv.stage as string | null) ?? null,
      stageSource: (conv.stage_source as string | null) ?? null,
      canonical,
    });
    if (!target) return null;

    await svc
      .from("conversations")
      .update({
        stage: target,
        stage_source: "ia",
        stage_changed_at: new Date().toISOString(),
      })
      .eq("client_id", clientId)
      .eq("phone", phone);
    return target;
  } catch (e) {
    console.error("falha ao mover o card no pipeline:", e);
    return null;
  }
}
