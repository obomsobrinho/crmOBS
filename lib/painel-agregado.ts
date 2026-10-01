// O painel e o "desde o início" da assinatura a partir do que o BANCO agrega.
//
// Módulo PURO (só importa módulos puros). Antes, a página baixava até 20.000
// linhas de chat_messages e 5.000 qualificações e contava em memória. O
// "Max rows" do PostgREST é 1000 (confirmado pelo dono), então esse teto nunca
// foi 20.000: qualquer tenant acima de 1.000 mensagens tinha número errado e a
// guarda de truncamento nunca disparava. Agora `painel_janelas` e `painel_series`
// (supabase/migrations/20261002200100_...) devolvem só escalares por janela e um
// jsonb pequeno e limitado (por data e por dia da semana x minuto do dia), e
// ESTE módulo transforma isso nos mesmos números de antes.
//
// ⚠️ QUEM CONTINUA DECIDINDO O QUÊ (fonte única, não duplicar):
//   - quem respondeu: lib/mensagem.ts (a tradução em SQL está declarada lá);
//   - janelas e períodos: lib/periodo.ts. Os limites vão PARA o banco como
//     parâmetro, o SQL não sabe o que é "semana";
//   - dentro/fora do horário, fim de semana, feriado: lib/valor.ts. O banco só
//     entrega contagens por (dia da semana, minuto) e por data;
//   - mediana, média e o limiar de "menos de 1 minuto": lib/metrics.ts e
//     lib/valor.ts, a partir de n, soma e dos dois valores centrais.
// A prova de que isto dá EXATAMENTE o que as funções sobre linhas davam é
// e2e/painel-agregado.serial.spec.ts (banco) e e2e/painel-agregado.design.spec.ts
// (sem banco, sobre o `agregarLinhas` de referência).

import type { BusinessHours } from "@/lib/agent-prompt";
import {
  barrasDeBaldes,
  medianaDeCentrais,
  type Barra,
  type BaldesDeBarras,
  type DashboardMetrics,
} from "@/lib/metrics";
import { ORDEM_PERIODOS, PERIODOS, limites, type PeriodoKey } from "@/lib/periodo";
import {
  dentroDoHorario,
  ehFeriado,
  horarioUtil,
  type PicoValor,
  type ValorResumo,
} from "@/lib/valor";

const DIA_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// O que o banco devolve
// ---------------------------------------------------------------------------

/** Uma linha de `painel_janelas`. `janela` 0 é o acumulado. */
export interface JanelaAgregada {
  janela: number;
  conversas: number;
  sem_humano: number;
  respostas_ia: number;
  recebidas: number;
  dif_n: number;
  dif_lo: number | null;
  dif_hi: number | null;
  dif_soma: number;
  dif_rapidas: number;
  pessoas_novas: number;
  /** Só na janela 0: a primeira mensagem não importada da conta, em ms. */
  primeira_em: number | null;
  leads: number;
  pausar: number;
  agendar: number;
}

/** O jsonb de `painel_series`. Datas em America/Sao_Paulo, 0 = domingo. */
export interface SeriesAgregadas {
  /** [data AAAA-MM-DD, respostas da IA, respostas manuais] */
  dias: [string, number, number][];
  /** [data, hora, respostas da IA, respostas manuais] */
  horas: [string, number, number, number][];
  /** [dia da semana, minuto do dia, respostas da IA] */
  cubo: [number, number, number][];
  cubo_mes: [number, number, number][];
  /** [dia da semana, hora, mensagens recebidas, última em ms] */
  picos: [number, number, number, number][];
  picos_mes: [number, number, number, number][];
}

export interface AgregadoDoPainel {
  /** A linha da janela `k` (0 = acumulado). Janela inexistente vira zeros. */
  janela(k: number): JanelaAgregada;
  series: SeriesAgregadas;
}

export const SERIES_VAZIAS: SeriesAgregadas = {
  dias: [],
  horas: [],
  cubo: [],
  cubo_mes: [],
  picos: [],
  picos_mes: [],
};

/** Monta o `AgregadoDoPainel` a partir das linhas cruas do RPC. */
export function agregadoDe(
  linhas: JanelaAgregada[],
  series: SeriesAgregadas | null
): AgregadoDoPainel {
  const porJanela = new Map(linhas.map((l) => [l.janela, l]));
  return {
    janela: (k) =>
      porJanela.get(k) ?? {
        janela: k,
        conversas: 0,
        sem_humano: 0,
        respostas_ia: 0,
        recebidas: 0,
        dif_n: 0,
        dif_lo: null,
        dif_hi: null,
        dif_soma: 0,
        dif_rapidas: 0,
        pessoas_novas: 0,
        primeira_em: null,
        leads: 0,
        pausar: 0,
        agendar: 0,
      },
    series: { ...SERIES_VAZIAS, ...(series ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// Que janelas pedir
// ---------------------------------------------------------------------------

export interface LimitesDeJanela {
  de: number;
  ate: number;
}

interface Par {
  /** Número da janela em `painel_janelas` (1 em diante). */
  atual: number;
  anterior: number;
}

export interface JanelasDoPainel {
  lista: LimitesDeJanela[];
  operacao: Record<PeriodoKey, Par>;
  movimento: Record<string, Par>;
  /** O mês fechado da manchete, ou null quando não foi pedido. */
  mes: number | null;
}

/**
 * Todas as janelas do painel numa lista só, para uma chamada só ao banco:
 * os quatro períodos da operação (atual e anterior, de lib/periodo.ts), as
 * janelas do movimento (14 e 30 dias, atual e anterior) e o mês fechado.
 * O número de cada uma é a posição na lista mais 1 (a 0 é o acumulado).
 */
export function montarJanelas(
  agora: number,
  diasMovimento: Record<string, number>,
  mes: { inicioMs: number; fimMs: number } | null
): JanelasDoPainel {
  const lista: LimitesDeJanela[] = [];
  const add = (de: number, ate: number) => lista.push({ de, ate });

  const operacao = {} as Record<PeriodoKey, Par>;
  for (const k of ORDEM_PERIODOS) {
    const lim = limites(PERIODOS[k], agora);
    add(lim.de, lim.ate);
    add(lim.anteriorDe, lim.anteriorAte);
    operacao[k] = { atual: lista.length - 1, anterior: lista.length };
  }

  const movimento: Record<string, Par> = {};
  for (const [k, dias] of Object.entries(diasMovimento)) {
    const de = agora - dias * DIA_MS;
    add(de, agora);
    add(agora - dias * 2 * DIA_MS, de);
    movimento[k] = { atual: lista.length - 1, anterior: lista.length };
  }

  let numeroDoMes: number | null = null;
  if (mes) {
    add(mes.inicioMs, mes.fimMs);
    numeroDoMes = lista.length;
  }
  return { lista, operacao, movimento, mes: numeroDoMes };
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

/** O mesmo `DashboardMetrics` de `computeMetrics`, sem linha nenhuma. */
export function metricsDaJanela(j: JanelaAgregada): DashboardMetrics {
  return {
    conversas: j.conversas,
    semIntervencao: j.sem_humano,
    leadsQualificados: j.leads,
    primeiraRespostaMs: medianaDeCentrais(j.dif_n, j.dif_lo, j.dif_hi),
    amostraMediana: j.dif_n,
    preferiuConfirmar: j.pausar,
    respostasIa: j.respostas_ia,
    pessoasNovas: j.pessoas_novas,
  };
}

/** Intervalo de datas locais [inicio, fim) em AAAA-MM-DD, para o mês fechado. */
export function diasDoMes(ano: number, mes: number): { inicio: string; fim: string } {
  const dois = (n: number) => String(n).padStart(2, "0");
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  return {
    inicio: `${ano}-${dois(mes)}-01`,
    fim: `${proximoAno}-${dois(proximoMes)}-01`,
  };
}

export interface ValorAgregadoInput {
  janela: JanelaAgregada;
  series: SeriesAgregadas;
  /** Horário de atendimento do tenant. null = não configurado, nada estimado. */
  hours: BusinessHours | null;
  /** Mês fechado ([inicio, fim) em AAAA-MM-DD) ou null para o acumulado. */
  mes: { inicio: string; fim: string } | null;
}

/**
 * O mesmo `ValorResumo` de `resumoDeValor`, a partir das agregações.
 *
 * Fora do horário vem do cubo (dia da semana x minuto) classificado por
 * `dentroDoHorario`; fim de semana e feriado vêm da série por data classificada
 * por `ehFeriado`; o pico, das células (dia da semana, hora). Tudo o que é
 * regra continua em lib/valor.ts, aqui só se SOMA o que ela classifica.
 */
export function resumoDeValorAgregado(i: ValorAgregadoInput): ValorResumo {
  const { janela: j, series: s, hours, mes } = i;
  const comHorario = horarioUtil(hours);
  const cubo = mes ? s.cubo_mes : s.cubo;
  const picos = mes ? s.picos_mes : s.picos;

  let fora = 0;
  if (comHorario && hours) {
    for (const [diaSemana, minutoDoDia, n] of cubo) {
      const p = {
        ano: 0,
        mes: 0,
        dia: 0,
        hora: Math.floor(minutoDoDia / 60),
        minuto: minutoDoDia % 60,
        diaSemana,
      };
      if (!dentroDoHorario(p, hours)) fora += n;
    }
  }

  let fimDeSemanaOuFeriado = 0;
  const cacheFeriados = new Map<number, Set<string>>();
  for (const [data, ia] of s.dias) {
    if (mes && (data < mes.inicio || data >= mes.fim)) continue;
    const [ano, m, dia] = data.split("-").map(Number);
    const diaSemana = new Date(Date.UTC(ano, m - 1, dia)).getUTCDay();
    const p = { ano, mes: m, dia, hora: 0, minuto: 0, diaSemana };
    if (diaSemana === 0 || diaSemana === 6 || ehFeriado(p, cacheFeriados)) {
      fimDeSemanaOuFeriado += ia;
    }
  }

  // O desempate do pico depende da ORDEM em que o JS via as linhas (da mais nova
  // para a mais velha): vence a primeira célula vista com o maior número. A
  // célula vista primeiro é a de `ultima_em` mais recente.
  let pico: PicoValor | null = null;
  for (const [diaSemana, hora, n] of [...picos].sort((a, b) => b[3] - a[3])) {
    if (!pico || n > pico.mensagens) pico = { diaSemana, hora, mensagens: n };
  }

  return {
    recebidas: j.recebidas,
    atendidasForaDoHorario: comHorario ? fora : null,
    atendidasEmFimDeSemanaOuFeriado: fimDeSemanaOuFeriado,
    conversasSemHumano: j.sem_humano,
    leadsQualificados: j.leads,
    pedidosDeAgendamento: j.agendar,
    respostasEmMenosDeUmMinuto: j.dif_rapidas,
    primeiraRespostaMs:
      j.dif_n > 0 ? Math.round(j.dif_soma / j.dif_n) : null,
    pico,
    temHorario: comHorario,
  };
}

/** As colunas do gráfico de movimento e da operação, a partir das séries. */
export function barrasDasSeries(
  series: SeriesAgregadas,
  dias: number,
  agora: number
): Barra[] {
  const baldes: BaldesDeBarras = new Map();
  if (dias <= 1) {
    for (const [data, hora, ia, time] of series.horas) {
      baldes.set(`${data}T${String(hora).padStart(2, "0")}`, { ia, time });
    }
  } else {
    for (const [data, ia, time] of series.dias) baldes.set(data, { ia, time });
  }
  return barrasDeBaldes(baldes, dias, agora);
}
