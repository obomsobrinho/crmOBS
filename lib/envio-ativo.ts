import "server-only";
import { sendText } from "@/lib/evolution";
import { ehNumeroDeAvisos, telefoneImpossivel } from "@/lib/avisos";

// ENVIO ATIVO (28/10/2026): a mensagem que o PRODUTO manda por iniciativa
// própria, fora de uma resposta da IA. Hoje só o lembrete da agenda; desenhado
// para o Follow-up reaproveitar. Uma peça só, para as regras do projeto sobre
// mensagem ativa (CLAUDE.md: só com conversa recente, teto diário, intervalo
// aleatório, "responda SAIR") morarem num lugar.
//
// Cada uso tem as suas regras (`RegrasDoEnvioAtivo`); `null` = a regra não se
// aplica a esse uso, por decisão do dono.

export interface RegrasDoEnvioAtivo {
  /** Máximo de mensagens ativas por empresa por dia. null = sem teto. */
  tetoDiario: number | null;
  /** Pausa aleatória entre duas mensagens da MESMA empresa, em ms [mín, máx]. null = sem pausa. */
  intervaloMs: [number, number] | null;
}

/**
 * As regras do lembrete da agenda (decisões do dono, 28/10/2026): sem teto
 * diário (o volume é o número de horários marcados), pausa aleatória de 20 a
 * 60 s entre as mensagens da mesma empresa, manda mesmo para quem nunca
 * escreveu e sem "responda SAIR" no texto.
 */
export const REGRAS_DO_LEMBRETE: RegrasDoEnvioAtivo = {
  tetoDiario: null,
  intervaloMs: [20_000, 60_000],
};

/** Owner prospecting (Campanhas v2): 10/day enforced in SQL; pause 4–12 min in `proximoEnvioEm`. */
export const REGRAS_DA_PROSPECCAO: RegrasDoEnvioAtivo = {
  tetoDiario: 10,
  intervaloMs: [4 * 60_000, 12 * 60_000],
};

export type ResultadoDoEnvio = "enviado" | "recusado" | "pulado";

/**
 * Manda UMA mensagem ativa pela Evolution (a mesma camada dos avisos). Pula,
 * sem chamar ninguém, a conversa de teste (DDD 00) e o número de avisos do
 * time. NUNCA lança.
 */
export async function enviarMensagemAtiva(a: {
  instancia: string | null;
  telefone: string;
  texto: string;
  numeroDeAvisos: string | null;
}): Promise<ResultadoDoEnvio> {
  if (!a.instancia) return "pulado";
  if (telefoneImpossivel(a.telefone) || ehNumeroDeAvisos(a.telefone, a.numeroDeAvisos)) return "pulado";
  try {
    return (await sendText(a.instancia, a.telefone, a.texto)) ? "enviado" : "recusado";
  } catch (e) {
    console.error("falha no envio ativo:", e);
    return "recusado";
  }
}

/** A pausa aleatória entre duas mensagens ativas (ms), dentro das regras; 0 sem intervalo. */
export function sortearPausa(regras: RegrasDoEnvioAtivo): number {
  if (!regras.intervaloMs) return 0;
  const [min, max] = regras.intervaloMs;
  return Math.round(min + Math.random() * Math.max(0, max - min));
}
