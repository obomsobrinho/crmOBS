import "server-only";
import { FUSO } from "./fuso";
import { calendarioBlock, diaDosHorarios, notaDeHorarios } from "./horarios";
import type { BusinessHours } from "./agent-prompt";

// Cérebro do agente. Função pura de servidor (recebe a chave, não lê env), para
// ser reaproveitável fora da rota (ex.: um futuro playground server-side, cron).
// STATELESS por turno: quem tem o estado é o banco (chat_messages + conversations).
//
// Mantém o MESMO contrato de saída que o n8n espera hoje (Output estruturado do
// nó Atendente): messages (1 a 2), action, summary, preferencia_horario. O n8n
// vira só o cano; este módulo é o que era feito no nó Atendente + OpenAI Chat
// Model + Postgres Chat Memory + Output estruturado.

export type AgentAction = "none" | "agendar" | "pausar";

export interface AgentOutput {
  messages: string[];
  action: AgentAction;
  summary: string;
  preferencia_horario: string;
  /**
   * FILA DE PEDIDOS (27/09/2026): `true` quando a IA pede ajuda por um assunto
   * NOVO, diferente dos pedidos que já estão abertos. É o que separa "o cliente
   * pediu outra coisa" (entra na fila) de "o cliente insistiu no mesmo" (atualiza
   * o pedido aberto). Só o `processTurn` lê; o n8n ignora.
   */
  pedido_novo: boolean;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// TURNO SEM MENSAGEM NOVA DO CLIENTE (27/09/2026, pedido do dono): o time
// orientou um pedido de ajuda e a IA responde NA HORA, em vez de esperar o
// cliente escrever de novo. Não existe mensagem do cliente para fechar o
// histórico, então quem fecha é esta deixa. Ela diz o que fazer e não é
// mostrada a ninguém.
export const DEIXA_RETOMADA =
  "Nota interna do sistema: o cliente NÃO mandou mensagem nova. O time acabou de responder ao pedido de ajuda que você abriu nesta conversa (veja a ORIENTAÇÃO DO OPERADOR). Retome a conversa agora, por iniciativa sua, e dê ao cliente o retorno que você prometeu, seguindo a orientação. Não cumprimente de novo como se fosse o começo da conversa.";

// Modelo usado hoje no nó "OpenAI Chat Model" do n8n. Configurável por env.
export const AGENT_MODEL = process.env.OPENAI_AGENT_MODEL || "gpt-5.4-mini";

// Bloco AGORA, igual ao que o nó Atendente anexa ao systemMessage hoje
// (Luxon: "cccc, dd 'de' LLLL 'de' yyyy, HH:mm", fuso de São Paulo). Assim o
// agente segue sabendo data e hora. Sem travessão.
export function agoraBlock(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  const quando = `${get("weekday")}, ${get("day")} de ${get("month")} de ${get("year")}, ${get("hour")}:${get("minute")}`;
  return `### AGORA\nData e hora atuais (São Paulo): ${quando}. Qualquer horário de hoje até ${get("hour")}:${get("minute")} já passou.`;
}

// Orientação do operador (handoff coach): um humano do time disse o que a IA
// deve fazer no próximo turno. É instrução prioritária e confiável (vem do time,
// não do cliente). Injetada no system para a IA retomar sozinha a conversa.
export function operatorBlock(instruction: string, now: Date = new Date()): string {
  const nota = notaDeHorarios(instruction, now);
  const dia = diaDosHorarios(instruction, now);
  return [
    "### ORIENTAÇÃO DO OPERADOR",
    "Um atendente humano do time revisou esta conversa e te orientou sobre o que fazer AGORA. Trate isto como instrução prioritária e confiável (vem do time, não do cliente). Siga a orientação JÁ nesta resposta, mesmo que seja a primeira da conversa ou que o cliente ainda não tenha tocado no assunto (não deixe para depois), com suas próprias palavras e no seu tom, sem dizer que recebeu uma orientação e sem citar o time. Continue seguindo o formato de saída de sempre.",
    // ⚠️ 26/09/2026: o modelo copiava a orientação como ela foi escrita e dizia
    // ao próprio cliente "como esse cliente é indicação". A orientação é um
    // bilhete do time SOBRE o cliente; a resposta é PARA ele.
    "A orientação foi escrita pelo time falando DO cliente (\"este cliente\", \"ele\", \"ela\"). Você está falando COM o cliente: nunca se refira a ele em terceira pessoa e nunca copie a frase da orientação. Converta para a segunda pessoa. Exemplo: a orientação \"este cliente é indicação, ofereça 10% de desconto\" vira algo como \"como você veio por indicação, consigo te oferecer 10% de desconto\".",
    // ⚠️ 30/09/2026, achado do dono às 22h: a orientação "tenho disponibilidade
    // às 16h" virou "Tenho disponibilidade às 16h. Você consegue?", sem o dia
    // (0 de 3 medido). A regra de datas da base não bastou, porque esta seção vem
    // depois e manda seguir a orientação; por isso ela é repetida aqui.
    // A conta "já passou ou não" é do CÓDIGO (`lib/horarios.ts`, 01/10/2026): o
    // modelo errava para os dois lados ("hoje às 16h" às 22h, "amanhã" às 10h).
    ...(nota
      ? [`Horários citados na orientação (diga sempre o dia junto da hora):\n${nota}`]
      : []),
    `Orientação: ${instruction.trim()}${dia ? ` (ou seja: ${dia})` : ""}`,
  ].join("\n");
}

// Trechos recuperados da base de conhecimento (RAG), injetados no system. A
// seção FONTES E HONESTIDADE da persona já manda tratar isto como fonte de
// verdade e não ir além do que estiver aqui.
export function knowledgeBlock(chunks: string[]): string {
  const body = chunks
    .map((c, i) => `--- trecho ${i + 1} ---\n${c.trim()}`)
    .join("\n\n");
  return [
    "### BASE DE CONHECIMENTO (trechos recuperados)",
    "Trechos da base de conhecimento da empresa relevantes para esta mensagem. Use como fonte de verdade. Se a resposta não estiver aqui nem nas outras seções, diga que vai confirmar com o time.",
    body,
  ].join("\n");
}

// Schema da saída estruturada. Sem minItems/maxItems (não suportados no modo
// strict da OpenAI); o limite de 1 a 2 mensagens fica no prompt e na blindagem.
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      items: { type: "string" },
      description:
        "1 ou 2 mensagens naturais para enviar no WhatsApp. Nunca cortar no meio de uma frase.",
    },
    action: {
      type: "string",
      enum: ["none", "agendar", "pausar"],
      description:
        "none = seguir a conversa. agendar = a pessoa combinou dia e período com o time. pausar = a pessoa quer falar com um humano ou o assunto saiu do escopo.",
    },
    summary: {
      type: "string",
      description:
        "Resumo do caso para o time. Preencha quando action for agendar ou pausar; vazio quando none.",
    },
    preferencia_horario: {
      type: "string",
      description:
        "Dia e período preferidos pela pessoa (ex.: quarta de manhã). Só quando action for agendar.",
    },
    pedido_novo: {
      type: "boolean",
      description:
        "Só vale quando action for agendar ou pausar (com none, false). false SOMENTE quando o cliente repete ou cobra um pedido que JÁ ESTÁ listado em PEDIDOS DE AJUDA EM ABERTO, sobre o MESMO assunto daquele pedido. Qualquer assunto diferente de todos os listados é true, mesmo que o cliente já tenha comentado dele antes na conversa. Na dúvida, true: pedido repetido o time fecha em um clique, pedido engolido ninguém vê.",
    },
  },
  required: ["messages", "action", "summary", "preferencia_horario", "pedido_novo"],
  additionalProperties: false,
} as const;

export class AgentError extends Error {}

/**
 * Consumo do turno, como a API do modelo informa. Existe porque é o único jeito
 * de saber o custo real por conversa (a coluna mais chutada da tabela de preços).
 * `null` quando a resposta não trouxe `usage`.
 */
export interface TurnUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  /**
   * Quantos dos tokens de entrada vieram do CACHE (leitura de um prefixo que a
   * OpenAI já tinha visto). Sai de `usage.prompt_tokens_details.cached_tokens`.
   *
   * Sem este número a margem do plano é chute: o cache de prompt deixou de ser
   * otimização e virou pré-requisito comercial. `null` = a resposta não informou;
   * `0` = o prefixo não bateu, e o PRIMEIRO turno de uma conversa é sempre 0.
   */
  cachedInputTokens: number | null;
}

export interface AgentRun {
  output: AgentOutput;
  usage: TurnUsage | null;
  /** Modelo que atendeu de fato (o env pode trocar). */
  model: string;
}

// Roda um turno do agente. Lança AgentError em falha (a rota mapeia para 502).
export async function runAgent(params: {
  persona: string;
  history: ChatTurn[];
  /** `null` = turno de retomada, sem mensagem nova do cliente (fecha com `DEIXA_RETOMADA`). */
  message: string | null;
  apiKey: string;
  /** Trechos recuperados da base de conhecimento (RAG), se houver. */
  knowledge?: string[];
  /** Orientação do operador para este turno (handoff coach), se houver. */
  operatorInstruction?: string | null;
  /** Resumos dos pedidos de ajuda ainda abertos (produção). */
  pedidosAbertos?: string[];
  /** Pedidos de ajuda já resolvidos, com a hora (produção). */
  pedidosResolvidos?: string[];
  model?: string;
  now?: Date;
  /**
   * Horário CADASTRADO do tenant (`horarioCadastrado`), ou null. Alimenta o
   * `### CALENDÁRIO`: sem horário, o bloco sai só com as datas.
   */
  hours?: BusinessHours | null;
}): Promise<AgentRun> {
  const { persona, history, message, apiKey } = params;
  const model = params.model || AGENT_MODEL;

  const parts = [persona];
  if (params.knowledge && params.knowledge.length > 0) {
    parts.push(knowledgeBlock(params.knowledge));
  }
  parts.push(agoraBlock(params.now));
  // O calendário vem colado no AGORA: o modelo errava a conta de dia da semana,
  // expediente e "já passou" (bateria de 05/10/2026), então ela chega pronta.
  parts.push(calendarioBlock(params.now ?? new Date(), params.hours ?? null));
  // Depois do AGORA, junto do que muda a cada turno: não mexe no prefixo que o
  // cache de prompt reaproveita (persona).
  if (params.pedidosResolvidos && params.pedidosResolvidos.length > 0) {
    parts.push(pedidosResolvidosBlock(params.pedidosResolvidos));
  }
  if (params.pedidosAbertos && params.pedidosAbertos.length > 0) {
    parts.push(pedidosAbertosBlock(params.pedidosAbertos));
  }
  // A orientação do operador vai por último (recência): é o que a IA deve
  // priorizar neste turno.
  if (params.operatorInstruction && params.operatorInstruction.trim()) {
    parts.push(operatorBlock(params.operatorInstruction, params.now));
  }
  const system = parts.join("\n\n");
  const messages = [
    { role: "system", content: system },
    ...history.map((t) => ({ role: t.role, content: t.content })),
    message === null
      ? { role: "system", content: DEIXA_RETOMADA }
      : { role: "user", content: message },
  ];

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: { name: "resposta_agente", strict: true, schema: OUTPUT_SCHEMA },
        },
      }),
    });
  } catch {
    throw new AgentError("falha de rede ao contatar o modelo");
  }

  if (!res.ok) {
    // Não vaza a chave nem o corpo bruto; só o status para diagnóstico.
    throw new AgentError(`o modelo respondeu com erro (${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new AgentError("o modelo não retornou resposta");

  let parsed: Partial<AgentOutput>;
  try {
    parsed = JSON.parse(content) as Partial<AgentOutput>;
  } catch {
    throw new AgentError("o modelo não seguiu o formato esperado");
  }

  // O consumo vem de graça na resposta. Registrar é o que permite saber o custo
  // real por conversa em vez de estimar. O campo de cache é opcional na API, e
  // um modelo que não o informe não pode virar erro aqui: fica null.
  const cached = data.usage?.prompt_tokens_details?.cached_tokens;
  const usage: TurnUsage | null = data.usage
    ? {
        inputTokens:
          typeof data.usage.prompt_tokens === "number" ? data.usage.prompt_tokens : null,
        outputTokens:
          typeof data.usage.completion_tokens === "number"
            ? data.usage.completion_tokens
            : null,
        cachedInputTokens: typeof cached === "number" ? cached : null,
      }
    : null;

  return { output: normalizeOutput(parsed), usage, model };
}

// Blindagem: garante 1 a 2 mensagens não vazias e um action válido, mesmo que o
// modelo escorregue. Igual em espírito ao autoFix do Output estruturado do n8n.
export function normalizeOutput(raw: Partial<AgentOutput>): AgentOutput {
  const messages = (Array.isArray(raw.messages) ? raw.messages : [])
    .filter((m): m is string => typeof m === "string" && m.trim() !== "")
    .slice(0, 2);
  if (messages.length === 0) {
    messages.push("Deixa eu confirmar isso com o time e já te retorno.");
  }
  const action: AgentAction =
    raw.action === "agendar" || raw.action === "pausar" ? raw.action : "none";
  return {
    messages,
    action,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    preferencia_horario:
      typeof raw.preferencia_horario === "string" ? raw.preferencia_horario : "",
    pedido_novo: raw.pedido_novo === true,
  };
}

// Pedidos de ajuda que o time JÁ resolveu nesta conversa, com a hora em que
// fecharam (ver `pedidosResolvidos` em lib/agent-turn.ts).
export function pedidosResolvidosBlock(linhas: string[]): string {
  return [
    "### PEDIDOS DE AJUDA JÁ RESOLVIDOS",
    "Pedidos que você passou ao time nesta conversa e que o time já resolveu, com dia e hora em que foram resolvidos. Estão ENCERRADOS: não peça ajuda de novo pelo mesmo assunto. Se o cliente só agradecer, confirmar ou disser que aguarda, siga a conversa normalmente. Peça ajuda ao time só por um assunto NOVO.",
    ...linhas.map((l) => `- ${l}`),
  ].join("\n");
}

// Pedidos de ajuda que o time ainda não respondeu nesta conversa. Sem isto, a IA
// não tem como dizer se o cliente trouxe um assunto novo (vai para a fila) ou
// só insistiu num que já está com o time (`pedido_novo`).
export function pedidosAbertosBlock(resumos: string[]): string {
  return [
    "### PEDIDOS DE AJUDA EM ABERTO",
    "Pedidos que você já passou ao time nesta conversa e que ainda não foram respondidos. Se o cliente insistir ou cobrar UM DESTES assuntos, diga que o time já está vendo e use pedido_novo = false. Assunto que não está nesta lista é pedido novo (pedido_novo = true).",
    ...resumos.map((r, i) => `${i + 1}. ${r}`),
  ].join("\n");
}
