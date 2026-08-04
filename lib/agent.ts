import "server-only";

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
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Modelo usado hoje no nó "OpenAI Chat Model" do n8n. Configurável por env.
export const AGENT_MODEL = process.env.OPENAI_AGENT_MODEL || "gpt-5.4-mini";

// Bloco AGORA, igual ao que o nó Atendente anexa ao systemMessage hoje
// (Luxon: "cccc, dd 'de' LLLL 'de' yyyy, HH:mm", fuso de São Paulo). Assim o
// agente segue sabendo data e hora. Sem travessão.
export function agoraBlock(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
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
  return `### AGORA\nData e hora atuais (São Paulo): ${quando}.`;
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
  },
  required: ["messages", "action", "summary", "preferencia_horario"],
  additionalProperties: false,
} as const;

export class AgentError extends Error {}

// Roda um turno do agente. Lança AgentError em falha (a rota mapeia para 502).
export async function runAgent(params: {
  persona: string;
  history: ChatTurn[];
  message: string;
  apiKey: string;
  /** Trechos recuperados da base de conhecimento (RAG), se houver. */
  knowledge?: string[];
  model?: string;
  now?: Date;
}): Promise<AgentOutput> {
  const { persona, history, message, apiKey } = params;
  const model = params.model || AGENT_MODEL;

  const parts = [persona];
  if (params.knowledge && params.knowledge.length > 0) {
    parts.push(knowledgeBlock(params.knowledge));
  }
  parts.push(agoraBlock(params.now));
  const system = parts.join("\n\n");
  const messages = [
    { role: "system", content: system },
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: message },
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
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new AgentError("o modelo não retornou resposta");

  let parsed: Partial<AgentOutput>;
  try {
    parsed = JSON.parse(content) as Partial<AgentOutput>;
  } catch {
    throw new AgentError("o modelo não seguiu o formato esperado");
  }

  return normalizeOutput(parsed);
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
  };
}
