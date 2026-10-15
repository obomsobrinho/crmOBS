// O ESTADO DA CONEXÃO DO WHATSAPP, como a Evolution o devolve. Módulo PURO: a
// faixa do app (`components/WhatsAppBanner.tsx`), o campo do agente
// (`components/agente/ConexaoCampo.tsx`) e a central do dono
// (`lib/admin-alertas.ts`) leem a MESMA normalização.

export type EstadoWhatsApp = "open" | "close" | "connecting" | "unknown";

/** A Evolution devolve `open`, `close` e `connecting`; qualquer outra coisa é `unknown`. */
export function normalizarEstado(valor: unknown): EstadoWhatsApp {
  return valor === "open" || valor === "close" || valor === "connecting" ? valor : "unknown";
}
