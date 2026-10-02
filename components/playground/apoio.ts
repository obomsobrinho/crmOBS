import type { PlaygroundTurn } from "./tipos";

/** O que o agente lê: a conversa, sem as linhas de pedido fechado. */
export function historico(turns: PlaygroundTurn[]) {
  // A resposta do time entra como fala do atendimento, igual ao chat_messages
  // (a linha manual é bot_message e o agente a lê como "assistant").
  return turns
    .filter((t) => t.role !== "marco")
    .map((t) => ({ role: t.role === "time" ? "assistant" : t.role, content: t.content }));
}

/** Pausa entre um balão e o próximo, pelo tamanho do texto: nem instantâneo
 *  (lê como formulário), nem lento a ponto de parecer travado. */
export function pausaDigitando(texto: string): number {
  return Math.min(1800, Math.max(700, texto.length * 22));
}

export const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Teto da gravação. Dois minutos de opus ficam longe do limite de corpo. */
export const GRAVACAO_MAX_S = 120;

// As mesmas peles do balão da tela de Conversas (`PELE` em Thread.tsx): o
// cliente é o balão recebido, o agente é o da IA.
export const PELE_CLIENTE =
  "border-line-soft bg-[var(--bubble-in-bg)] text-[var(--bubble-in-fg)] shadow-[var(--bubble-shadow)]";
export const PELE_IA = "border-brand-line bg-[var(--bubble-ia-bg)] text-[var(--bubble-ia-fg)]";
// O time respondendo (`voce` no Thread): do lado do atendimento, junto da IA.
export const PELE_TIME =
  "border-human-line bg-[var(--bubble-you-bg)] text-[var(--bubble-you-fg)]";
