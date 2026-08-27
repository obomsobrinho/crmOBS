// As quatro janelas do painel (dia, semana, quinzena, mês) e o período anterior
// de cada uma, que é o que autoriza o selo de variação.
//
// Módulo PURO (zero imports), pelo mesmo motivo de lib/delta.ts: a página
// calcula no servidor e o browser só TROCA de janela, então os dois precisam ter
// a mesma opinião sobre onde cada período começa.
//
// Janela ROLANTE e não calendário ("últimos 7 dias", não "esta semana"): o dono
// abre isto numa terça e "esta semana" seria um dia e meio de dado apresentado
// como semana. Rolante também evita a virada de fuso, que é onde este projeto já
// se queimou uma vez (ver a regra de America/Sao_Paulo em lib/valor.ts).

export type PeriodoKey = "dia" | "semana" | "quinzena" | "mes";

export interface Periodo {
  key: PeriodoKey;
  /** Rótulo do seletor. */
  aba: string;
  /** Legenda que vai DENTRO do cartão, ex.: "últimos 7 dias". */
  legenda: string;
  /** Frase quando não há período anterior para comparar. */
  semBase: string;
  /** Tamanho da janela, em dias. */
  dias: number;
  /**
   * Quantos dias atrás começa a janela ANTERIOR.
   *
   * Para semana, quinzena e mês é a janela igual imediatamente anterior
   * (`dias * 2`). Para DIA é 8, e não 2, de propósito: o dia anterior de uma
   * segunda-feira é um domingo, e comparar segunda com domingo produziria um
   * selo alarmante que não significa nada. O comparável de um dia é o MESMO DIA
   * DA SEMANA anterior.
   */
  anteriorDias: number;
}

const DIA_MS = 24 * 60 * 60 * 1000;

export const PERIODOS: Record<PeriodoKey, Periodo> = {
  dia: {
    key: "dia",
    aba: "Dia",
    legenda: "últimas 24 horas",
    semBase: "sem o mesmo dia da semana passada",
    dias: 1,
    anteriorDias: 8,
  },
  semana: {
    key: "semana",
    aba: "Semana",
    legenda: "últimos 7 dias",
    semBase: "primeira semana medida",
    dias: 7,
    anteriorDias: 14,
  },
  quinzena: {
    key: "quinzena",
    aba: "Quinzena",
    legenda: "últimos 15 dias",
    semBase: "sem quinzena anterior completa",
    dias: 15,
    anteriorDias: 30,
  },
  mes: {
    key: "mes",
    aba: "Mês",
    legenda: "últimos 30 dias",
    semBase: "sem mês anterior completo",
    dias: 30,
    anteriorDias: 60,
  },
};

/** Ordem de exibição do seletor, do mais curto ao mais longo. */
export const ORDEM_PERIODOS: PeriodoKey[] = ["dia", "semana", "quinzena", "mes"];

/** Janela padrão ao abrir a tela. */
export const PERIODO_PADRAO: PeriodoKey = "semana";

export interface Limites {
  /** Início da janela atual, em ms. */
  de: number;
  /** Fim da janela atual (agora), em ms. */
  ate: number;
  /** Início da janela anterior, em ms. */
  anteriorDe: number;
  /** Fim da janela anterior, em ms. */
  anteriorAte: number;
}

export function limites(p: Periodo, agora: number): Limites {
  return {
    de: agora - p.dias * DIA_MS,
    ate: agora,
    anteriorDe: agora - p.anteriorDias * DIA_MS,
    // Para o dia, a janela anterior tem o MESMO tamanho (1 dia), só que 7 dias
    // antes: de -8d a -7d. Para os demais ela encosta na atual.
    anteriorAte: agora - (p.anteriorDias - p.dias) * DIA_MS,
  };
}

/**
 * O instante mais antigo de que o painel precisa para montar TODAS as janelas,
 * inclusive as anteriores. É com ele que a página decide se a consulta truncou e
 * o selo tem que sumir.
 */
export function instanteMaisAntigoNecessario(agora: number): number {
  return agora - PERIODOS.mes.anteriorDias * DIA_MS;
}

/** O instante está dentro de [de, ate)? */
export function naJanela(t: number, de: number, ate: number): boolean {
  return t >= de && t < ate;
}

/**
 * "Agora", em ms.
 *
 * Existe só para encapsular o relógio. `Date.now()` escrito no corpo de um
 * Server Component é erro de lint (`react-hooks/purity`), porque chamada impura
 * durante o render dá resultado instável. Numa função comum de módulo não é
 * render, e a regra não se aplica. É o mesmo motivo pelo qual o antigo
 * `weekCutoffISO` embrulhava o relógio.
 */
export function agoraMs(): number {
  return Date.now();
}
