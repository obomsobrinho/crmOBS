// HORÁRIOS CITADOS, CONTADOS EM CÓDIGO (01/10/2026).
//
// Módulo PURO. Existe porque o modelo não compara horários com confiança: com a
// orientação "tenho disponibilidade às 16h" às 22h, ele respondia "hoje às 16h"
// ou "às 16h" sem o dia; com a regra reforçada, passou a empurrar para amanhã
// também de manhã, quando 16h ainda estava no futuro. A conta "já passou ou
// não" é aritmética, então quem faz é o código, e o prompt recebe a conclusão
// pronta ("16h já passou hoje: diga amanhã às 16h").

const FUSO = "America/Sao_Paulo";

/** Minutos desde a meia-noite em São Paulo. */
export function minutosAgoraSP(now: Date): number {
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24;
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function horaTexto(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/**
 * Horários escritos com número: "16h", "16hrs", "16 horas", "16:30", "16h30",
 * "às 16". Por extenso ("às seis") fica de fora de propósito: é ambíguo (6h ou
 * 18h), e quem desfaz a ambiguidade é a conversa, não uma regra.
 */
export function horariosCitados(texto: string): number[] {
  const achados = new Set<number>();
  const re =
    /(?<![\p{L}\d])([01]?\d|2[0-3])\s*(?:(?:h|hs|hrs?|horas?)(?!\p{L})(?:\s*e?\s*([0-5]\d)(?!\d))?|:([0-5]\d)(?!\d))|(?<!\p{L})[àa]s\s+([01]?\d|2[0-3])(?![\d\p{L}])(?!\s*(?:%|reais|r\$|anos|dias|meses|minutos))/giu;
  for (const m of texto.matchAll(re)) {
    const h = Number(m[1] ?? m[4]);
    const min = Number(m[2] ?? m[3] ?? 0);
    if (Number.isFinite(h)) achados.add(h * 60 + min);
  }
  return [...achados].sort((a, b) => a - b);
}

/**
 * A conclusão pronta para o prompt, uma linha por horário citado: se já passou
 * hoje (diga amanhã) ou se ainda vai acontecer (é hoje). `null` quando o texto
 * não cita horário com número.
 */
export function notaDeHorarios(texto: string, now: Date): string | null {
  const horas = horariosCitados(texto);
  if (horas.length === 0) return null;
  const agora = minutosAgoraSP(now);
  return horas
    .map((m) =>
      m <= agora
        ? `${horaTexto(m)} de hoje já passou (agora são ${horaTexto(agora)}): ofereça para amanhã (ou o próximo dia de atendimento) e diga "amanhã às ${horaTexto(m)}". Nunca diga "hoje" para esse horário.`
        : `${horaTexto(m)} ainda não chegou hoje (agora são ${horaTexto(agora)}): é hoje, diga "hoje às ${horaTexto(m)}". Não empurre para amanhã.`
    )
    .join("\n");
}

/** A orientação já diz o dia ("amanhã", "quinta", "02/10")? Então ninguém precisa decidir. */
export function citaDia(texto: string): boolean {
  // ⚠️ `\b` não serve aqui: "amanhã" termina em letra acentuada, que o `\b` do
  // JavaScript não trata como letra (o teste pegou isso em 01/10/2026).
  return /(?<!\p{L})(hoje|amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?!\p{L})|(?<!\d)\d{1,2}\/\d{1,2}(?!\d)/iu.test(texto);
}

/**
 * O dia de cada horário citado, para grudar no FIM da própria orientação
 * ("tenho disponibilidade às 16h [amanhã às 16h]"), que é a última coisa que o
 * modelo lê. `null` quando não há horário ou quando a orientação já diz o dia.
 */
export function diaDosHorarios(texto: string, now: Date): string | null {
  if (citaDia(texto)) return null;
  const horas = horariosCitados(texto);
  if (horas.length === 0) return null;
  const agora = minutosAgoraSP(now);
  return horas
    .map((m) => `${m <= agora ? "amanhã" : "hoje"} às ${horaTexto(m)}`)
    .join(", ");
}
