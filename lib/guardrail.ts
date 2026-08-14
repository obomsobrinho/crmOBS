import type { AgentOutput } from "@/lib/agent";
import type { GuardrailDiag } from "@/lib/agent-diagnostics";

// Guardrail: uma checagem independente da resposta PRONTA do agente, antes de
// sair. É o reforço do eixo "IA que não inventa": a seção FONTES E HONESTIDADE
// da persona pede para o modelo não chutar, mas a mesma chamada que escreve se
// auto-aprova (ponto cego). Aqui, um segundo passo (fora do modelo) confere.
//
// v1 = só regras + checagem contra as fontes autorizadas (persona + trechos do
// RAG). Pega o subconjunto detectável por regra de "resposta fora da base":
// valores/preços, links e telefones que NÃO aparecem em nenhuma fonte, mais um
// conjunto de alta precisão de promessas/garantias. A checagem semântica geral
// (a resposta responde MESMO à pergunta a partir da base?) fica para um segundo
// modelo, adiado por custo/latência.
//
// Módulo puro (sem server-only): testável e reaproveitável. NUNCA lança: em
// qualquer erro interno, deixa a resposta passar (não pode quebrar o turno).

// Mensagem neutra e honesta quando a resposta é retida (mesmo tom da persona).
const SAFE_MESSAGE =
  "Deixa eu confirmar isso com o time pra te passar a informação certa. Já te retorno.";

// Promessas fortes demais para um atendimento: garantias de resultado. Lista
// curada de alta precisão (evita pegar "com certeza posso te ajudar", comum e
// inofensivo). Comparação sem acento e em minúsculas.
const OVER_PROMISES = [
  "garanto que",
  "eu garanto",
  "garantimos que",
  "garantido que",
  "100% garantido",
  "cem por cento garantido",
  "resultado garantido",
  "prometo que",
  "prometemos que",
  "sem nenhum risco",
  "certeza absoluta",
  "com toda certeza vai",
];

// Aplica o guardrail. Se reprovar, degrada com segurança: troca as mensagens por
// uma neutra e força action=pausar (abre handoff para um humano assumir ou
// orientar a IA no próximo turno). Guarda o rascunho retido só para diagnóstico.
// ctx.instruction (handoff coach): quando um humano do time orientou este turno,
// o que ele autorizou também vale como fonte (ele pode legitimamente mandar a IA
// dizer um preço/telefone). Um dado inventado que NÃO esteja na orientação nem na
// base continua bloqueado.
export function applyGuardrail(
  output: AgentOutput,
  ctx: { persona: string; knowledge: string[]; instruction?: string | null }
): { output: AgentOutput; guardrail: GuardrailDiag } {
  let reason: string | null = null;
  try {
    reason = checkOutput(output, ctx);
  } catch (e) {
    // Na dúvida, deixa passar: o guardrail nunca pode derrubar o atendimento.
    console.error("falha no guardrail:", e);
    reason = null;
  }

  if (!reason) {
    return { output, guardrail: { blocked: false, reason: null, draft: null } };
  }

  const draft = output.messages.join(" | ");
  const degraded: AgentOutput = {
    messages: [SAFE_MESSAGE],
    action: "pausar",
    summary: `Resposta retida pelo guardrail: ${reason}.`,
    preferencia_horario: "",
  };
  return { output: degraded, guardrail: { blocked: true, reason, draft } };
}

// Retorna o motivo (pt-BR) da primeira regra violada, ou null se passou.
function checkOutput(
  output: AgentOutput,
  ctx: { persona: string; knowledge: string[]; instruction?: string | null }
): string | null {
  const text = output.messages.join("\n");
  const sources = `${ctx.persona}\n${ctx.knowledge.join("\n")}\n${ctx.instruction ?? ""}`;

  const price = firstUngroundedPrice(text, sources);
  if (price) return `mencionou um valor (${price}) que não está na base`;

  const link = firstUngroundedLink(text, sources);
  if (link) return `mencionou um link (${link}) que não está na base`;

  const phone = firstUngroundedPhone(text, sources);
  if (phone) return `mencionou um telefone (${phone}) que não está na base`;

  const promise = firstOverPromise(text);
  if (promise) return `fez uma promessa forte demais ("${promise}")`;

  return null;
}

// ---- Regra 1: valores/preços sem lastro ----
// Um valor citado na resposta só é autorizado se o MESMO número aparecer nas
// fontes. Comparação por token de dígitos (sem centavos, sem separador de
// milhar), então "R$ 200" bate com "200,00" mas não com "1200".
function firstUngroundedPrice(text: string, sources: string): string | null {
  const srcNums = numberSet(sources);
  const re = /r\$\s?\d[\d.]*(?:,\d{1,2})?|\d[\d.]*(?:,\d{1,2})?\s*(?:reais|real)\b/gi;
  for (const m of text.match(re) ?? []) {
    const norm = normalizeNum(m);
    if (norm && !srcNums.has(norm)) return m.trim();
  }
  return null;
}

// Conjunto dos números presentes nas fontes, normalizados (parte inteira).
function numberSet(sources: string): Set<string> {
  const set = new Set<string>();
  for (const m of sources.match(/\d[\d.]*(?:,\d{1,2})?/g) ?? []) {
    const n = normalizeNum(m);
    if (n) set.add(n);
  }
  return set;
}

// "R$ 1.200,00" -> "1200"; "50 reais" -> "50"; "R$50" -> "50".
function normalizeNum(s: string): string {
  return s.split(",")[0].replace(/\D/g, "");
}

// ---- Regra 2: links fabricados ----
// Pega URLs (http/www) ou domínios com TLD comum. Autorizado só se o host
// aparecer nas fontes (comparação em minúsculas).
function firstUngroundedLink(text: string, sources: string): string | null {
  const src = sources.toLowerCase();
  const re =
    /(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9][a-z0-9-]*\.(?:com|com\.br|net|org|io|app|br)\b(?:\/[^\s]*)?/gi;
  for (const m of text.match(re) ?? []) {
    const host = m
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .toLowerCase();
    if (host && !src.includes(host)) return m.trim();
  }
  return null;
}

// ---- Regra 3: telefones fabricados ----
// Telefone BR (10 a 11 dígitos com DDD). Autorizado só se a sequência de
// dígitos aparecer nas fontes (ignorando formatação).
function firstUngroundedPhone(text: string, sources: string): string | null {
  const srcDigits = sources.replace(/\D/g, "");
  const re = /\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/g;
  for (const m of text.match(re) ?? []) {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 11 && !srcDigits.includes(digits)) {
      return m.trim();
    }
  }
  return null;
}

// ---- Regra 4: promessas fortes demais ----
function firstOverPromise(text: string): string | null {
  const t = stripAccents(text.toLowerCase());
  for (const p of OVER_PROMISES) {
    if (t.includes(stripAccents(p))) return p;
  }
  return null;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
