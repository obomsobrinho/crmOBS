import { diasDoMes, diaMes, inicioDoDiaSPIso, somarDias, somarMes } from "./fuso";
import { PERIODOS, type PeriodoKey } from "./periodo";

// HORÁRIOS DE PICO (central do dono, 15/10/2026): a regra de "quando o agente trabalha mais"
// sobre um intervalo de DIAS CIVIS de São Paulo. Módulo PURO (sem I/O, só `lib/fuso.ts`), de
// propósito: a mesma conta vai ser portada para o `/painel` dos tenants. Quem lê o banco
// (`admin_cliente_picos`: um agregado por intervalo, nunca linhas para contar) só entrega
// `DadosDePicos`; tudo que vira número de tela sai daqui.
//
// A janela é sempre um intervalo REAL de datas (inclusive nas duas pontas): os chips Dia,
// Semana, Quinzena e Mês, um mês civil, "Todo o período" e um intervalo escolhido pelo dono
// (a semana do Natal, dezembro inteiro) passam pela mesma função, então a tela não tem um
// caso especial por tipo de filtro.

/** Dias do intervalo, `AAAA-MM-DD` (fuso de São Paulo), inclusive nas duas pontas. */
export interface JanelaDePicos {
  de: string;
  ate: string;
}

/** O que o banco devolve por janela: turnos por dia e por (dia da semana x hora). */
export interface DadosDePicos {
  /** [dia, turnos]; só dias com turno */
  dias: [string, number][];
  /** [dia da semana (0 = domingo), hora, turnos] */
  cubo: [number, number, number][];
}

export const HORAS_POR_FAIXA = 3;
export const FAIXAS_POR_DIA = 24 / HORAS_POR_FAIXA;

/** Até quantos dias a série "Por dia" mostra UMA coluna por data; acima disso soma por dia da semana. */
export const MAX_DIAS_POR_DATA = 15;

/** Teto de um intervalo escolhido (a função SQL limita igual): cinco anos. */
export const MAX_DIAS_DA_JANELA = 1830;

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Segunda a domingo (a semana de trabalho). `dow` é o dia da semana do banco (0 = domingo). */
export const SEMANA_DE_NEGOCIO = ([1, 2, 3, 4, 5, 6, 0] as const).map((dow) => ({
  dow,
  curto: (["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const)[dow],
  longo: (["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const)[dow],
}));

export function ehDiaIso(v: unknown): v is string {
  if (typeof v !== "string" || !DIA_ISO.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d));
  return x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
}

/** Dia da semana do banco (0 = domingo) de um dia civil, sem fuso no meio. */
export function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00Z`).getUTCDay();
}

const hora2 = (h: number) => String(h).padStart(2, "0");

/** "12h às 15h" (a última faixa do dia termina à 00h). */
export function textoDaFaixa(faixa: number): string {
  return `${hora2(faixa * HORAS_POR_FAIXA)}h às ${hora2(((faixa + 1) * HORAS_POR_FAIXA) % 24)}h`;
}

/** "terça, 24/12" */
export function textoDoDia(dia: string): string {
  return `${SEMANA_DE_NEGOCIO.find((s) => s.dow === diaDaSemana(dia))!.longo}, ${diaMes(dia)}`;
}

/** Os chips do painel (`PERIODOS`, `lib/periodo.ts`): os últimos 1, 7, 15 e 30 dias, com hoje (as mesmas colunas do gráfico de uso). */
export function janelaDoChip(chip: PeriodoKey, hoje: string): JanelaDePicos {
  return { de: somarDias(hoje, -(PERIODOS[chip].dias - 1)), ate: hoje };
}

/** Um mês civil (`AAAA-MM`), cortado em hoje quando é o mês atual. */
export function janelaDoMesCivil(mes: string, hoje: string): JanelaDePicos {
  const fim = `${mes}-${hora2(diasDoMes(mes))}`;
  return { de: `${mes}-01`, ate: fim > hoje ? hoje : fim };
}

/** Desde o primeiro turno do cliente até hoje (sem turno nenhum: só hoje). */
export function janelaDeTudo(primeira: string | null, hoje: string): JanelaDePicos {
  return { de: primeira && primeira <= hoje ? primeira : hoje, ate: hoje };
}

/** O intervalo que o dono escolheu, cortado em hoje; inválido (torto, invertido, longo demais) vira `null`. */
export function janelaDoIntervalo(de: unknown, ate: unknown, hoje: string): JanelaDePicos | null {
  if (!ehDiaIso(de) || !ehDiaIso(ate) || de > ate || de > hoje) return null;
  const fim = ate > hoje ? hoje : ate;
  return diasEntre(de, fim) > MAX_DIAS_DA_JANELA ? null : { de, ate: fim };
}

/** Quantos dias civis tem o intervalo (as duas pontas contam). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;
}

/** A janela anterior de mesmo tamanho, colada nesta (a base da comparação). */
export function janelaAnterior(j: JanelaDePicos): JanelaDePicos {
  const n = diasEntre(j.de, j.ate);
  return { de: somarDias(j.de, -n), ate: somarDias(j.de, -1) };
}

/** O mês civil anterior a `AAAA-MM`, inteiro. */
export function janelaDoMesAnterior(mes: string): JanelaDePicos {
  return janelaDoMesCivil(somarMes(mes, -1), "9999-12-31");
}

/**
 * Os instantes ISO que o servidor manda ao banco para uma janela: meia-noite de São Paulo do
 * primeiro dia até a meia-noite do dia seguinte ao último (UTC-3 o ano todo desde 2019).
 */
export function instantesDaJanela(j: JanelaDePicos): { de: string; ate: string } {
  return { de: inicioDoDiaSPIso(j.de), ate: inicioDoDiaSPIso(somarDias(j.ate, 1)) };
}

/** Uma coluna de um dos dois gráficos de pico. */
export interface BarraDePico {
  chave: string;
  /** O rótulo do eixo: "24/12", "ter", "18h". */
  eixo: string;
  /** O título do balão: "terça, 24/12", "terça-feira", "18h às 21h". */
  rotulo: string;
  n: number;
  /** A coluna de maior número (a primeira no empate). */
  pico: boolean;
  /** `n` quando NÃO é o pico e `n` quando é: as duas séries empilhadas que o gráfico pinta (uma sempre zero). */
  demais: number;
  destaque: number;
}

export interface ResumoDePicos {
  total: number;
  /** Quantos dias civis a janela cobre (do primeiro turno do cliente, ou do começo, até o fim ou hoje). */
  dias: number;
  /** Turnos por dia da janela; `null` sem nenhum dia. */
  media: number | null;
  /**
   * A faixa de 3 horas mais cheia SOMANDO todos os dias da janela: a MESMA coluna que "Por horário do dia"
   * destaca (o cartão e o gráfico nunca se contradizem); `null` sem turno.
   */
  horarioDePico: { faixa: number; n: number; texto: string } | null;
  /** A DATA mais cheia, com o dia da semana (a mesma que "Por dia" destaca até 15 dias); `null` sem turno. */
  diaDePico: { dia: string; n: number; texto: string } | null;
  porDia: { modo: "data" | "semana"; barras: BarraDePico[] };
  porFaixa: BarraDePico[];
}

function comPico(itens: Omit<BarraDePico, "pico" | "demais" | "destaque">[]): BarraDePico[] {
  let maior = 0;
  let onde = -1;
  itens.forEach((b, i) => {
    if (b.n > maior) {
      maior = b.n;
      onde = i;
    }
  });
  return itens.map((b, i) => ({
    ...b,
    pico: i === onde,
    demais: i === onde ? 0 : b.n,
    destaque: i === onde ? b.n : 0,
  }));
}

/**
 * Os números de uma janela: o horário e o dia de pico, a média por dia e as duas séries ("Por dia" e
 * "Por horário do dia"). `primeira` é o dia do primeiro turno do cliente (a janela nunca começa antes
 * dele) e `hoje` o fim do que já existe. "Por dia" tem uma coluna por DATA até 15 dias e passa a somar
 * por dia da semana acima disso.
 */
export function resumoDePicos(
  dados: DadosDePicos,
  janela: JanelaDePicos,
  ctx: { hoje: string; primeira: string | null }
): ResumoDePicos {
  const de = ctx.primeira && ctx.primeira > janela.de ? ctx.primeira : janela.de;
  const ate = janela.ate > ctx.hoje ? ctx.hoje : janela.ate;
  const dias = de <= ate ? diasEntre(de, ate) : 0;

  const porData = new Map<string, number>();
  let total = 0;
  for (const [dia, n] of dados.dias) {
    porData.set(dia, (porData.get(dia) ?? 0) + n);
    total += n;
  }

  // O dia de pico: a data mais cheia (a primeira no empate).
  let diaDePico: ResumoDePicos["diaDePico"] = null;
  for (const [dia, n] of [...porData].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (n > 0 && (diaDePico === null || n > diaDePico.n)) diaDePico = { dia, n, texto: textoDoDia(dia) };
  }

  // As faixas de 3 horas por dia da semana (a soma de todos os dias da janela vira "Por horário do dia").
  const faixasPorDow = new Map<number, number[]>();
  for (const [dow, hora, n] of dados.cubo) {
    const v = faixasPorDow.get(dow) ?? Array.from({ length: FAIXAS_POR_DIA }, () => 0);
    v[Math.min(FAIXAS_POR_DIA - 1, Math.floor(hora / HORAS_POR_FAIXA))] += n;
    faixasPorDow.set(dow, v);
  }

  // "Por dia".
  let porDia: ResumoDePicos["porDia"];
  if (dias > 0 && dias <= MAX_DIAS_POR_DATA) {
    const itens: Omit<BarraDePico, "pico" | "demais" | "destaque">[] = [];
    for (let dia = de; dia <= ate; dia = somarDias(dia, 1)) {
      itens.push({ chave: dia, eixo: diaMes(dia), rotulo: textoDoDia(dia), n: porData.get(dia) ?? 0 });
    }
    porDia = { modo: "data", barras: comPico(itens) };
  } else {
    const somaPorDow = new Map<number, number>();
    for (const [dia, n] of porData) somaPorDow.set(diaDaSemana(dia), (somaPorDow.get(diaDaSemana(dia)) ?? 0) + n);
    porDia = {
      modo: "semana",
      barras: comPico(
        SEMANA_DE_NEGOCIO.map(({ dow, curto, longo }) => ({
          chave: String(dow),
          eixo: curto,
          rotulo: longo,
          n: somaPorDow.get(dow) ?? 0,
        }))
      ),
    };
  }

  // "Por horário do dia": as 8 faixas, somando os dias da semana.
  const somaPorFaixa = Array.from({ length: FAIXAS_POR_DIA }, () => 0);
  for (const v of faixasPorDow.values()) v.forEach((n, f) => (somaPorFaixa[f] += n));
  const porFaixa = comPico(
    somaPorFaixa.map((n, f) => ({
      chave: String(f),
      eixo: `${hora2(f * HORAS_POR_FAIXA)}h`,
      rotulo: textoDaFaixa(f),
      n,
    }))
  );

  // O horário de pico é a coluna destacada em "Por horário do dia", nunca outra conta.
  const faixaDoPico = porFaixa.find((b) => b.pico);
  const horarioDePico: ResumoDePicos["horarioDePico"] = faixaDoPico
    ? { faixa: Number(faixaDoPico.chave), n: faixaDoPico.n, texto: faixaDoPico.rotulo }
    : null;

  return {
    total,
    dias,
    media: dias > 0 ? total / dias : null,
    horarioDePico,
    diaDePico,
    porDia,
    porFaixa,
  };
}

/** O jsonb de `admin_cliente_picos` (uma janela) vira dados; formato torto vira vazio, nunca erro. */
export function picosDoJson(v: unknown): DadosDePicos {
  const vazio: DadosDePicos = { dias: [], cubo: [] };
  if (!v || typeof v !== "object") return vazio;
  const o = v as { dias?: unknown; cubo?: unknown };
  const dias: [string, number][] = [];
  if (Array.isArray(o.dias)) {
    for (const l of o.dias) {
      if (Array.isArray(l) && ehDiaIso(l[0]) && Number.isFinite(Number(l[1]))) dias.push([l[0], Number(l[1])]);
    }
  }
  const cubo: [number, number, number][] = [];
  if (Array.isArray(o.cubo)) {
    for (const l of o.cubo) {
      if (!Array.isArray(l)) continue;
      const dow = Number(l[0]);
      const hora = Number(l[1]);
      const n = Number(l[2]);
      if (Number.isInteger(dow) && dow >= 0 && dow <= 6 && Number.isInteger(hora) && hora >= 0 && hora <= 23 && Number.isFinite(n)) {
        cubo.push([dow, hora, n]);
      }
    }
  }
  return { dias, cubo };
}

/**
 * Os dados de uma janela a partir do histórico de CADA dia (turnos por hora, 24 números): o que o banco
 * agrega em `admin_cliente_picos`, feito em memória. Serve ao preview com dados falsos e aos testes: a
 * conta de "o que o banco devolve" fica provada contra esta, que é a definição em código.
 */
export function picosDeHistorico(hist: { dia: string; horas: number[] }[], janela: JanelaDePicos): DadosDePicos {
  const dias: [string, number][] = [];
  const porCelula = new Map<string, number>();
  for (const { dia, horas } of hist) {
    if (dia < janela.de || dia > janela.ate) continue;
    const total = horas.reduce((s, n) => s + n, 0);
    if (total > 0) dias.push([dia, total]);
    const dow = diaDaSemana(dia);
    horas.forEach((n, h) => {
      if (n > 0) porCelula.set(`${dow}-${h}`, (porCelula.get(`${dow}-${h}`) ?? 0) + n);
    });
  }
  const cubo: [number, number, number][] = [...porCelula].map(([k, n]) => {
    const [dow, h] = k.split("-").map(Number);
    return [dow, h, n];
  });
  cubo.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return { dias: dias.sort((x, y) => (x[0] < y[0] ? -1 : 1)), cubo };
}
