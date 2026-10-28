import "server-only";
import { sendText } from "@/lib/evolution";
import { ehNumeroDeAvisos, telefoneImpossivel } from "@/lib/avisos";

// ENVIO ATIVO (28/10/2026): a mensagem que o PRODUTO manda por iniciativa
// própria, fora de uma resposta da IA. Hoje só o lembrete da agenda; desenhado
// para o Follow-up reaproveitar. Uma peça só, para as regras do projeto sobre
// mensagem ativa (CLAUDE.md: só com conversa recente, teto diário, intervalo
// aleatório, "responda SAIR") morarem num lugar.
//
// ⚠️ OS VALORES DAS REGRAS SÃO PENDENTES DO DONO: `null` = a regra ainda não é
// aplicada. Nenhum envio ativo deve ir ao ar com teto e intervalo nulos.

export interface RegrasDoEnvioAtivo {
  /** Máximo de mensagens ativas por empresa por dia. null = PENDENTE (sem teto). */
  tetoDiario: number | null;
  /** Pausa aleatória entre duas mensagens, em ms [mín, máx]. null = PENDENTE (sem pausa). */
  intervaloMs: [number, number] | null;
}

/**
 * As regras do lembrete da agenda. PENDENTE (dono): teto, intervalo, se exige
 * conversa recente (quem o time marcou à mão pode nunca ter escrito) e o
 * "responda SAIR" no texto.
 */
export const REGRAS_DO_LEMBRETE: RegrasDoEnvioAtivo = {
  tetoDiario: null,
  intervaloMs: null,
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

/** A pausa entre duas mensagens ativas (aleatória dentro das regras), ou nenhuma. */
export async function pausaEntreEnvios(regras: RegrasDoEnvioAtivo): Promise<void> {
  if (!regras.intervaloMs) return;
  const [min, max] = regras.intervaloMs;
  await new Promise((r) => setTimeout(r, min + Math.random() * Math.max(0, max - min)));
}
