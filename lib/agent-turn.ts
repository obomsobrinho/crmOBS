import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { buildFallbackPersona, compilePersona } from "@/lib/agent-prompt";
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
import { betaAberto } from "@/lib/beta";
import type {
  TurnDiagnostics,
  RagMatchDiag,
  PersonaOrigem,
} from "@/lib/agent-diagnostics";

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
  /**
   * TURNO DE RETOMADA (27/09/2026, pedido do dono): o time orientou um pedido
   * de ajuda e a IA responde NA HORA, sem esperar o cliente escrever de novo.
   * `message` é ignorada (não existe mensagem nova) e a orientação vem daqui,
   * não de `pending_instruction`. Em produção quem chama é
   * `POST /api/conversations/orientar`, que já fechou o pedido e envia a resposta;
   * no dryRun, a bancada de teste (29/09/2026), que mostra o pedido de ajuda na
   * conversa de teste e deixa o dono orientar como faria no atendimento.
   */
  retomada?: { instruction: string } | null;
  /**
   * Só no dryRun: os pedidos de ajuda ainda abertos NA CONVERSA DE TESTE (a
   * bancada guarda do lado dela). Em produção a lista sai da tabela `handoffs`.
   */
  pedidosAbertos?: string[];
}

/**
 * Texto que vale alguma coisa, ou nada. Colunas de `clients` chegam como
 * `unknown` do Supabase, e o cuidado é sempre o mesmo: string em branco é tão
 * ausente quanto `null`, e persona ou nome só de espaço não pode virar prompt.
 */
const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;

// Monta a persona A CADA TURNO, a partir da configuração do tenant (decisão de
// 17/09/2026). Antes o texto vinha pronto de `clients.persona`, grudado no
// momento do Salvar, e a consequência era que melhoria na base do prompt só
// chegava em quem salvasse de novo: quem publicou em agosto seguia com a base de
// agosto para sempre. Montar na leitura é o padrão em produto multi-tenant, e
// não custa o cache de prompt, porque a string sai idêntica enquanto a
// configuração e a base não mudarem (a ordem do prefixo é a de `lib/agent.ts`).
//
// ⚠️ `clients.persona` NÃO deixou de existir nem de ser gravada: ela é o
// registro do que foi publicado (é o que `agent_publications` guarda, e o que
// responde "o que o agente estava dizendo na terça") e é a QUEDA daqui. Se a
// montagem falhar, por configuração incompleta ou qualquer outro motivo, o pior
// caso vira o comportamento antigo, nunca um agente mudo.
//
// ⚠️ O preço da decisão, que é real: mudança na base entra em produção para
// todos os tenants na mensagem seguinte, sem revisão. O portão combinado com o
// dono é `npm run test:e2e:ia` verde antes de subir deploy que mexa na base.
function personaDoTenant(client: {
  persona?: unknown;
  agent_config?: unknown;
  prompt_mode?: unknown;
  name?: unknown;
}): { persona: string; origem: PersonaOrigem } {
  const salva = texto(client.persona);
  // Sem normalizar para "a empresa" aqui: `buildFallbackPersona` já faz esse
  // default. Duas cópias do mesmo literal é uma para esquecer de mudar.
  const empresa = texto(client.name) ?? "";
  try {
    const cfg = client.agent_config as { handoffNotice?: string } | null;
    const r =
      client.prompt_mode === "avancado"
        ? compilePersona({
            mode: "avancado",
            persona: salva,
            handoffNotice: cfg?.handoffNotice,
          })
        : compilePersona({ mode: "guiado", config: client.agent_config });
    if (r.ok) return { persona: r.persona, origem: "montada" };
    // ⚠️ "longo" NÃO cai para a salva: quem salva recusa acima do limite, mas no
    // atendimento trocar o prompt de hoje por um de meses atrás é pior que servir
    // um prompt comprido. Vai montado, e a origem registra que passou do limite.
    if (r.motivo === "longo")
      return { persona: r.persona, origem: "montada_longa" };
  } catch {
    // Montagem de texto nunca derruba atendimento.
  }
  return salva
    ? { persona: salva, origem: "salva" }
    : { persona: buildFallbackPersona(empresa), origem: "fallback" };
}

export async function processTurn(
  params: ProcessTurnParams
): Promise<{ output: AgentOutput; diagnostics: TurnDiagnostics }> {
  const { clientId, phone, apiKey } = params;
  const dryRun = params.dryRun === true;
  const retomada = params.retomada?.instruction?.trim() ? params.retomada : null;
  const message = retomada ? "" : params.message;
  const svc = createServiceClient();
  const t0 = Date.now();

  // Configuração do tenant. A persona é MONTADA NA LEITURA (ver
  // `personaDoTenant`), então o que importa aqui é `agent_config` +
  // `prompt_mode`; `persona` vem junto porque é a queda. As colunas de
  // assinatura vêm no mesmo select para o gate abaixo.
  const { data: client, error: clientErr } = await svc
    .from("clients")
    .select(
      "persona, agent_config, prompt_mode, name, subscription_status, trial_ends_at, grace_until, agent_published_at, agent_enabled"
    )
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr) throw new TurnError(500, "falha ao carregar o tenant");
  if (!client) throw new TurnError(404, "tenant não encontrado");

  // Gate de assinatura no servidor. Vem ANTES do modelo e do retrieval de
  // propósito: conta bloqueada não gasta token nosso e o agente fica em silêncio
  // (o nó do n8n recebe 402 e nada é enviado nem gravado). O layout do app cobre
  // as telas; este é o caminho que o n8n usa sem passar por layout nenhum.
  const access = accessState(
    {
      subscription_status: (client.subscription_status as string) ?? "",
      trial_ends_at: (client.trial_ends_at as string | null) ?? null,
      grace_until: (client.grace_until as string | null) ?? null,
    },
    undefined,
    // A MESMA chave do beta que as telas usam: se só a tela liberasse, o
    // testador veria o app aberto e o agente mudo no WhatsApp.
    { betaAberto: betaAberto() }
  );
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
  const emEdicao = dryRun ? texto(params.personaOverride) : null;
  // ⚠️ A ORIGEM da persona entra no diagnóstico, e não é enfeite: as quedas de
  // `personaDoTenant` são silenciosas por construção (servir o prompt antigo é
  // melhor que emudecer), e sem registrar isso uma regressão em que TODO tenant
  // volta para a persona salva seria invisível. "salva" em produção é ALARME.
  const doTenant = emEdicao ? null : personaDoTenant(client);
  const persona = emEdicao ?? doTenant!.persona;
  const personaOrigem: PersonaOrigem = emEdicao ? "override" : doTenant!.origem;

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
  // Pedidos de ajuda ainda abertos, do mais antigo para o mais novo (a fila).
  let abertos: { id: number; summary: string | null }[] = [];
  let resolvidos: string[] = [];
  if (dryRun) {
    history = sanitizeHistory(params.history);
    instruction = retomada
      ? retomada.instruction.trim()
      : typeof params.instruction === "string" && params.instruction.trim()
        ? params.instruction.trim()
        : null;
    abertos = (Array.isArray(params.pedidosAbertos) ? params.pedidosAbertos : [])
      .filter((t): t is string => typeof t === "string" && t.trim() !== "")
      .slice(0, 10)
      .map((summary, i) => ({ id: -1 - i, summary: summary.slice(0, 500) }));
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
    // Pedidos de ajuda JÁ FECHADOS (ver `pedidosResolvidos`). Best-effort: sem
    // eles o turno segue como antes.
    const { data: pedidos } = await svc
      .from("handoffs")
      .select("summary, closed_at, closed_how")
      .eq("client_id", clientId)
      .eq("phone", phone)
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(HISTORY_ROWS);
    history = buildHistory(rows);
    resolvidos = pedidosResolvidos(rows, pedidos);
    const { data: fila } = await svc
      .from("handoffs")
      .select("id, summary")
      .eq("client_id", clientId)
      .eq("phone", phone)
      .is("closed_at", null)
      .order("opened_at", { ascending: true });
    abertos = (fila ?? []) as { id: number; summary: string | null }[];
    const pend = (conv?.pending_instruction as string | null) ?? null;
    instruction = retomada
      ? retomada.instruction.trim()
      : pend && pend.trim()
        ? pend.trim()
        : null;
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
      // Na retomada não há mensagem do cliente: o que diz o assunto é a orientação.
      const consulta = retomada ? retomada.instruction : message;
      const [queryVec] = await embedTexts(apiKey, [consulta.slice(0, MAX_TURN_CHARS)]);
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
    message: retomada ? null : message.slice(0, MAX_TURN_CHARS),
    apiKey,
    knowledge,
    operatorInstruction: instruction,
    pedidosResolvidos: resolvidos,
    pedidosAbertos: abertos
      .map((p) => (p.summary ?? "").trim())
      .filter((t) => t !== ""),
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
  // Na retomada a orientação não veio da coluna, e o pedido já foi fechado por
  // quem chamou: nada a consumir aqui.
  if (!dryRun && instruction && !retomada) {
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

    // ⚠️ A orientação NÃO fecha mais pedido aqui (27/09/2026). Quem fecha é a
    // porta que o time usou (`POST /api/conversations/orientar`), na hora, e só
    // o pedido que ele respondeu. Fechar "todos os abertos" neste ponto, como
    // era antes da fila, resolveria de brinde pedidos que ninguém respondeu.
  }

  // FILA DE PEDIDOS (27/09/2026, decisão do dono). Sem pedido aberto, este
  // abre o primeiro e marca `handoff_at` (a espera conta dele). Com pedido
  // aberto, só entra na fila se a IA disse que o assunto é NOVO
  // (`pedido_novo`, que ela decide vendo a lista PEDIDOS DE AJUDA EM
  // ABERTO); o cliente insistindo no mesmo assunto não gera pedido repetido.
  // O guardrail que degrada para `pausar` só abre quando não há nenhum.
  // ⚠️ REDE DE SEGURANÇA (28/09/2026, teste ao vivo): a IA às vezes dizia
  // "mesmo pedido" para assunto novo (orçamento do site com a nota fiscal
  // aberta), e o pedido sumia sem ninguém ver. Se o resumo não divide
  // nenhuma palavra de assunto com os pedidos abertos, entra na fila mesmo
  // assim. Errar para o lado da duplicata é de propósito: pedido repetido o
  // time fecha em um clique, pedido engolido ninguém vê.
  // Calculado FORA do ramo de produção porque a bancada (dryRun) mostra o
  // pedido pela mesma regra; regra copiada nos dois lugares divergiria.
  const novo =
    output.pedido_novo ||
    !abertos.some((p) => mesmoAssunto(output.summary, p.summary ?? ""));
  // "Sem pedido aberto": no dryRun só existe a lista que a bancada mandou
  // (`handoff_at` é da conversa de verdade e não vale para o teste).
  const semPedido = dryRun ? abertos.length === 0 : !handoffAt || abertos.length === 0;
  // ⚠️ A RETOMADA NUNCA ABRE PEDIDO (29/09/2026, achado do dono): ela é a IA
  // cumprindo a orientação que acabou de fechar o pedido, sem mensagem nova do
  // cliente. Num assunto sério ela ainda devolve `pausar`, e como a fila tinha
  // acabado de esvaziar, o mesmo assunto voltava como pedido novo na hora.
  const entraNaFila =
    !retomada &&
    output.action !== "none" &&
    (semPedido || (novo && !guardrail.blocked));

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

      // A fila (`entraNaFila`, calculada acima). Best-effort: um erro aqui não
      // pode derrubar a resposta ao cliente.
      if (entraNaFila) {
        const abertoEm = new Date().toISOString();
        const { error: rErr } = await svc
          .from("handoffs")
          .insert({ client_id: clientId, phone, opened_at: abertoEm, summary: output.summary });
        if (rErr) console.error("falha ao registrar o handoff:", rErr.message);
        if (!handoffAt) {
          const { error: hErr } = await svc
            .from("conversations")
            .update({ handoff_at: abertoEm })
            .eq("client_id", clientId)
            .eq("phone", phone);
          if (hErr) console.error("falha ao abrir o handoff:", hErr.message);
        }
      }
    }
  }

  const diagnostics: TurnDiagnostics = {
    personaOrigem,
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
    pedidoNaFila: entraNaFila,
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
    output: {
      messages: [],
      action: "none",
      summary: "",
      preferencia_horario: "",
      pedido_novo: false,
    },
    diagnostics: {
      // Turno silenciado não chega a montar persona: nada foi lido do tenant e
      // nenhum prompt foi para o modelo. "fallback" seria mentira, então a
      // origem aqui é a que descreve o que houve.
      personaOrigem: "nenhuma",
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
  for (const r of (rows ?? []).slice().reverse()) {
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

// ⚠️ OS PEDIDOS JÁ RESOLVIDOS, COM A HORA (27/09/2026, achado do dono): a IA
// abria um pedido, o time resolvia, o cliente respondia "ok, fico no aguardo" e
// a IA pedia ajuda DE NOVO pelo mesmo assunto, porque nada dizia a ela que o time
// já tinha respondido. Cada pedido fechado dentro da janela do histórico vira uma
// linha com a hora em que fechou (seção PEDIDOS DE AJUDA JÁ RESOLVIDOS).
// ⚠️ NÃO como nota no meio do histórico: essa foi a primeira versão, e as notas
// abafavam a ORIENTAÇÃO DO OPERADOR (medido: com 8 notas na conversa de teste a
// IA ignorou o desconto orientado 2 de 2 vezes; sem elas, usou 2 de 2).
function pedidosResolvidos(
  rows: { created_at?: string | null }[] | null,
  pedidos: { summary: string | null; closed_at: string | null; closed_how: string | null }[] | null
): string[] {
  const tempos = (rows ?? [])
    .map((r) => Date.parse(r.created_at ?? ""))
    .filter((t) => Number.isFinite(t));
  // Só o que cabe na janela do histórico: pedido anterior à primeira mensagem
  // lida falaria de um assunto que a IA não enxerga.
  const inicio = tempos.length > 0 ? Math.min(...tempos) : -Infinity;
  return (pedidos ?? [])
    .map((p) => ({ p, t: Date.parse(p.closed_at ?? "") }))
    .filter(({ t }) => Number.isFinite(t) && t >= inicio)
    .sort((x, y) => x.t - y.t)
    // Os dois mais recentes bastam para a IA não reabrir o assunto de agora, e
    // lista longa de pedidos velhos só disputa atenção com a orientação do time.
    .slice(-2)
    .map(({ p, t }) => {
      const hora = new Date(t).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      });
      // ⚠️ Sem a palavra "orientação" aqui: com ela, a IA lia a ORIENTAÇÃO DO
      // OPERADOR do turno como já usada e a ignorava (medido, 0 de 3).
      return `${hora}: ${p.summary?.trim() || "pedido sem resumo"} (já respondido pelo time)`;
    });
}

// Palavras que aparecem em QUALQUER pedido de ajuda e por isso não dizem o
// assunto ("cliente quer falar com uma pessoa do time sobre..."). Fora delas,
// uma palavra em comum basta para dois resumos serem do mesmo assunto.
const PALAVRAS_DE_PEDIDO = new Set([
  "cliente", "quer", "queria", "pediu", "pedido", "pede", "falar", "fala", "pessoa", "alguem",
  "time", "equipe", "humano", "atendente", "sobre", "contato", "retorno", "resposta", "responder",
  "ajuda", "saber", "perguntou", "pergunta", "verificar", "confirmar", "dono", "voces", "para",
  "com", "uma", "mais", "ainda", "agora", "direto", "depois", "entender", "conversar", "cobrou",
  "cobra", "insistiu", "novamente", "tambem", "outra", "outro", "coisa", "assunto", "questao",
]);
function palavrasDeAssunto(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 4 && !PALAVRAS_DE_PEDIDO.has(p))
  );
}
/** Dois resumos de pedido falam do mesmo assunto? (uma palavra de assunto em comum) */
export function mesmoAssunto(a: string, b: string): boolean {
  const pa = palavrasDeAssunto(a);
  if (pa.size === 0) return true; // resumo vazio de assunto: não dá para dizer que é novo
  for (const p of palavrasDeAssunto(b)) if (pa.has(p)) return true;
  return false;
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
