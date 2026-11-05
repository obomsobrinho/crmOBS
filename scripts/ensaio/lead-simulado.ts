import type { ChatTurn } from "@/lib/agent";

// LEAD SIMULADO DO ENSAIO (`lead` no cenário): uma segunda chamada à OpenAI faz o
// papel da pessoa do outro lado. Ela vê SÓ a conversa (o que chegou no WhatsApp
// dela e o que ela mesma escreveu), nunca o prompt do agente, e devolve a próxima
// mensagem ou `[FIM]` quando a pessoa pararia de responder.

export const FIM = "[FIM]";
export const MODELO_DO_LEAD = process.env.ENSAIO_MODELO_LEAD || "gpt-5.4-mini";

export interface LeadSimulado {
  /** Quem é a pessoa, o que quer, temperamento, o que sabe. */
  persona: string;
  /** Teto de mensagens da pessoa nesta conversa (padrão 8). */
  maxTurnos?: number;
}

function instrucoes(persona: string): string {
  return [
    "Você faz o papel de uma pessoa real conversando pelo WhatsApp com uma empresa. Você NÃO é assistente e não ajuda ninguém: você é essa pessoa.",
    "",
    "QUEM VOCÊ É:",
    persona.trim(),
    "",
    "COMO ESCREVER:",
    "- Português do Brasil, do jeito que dono de pequeno negócio escreve no WhatsApp: curto, direto, às vezes sem acento ou pontuação, uma ideia por mensagem.",
    "- Responda só ao que faz sentido para você. Pode desconfiar, demorar a entender, mudar de assunto ou perguntar o que realmente perguntaria.",
    "- Nunca diga que é uma simulação, um teste ou uma IA. Não use emojis em excesso. Não escreva textos longos.",
    "- Escreva SÓ a próxima mensagem, sem aspas e sem rótulo.",
    "",
    `QUANDO PARAR: se a pessoa deixaria de responder agora (foi embora, pegou o link e foi testar, marcou, disse que não quer, pediu SAIR, ou a conversa simplesmente acabou), responda exatamente ${FIM}. Se quiser mandar uma última mensagem antes (como "SAIR" ou "valeu, vou ver"), mande a mensagem agora e só no turno seguinte responda ${FIM}.`,
  ].join("\n");
}

async function chamar(apiKey: string, corpo: Record<string, unknown>): Promise<Response> {
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(corpo),
  });
}

let semTemperatura = false;

/**
 * A próxima fala da pessoa. `conversa` é a do ponto de vista do agente (assistant =
 * empresa, user = pessoa); aqui os papéis se invertem para o modelo do lead.
 */
export async function proximaFalaDoLead(apiKey: string, lead: LeadSimulado, conversa: ChatTurn[]): Promise<string> {
  const messages = [
    { role: "system", content: instrucoes(lead.persona) },
    ...conversa.map((t) => ({ role: t.role === "assistant" ? "user" : "assistant", content: t.content })),
  ];
  // Sem nenhuma fala ainda (contato que chegou sozinho), a pessoa abre a conversa.
  if (conversa.length === 0) messages.push({ role: "user", content: "(Você ainda não falou nada. Mande a primeira mensagem para a empresa.)" });
  const base = { model: MODELO_DO_LEAD, messages };
  let res = await chamar(apiKey, semTemperatura ? base : { ...base, temperature: 0.8 });
  // Modelos com raciocínio só aceitam a temperatura padrão: tenta de novo sem ela.
  if (res.status === 400 && !semTemperatura) {
    semTemperatura = true;
    res = await chamar(apiKey, base);
  }
  if (!res.ok) throw new Error(`o modelo do lead respondeu com erro (${res.status})`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const texto = (data.choices?.[0]?.message?.content ?? "").trim();
  return texto === "" ? FIM : texto;
}

export function temperaturaUsada(): string {
  return semTemperatura ? "padrão do modelo (não aceita 0.8)" : "0.8";
}
