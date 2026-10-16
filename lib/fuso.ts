// FUSO DE SÃO PAULO: a única fonte do fuso e dos formatadores de data que
// dependem dele. Módulo PURO (sem I/O), usado no servidor e no navegador.
//
// ⚠️ TODA data na tela e toda conta de dia civil sai em America/Sao_Paulo, nunca
// no fuso da máquina (o servidor roda em UTC: a mensagem das 17:47 aparecia como
// 20:47, achado do dono em 27/09/2026). Quem precisa do fuso importa daqui; não
// escreva a string "America/Sao_Paulo" em outro arquivo.
// `formatTime` mora em lib/format.ts, que importa FUSO daqui: o ciclo é só de
// funções chamadas depois do carregamento, nunca no topo do módulo.
import { formatTime } from "./format";

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

/**
 * O instante (ms) da meia-noite de São Paulo que abre o dia civil `AAAA-MM-DD`. SP é UTC-3 o ano todo
 * (sem horário de verão desde 2019): é a ÚNICA conta de "início do dia" com o deslocamento do fuso, para
 * quem manda janelas ao banco (picos, uso, mês do limite) não repetir a constante.
 */
export function inicioDoDiaSP(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return Date.UTC(a, m - 1, d, 3);
}

/** O mesmo instante, como o ISO que o servidor manda ao banco. */
export function inicioDoDiaSPIso(dia: string): string {
  return new Date(inicioDoDiaSP(dia)).toISOString();
}

/** `AAAA-MM` mais `n` meses (aritmética de calendário, sem fuso no meio). */
export function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Quantos dias tem o mês civil `AAAA-MM`. */
export function diasDoMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Soma `n` dias a uma data AAAA-MM-DD (aritmética de calendário, sem fuso no meio). */
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "2026-08-20" vira "20/08". Sem `Date` no meio: a string já está no fuso certo. */
export function diaMes(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
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

/**
 * "30 set, 14:05": dia, mês abreviado sem ponto e hora. É o "quando" da página
 * de Pedidos (abertura e fechamento de cada pedido).
 */
export function diaMesCurtoHoraSP(iso: string): string {
  const d = new Date(iso);
  const dia = d
    .toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: FUSO })
    .replace(" de ", " ")
    .replace(".", "");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
  return `${dia}, ${hora}`;
}

/** O mesmo dia civil de São Paulo? */
export function mesmoDiaSP(a: string, b: string): boolean {
  return diaIsoSP(Date.parse(a)) === diaIsoSP(Date.parse(b));
}

/**
 * A hora de `iso` quando cai no mesmo dia civil de São Paulo que `refIso`
 * ("16:03"); senão dia e hora ("8 out, 16:03"). É o que o detalhe do pedido usa
 * para as mensagens e para o "atualizado às/em" (a referência é a abertura).
 */
export function horaNoDiaDe(iso: string, refIso: string): string {
  return mesmoDiaSP(iso, refIso) ? formatTime(iso) : diaMesCurtoHoraSP(iso);
}
