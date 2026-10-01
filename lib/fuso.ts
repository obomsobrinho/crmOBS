// FUSO DE SÃO PAULO: a única fonte do fuso e dos formatadores de data que
// dependem dele. Módulo PURO (sem I/O), usado no servidor e no navegador.
//
// ⚠️ TODA data na tela e toda conta de dia civil sai em America/Sao_Paulo, nunca
// no fuso da máquina (o servidor roda em UTC: a mensagem das 17:47 aparecia como
// 20:47, achado do dono em 27/09/2026). Quem precisa do fuso importa daqui; não
// escreva a string "America/Sao_Paulo" em outro arquivo.
export const FUSO = "America/Sao_Paulo";

// Um formatador só, reaproveitado: criar `Intl.DateTimeFormat` custa caro e a
// lista do pipeline chamava isso uma vez por card.
const FMT_DIA_ISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia civil de São Paulo de um instante, como `AAAA-MM-DD`. */
export function diaIsoSP(instante: number | Date): string {
  return FMT_DIA_ISO.format(instante);
}

/** "20 de julho de 2026" (dia com 2 dígitos, mês por extenso, ano). */
export function dataLongaSP(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: FUSO,
  });
}

/** Dia e mês abreviado, como o pt-BR devolve ("20 de jul."). */
export function diaMesCurtoSP(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: FUSO,
  });
}

/** "20/07, 14:05" (dia/mês e hora). Aceita ISO ou milissegundos. */
export function diaMesHoraSP(instante: string | number): string {
  return new Date(instante).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
  });
}
