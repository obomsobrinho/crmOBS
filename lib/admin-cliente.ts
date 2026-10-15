import { DAY_LABEL } from "./agent-prompt";
import { diaMes } from "./fuso";
import { custoEstimadoUsd, mesSP, tokensUsados, type TokensDoMes } from "./custo-ia";
import {
  agregadoDe,
  barrasDasSeries,
  metricsDaJanela,
  type JanelaAgregada,
  type LimitesDeJanela,
  type SeriesAgregadas,
} from "./painel-agregado";
import { chavesDoEsqueleto, type Barra } from "./metrics";
import { contagemPorMotivo, type ContagemDeMotivo } from "./motivos";
import { contagemPorSolucao, type ContagemDeSolucao } from "./solucoes";
import { ORDEM_PERIODOS, PERIODOS, limites, unidadeDoPeriodo, type PeriodoKey } from "./periodo";
import type { EmpresaItem } from "./admin-empresas";
import type { FinanceiroDoCliente } from "./admin-conta";

// O DETALHE DE UM CLIENTE NA CENTRAL DO DONO (docs/plano-central-clientes.md,
// entrega 1): as contas das abas "Uso de IA" e "Atendimento" e o formato dos
// dados da "Visão geral". Módulo PURO (sem I/O): o servidor monta, o navegador
// desenha, o preview `/design/clientes/detalhe` roda a mesma conta com dados
// falsos.
//
// Nada aqui é uma segunda fórmula. Tokens e custo vêm de `lib/custo-ia.ts`
// (`tokensUsados`, `custoEstimadoUsd`); quem respondeu, conversas, mediana do
// primeiro atendimento e pedidos vêm dos mesmos módulos do painel
// (`metricsDaJanela`, `contagemPorMotivo`, `contagemPorSolucao`).

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

// ---------------------------------------------------------------------------
// Uso de IA
// ---------------------------------------------------------------------------

/** Quantos dias o banco devolve por dia: cobre o período mais longo (30 dias, com hoje) e sobra um. */
const JANELA_DE_USO_DIAS = 31;
/** Janela da grade de dia da semana x hora. */
const JANELA_DO_CUBO_DIAS = 30;
/** Quantas horas o banco devolve por hora (o período "Dia" tem 24 colunas; sobra uma). */
const JANELA_DE_USO_HORAS = 25;

/** Domingo primeiro (`extract(dow)` do banco: 0 = domingo), com os nomes de `DAY_LABEL`. */
export const DIAS_DA_SEMANA = (["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const).map((k) => DAY_LABEL[k]);
export const DIAS_DA_SEMANA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/** Um dia do uso: turnos que chamaram o modelo e os tokens, por dia civil de São Paulo. */
export interface DiaDeUso {
  /** AAAA-MM-DD */
  dia: string;
  turnos: number;
  tokens: TokensDoMes;
}

/** Uma hora do uso, por hora civil de São Paulo. */
export interface HoraDeUso {
  /** AAAA-MM-DDTHH */
  chave: string;
  turnos: number;
  tokens: TokensDoMes;
}

export interface UsoBruto {
  dias: DiaDeUso[];
  horas: HoraDeUso[];
  /** [dia da semana (0 = domingo), hora, turnos] */
  cubo: [number, number, number][];
}

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** O jsonb de `admin_cliente_uso` vira dias e grade; formato torto vira vazio, nunca erro. */
export function usoDoJson(v: unknown): Pick<UsoBruto, "dias" | "cubo"> {
  if (!v || typeof v !== "object") return { dias: [], cubo: [] };
  const o = v as { dias?: unknown; cubo?: unknown };
  const dias: DiaDeUso[] = [];
  if (Array.isArray(o.dias)) {
    for (const l of o.dias) {
      if (!Array.isArray(l) || typeof l[0] !== "string" || !DIA_ISO.test(l[0])) continue;
      dias.push({
        dia: l[0],
        turnos: num(l[1]),
        tokens: { entrada: num(l[2]), cache: num(l[3]), saida: num(l[4]) },
      });
    }
  }
  const cubo: [number, number, number][] = [];
  if (Array.isArray(o.cubo)) {
    for (const l of o.cubo) {
      if (!Array.isArray(l)) continue;
      const dw = num(l[0]);
      const h = num(l[1]);
      if (Number.isInteger(dw) && dw >= 0 && dw <= 6 && Number.isInteger(h) && h >= 0 && h <= 23) {
        cubo.push([dw, h, num(l[2])]);
      }
    }
  }
  return { dias, cubo };
}

/** O jsonb de `admin_cliente_uso_horas` (`[[data, hora, turnos, entrada, cache, saida], ...]`) vira horas. */
export function horasDoJson(v: unknown): HoraDeUso[] {
  if (!Array.isArray(v)) return [];
  const horas: HoraDeUso[] = [];
  for (const l of v) {
    if (!Array.isArray(l) || typeof l[0] !== "string" || !DIA_ISO.test(l[0])) continue;
    const h = num(l[1]);
    if (!Number.isInteger(h) || h < 0 || h > 23) continue;
    horas.push({
      chave: `${l[0]}T${String(h).padStart(2, "0")}`,
      turnos: num(l[2]),
      tokens: { entrada: num(l[3]), cache: num(l[4]), saida: num(l[5]) },
    });
  }
  return horas;
}

/** O que o servidor junta das duas leituras do banco. */
export function usoBruto(dias: unknown, horas: unknown): UsoBruto {
  return { ...usoDoJson(dias), horas: horasDoJson(horas) };
}

/** Os limites que o servidor manda ao banco (instantes ISO). */
export function janelaDeUso(agora: number): { de: string; ate: string; cuboDe: string; horasDe: string } {
  return {
    de: new Date(agora - JANELA_DE_USO_DIAS * DIA_MS).toISOString(),
    ate: new Date(agora).toISOString(),
    cuboDe: new Date(agora - JANELA_DO_CUBO_DIAS * DIA_MS).toISOString(),
    horasDe: new Date(agora - JANELA_DE_USO_HORAS * HORA_MS).toISOString(),
  };
}

export interface TotalDeUso {
  turnos: number;
  tokens: TokensDoMes;
  /** Entrada (com o cache) mais saída: o que conta para o teto. */
  usados: number;
  custoUsd: number | null;
}

/** Uma coluna do gráfico de uso: uma hora (período "Dia") ou um dia (os outros). */
export interface BarraDeUso {
  /** AAAA-MM-DD ou AAAA-MM-DDTHH */
  chave: string;
  /** O rótulo do eixo: "14h" ou "14/10". */
  eixo: string;
  /** O título do balão: "14/10, 14h" ou "quarta, 14/10". */
  rotulo: string;
  turnos: number;
  tokens: TokensDoMes;
  usados: number;
  custoUsd: number | null;
}

/** O uso de UM período: as colunas, o total e a coluna mais alta. */
export interface UsoDoPeriodo {
  periodo: PeriodoKey;
  /** "últimos 7 dias" */
  legenda: string;
  unidade: "hora" | "dia";
  total: TotalDeUso;
  barras: BarraDeUso[];
  /** A coluna de mais tokens (a primeira no empate); nula sem uso. */
  maior: BarraDeUso | null;
}

const TOKENS_ZERO: TokensDoMes = { entrada: 0, cache: 0, saida: 0 };

/** "quarta, 14/10": o dia da semana do dia civil, sem fuso no meio. */
function rotuloDoDia(dia: string): string {
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return `${DIAS_DA_SEMANA[dow]}, ${diaMes(dia)}`;
}

function barraDe(
  chave: string,
  eixo: string,
  rotulo: string,
  turnos: number,
  tokens: TokensDoMes,
  modelo: string | null
): BarraDeUso {
  return {
    chave,
    eixo,
    rotulo,
    turnos,
    tokens,
    usados: tokensUsados(tokens),
    custoUsd: custoEstimadoUsd(tokens, modelo),
  };
}

/**
 * O uso de um período do painel (`lib/periodo.ts`): "Dia" sai por hora (as últimas 24, a
 * atual e as 23 anteriores), os outros por dia civil de São Paulo com hoje. As colunas
 * são o esqueleto do painel (`chavesDoEsqueleto`, `lib/metrics.ts`), hora ou dia vazio incluído.
 */
export function usoDoPeriodo(bruto: UsoBruto, periodo: PeriodoKey, agora: number, modelo: string | null): UsoDoPeriodo {
  const p = PERIODOS[periodo];
  const unidade = unidadeDoPeriodo(p.dias);
  const porHora = unidade === "hora";
  const medido = porHora
    ? new Map(bruto.horas.map((h) => [h.chave, h]))
    : new Map(bruto.dias.map((d) => [d.dia, d]));
  const barras = chavesDoEsqueleto(p.dias, agora).map(({ chave }) => {
    const d = medido.get(chave);
    const [dia, hh] = chave.split("T");
    return barraDe(
      chave,
      porHora ? `${hh}h` : diaMes(dia),
      porHora ? `${diaMes(dia)}, ${hh}h` : rotuloDoDia(dia),
      d?.turnos ?? 0,
      d?.tokens ?? TOKENS_ZERO,
      modelo
    );
  });

  const tokens: TokensDoMes = { entrada: 0, cache: 0, saida: 0 };
  let turnos = 0;
  let maior: BarraDeUso | null = null;
  for (const b of barras) {
    turnos += b.turnos;
    tokens.entrada += b.tokens.entrada;
    tokens.cache += b.tokens.cache;
    tokens.saida += b.tokens.saida;
    if (b.usados > 0 && (maior === null || b.usados > maior.usados)) maior = b;
  }
  return {
    periodo,
    legenda: p.legenda,
    unidade,
    total: { turnos, tokens, usados: tokensUsados(tokens), custoUsd: custoEstimadoUsd(tokens, modelo) },
    barras,
    maior,
  };
}

/** Quantos dias tem o mês civil de São Paulo de um instante. */
export function diasDoMesSP(agora: number): number {
  const [ano, mes] = mesSP(agora).split("-").map(Number);
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * O RITMO do limite: quanto de uso por coluna esgotaria o limite do mês se o
 * uso fosse parelho (limite ÷ dias do mês, e ÷ 24 por hora). É só aritmética
 * sobre o limite que o cliente tem; o que decide a parada continua sendo o
 * contador do mês (`consumo_ia_mensal`).
 */
export function ritmoDoLimite(limite: number, agora: number, unidade: "hora" | "dia"): number {
  return limite / diasDoMesSP(agora) / (unidade === "hora" ? 24 : 1);
}

/**
 * Marcas redondas para o eixo dos tokens (0, 100 mil, 200 mil...): o passo é 1, 2, 2,5 ou 5
 * vezes uma potência de dez, até uns quatro intervalos, e o eixo termina na última marca (que
 * cobre o maior valor e o ritmo do limite, para a linha de referência caber no gráfico).
 */
export function marcasDoEixo(maximo: number): number[] {
  const bruto = Math.max(1, maximo) / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? potencia;
  return Array.from({ length: Math.ceil(maximo / passo) + 1 }, (_, i) => i * passo);
}

export interface GradeDeHoras {
  /** celulas[diaDaSemana][hora] = turnos */
  celulas: number[][];
  maximo: number;
  total: number;
  pico: { dia: number; hora: number; n: number } | null;
}

/** A grade dia da semana x hora (últimos 30 dias). Empate no pico fica com o primeiro da semana. */
export function gradeDeHoras(cubo: [number, number, number][]): GradeDeHoras {
  const celulas = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let total = 0;
  for (const [dw, h, n] of cubo) {
    celulas[dw][h] += n;
    total += n;
  }
  let pico: GradeDeHoras["pico"] = null;
  for (let dw = 0; dw < 7; dw++) {
    for (let h = 0; h < 24; h++) {
      const n = celulas[dw][h];
      if (n > 0 && (pico === null || n > pico.n)) pico = { dia: dw, hora: h, n };
    }
  }
  return { celulas, maximo: pico?.n ?? 0, total, pico };
}

/** O que a aba "Uso de IA" desenha (a rota devolve isto; o preview monta igual). Os quatro períodos chegam numa leitura só. */
export interface UsoDoCliente {
  periodos: Record<PeriodoKey, UsoDoPeriodo>;
  grade: GradeDeHoras;
}

export function usoParaTela(bruto: UsoBruto, agora: number, modelo: string | null): UsoDoCliente {
  return {
    periodos: {
      dia: usoDoPeriodo(bruto, "dia", agora, modelo),
      semana: usoDoPeriodo(bruto, "semana", agora, modelo),
      quinzena: usoDoPeriodo(bruto, "quinzena", agora, modelo),
      mes: usoDoPeriodo(bruto, "mes", agora, modelo),
    },
    grade: gradeDeHoras(bruto.cubo),
  };
}

// ---------------------------------------------------------------------------
// Atendimento
// ---------------------------------------------------------------------------

/** Uma coluna do gráfico "quem respondeu": uma hora (período "Dia") ou um dia. */
export interface BarraDeMovimento {
  /** AAAA-MM-DD ou AAAA-MM-DDTHH */
  chave: string;
  /** O rótulo do eixo: "14h" ou "14/10". */
  eixo: string;
  /** O título do balão: "14/10, 14h" ou "quarta, 14/10". */
  rotulo: string;
  ia: number;
  time: number;
}

/**
 * As respostas por hora ou por dia (as mesmas colunas do movimento do painel,
 * `barrasDasSeries` sobre `painel_series`): quem respondeu continua sendo
 * `lib/mensagem.ts`. O dia civil de São Paulo, com hoje: uma janela de 7 dias
 * do painel começa no meio de um dia, então a soma das colunas pode ficar um
 * pouco abaixo de "Respostas da IA" (a primeira ponta é parcial).
 */
export interface MovimentoDoPeriodo {
  unidade: "hora" | "dia";
  barras: BarraDeMovimento[];
}

export function movimentoDoPeriodo(barras: Barra[], periodo: PeriodoKey): MovimentoDoPeriodo {
  const unidade = unidadeDoPeriodo(PERIODOS[periodo].dias);
  return {
    unidade,
    barras: barras.map((b) => {
      const [dia, hh] = b.chave.split("T");
      return {
        chave: b.chave,
        eixo: unidade === "hora" ? b.eixo : diaMes(dia),
        rotulo: unidade === "hora" ? `${diaMes(dia)}, ${hh}h` : rotuloDoDia(dia),
        ia: b.ia,
        time: b.time,
      };
    }),
  };
}

export interface AtendimentoDoCliente {
  periodo: PeriodoKey;
  /** "últimos 7 dias" */
  legenda: string;
  conversas: number;
  /** Conversas que seguiram sem nenhuma resposta humana. */
  semIntervencao: number;
  /** Conversas em que o time respondeu (conversas menos as sem resposta humana). */
  comTime: number;
  respostasIa: number;
  /** Vezes em que a IA passou o caso para o time (qualificação `pausar`). */
  passouParaOTime: number;
  /** Mediana do primeiro atendimento da IA, em ms; nulo sem amostra. */
  primeiraRespostaMs: number | null;
  amostraMediana: number;
  pedidos: {
    total: number;
    abertos: number;
    semSolucao: number;
    motivos: ContagemDeMotivo[];
    solucoes: ContagemDeSolucao[];
  };
  /** Respostas da IA e do time ao longo do período (uma coluna por hora ou por dia). */
  movimento: MovimentoDoPeriodo;
  /** Quantas regras o time já salvou para a IA (`clients.regras_salvas`). */
  regrasSalvas: number;
}

/** Uma fatia da rosca das soluções: a cor segue a SOLUÇÃO (token), nunca a posição. */
export interface FatiaDeSolucao {
  chave: string;
  rotulo: string;
  n: number;
  fill: string;
}

// A marca em três degraus da mesma rampa para as soluções, e dois cinzas para o que não é uma
// solução (aberto, fechado sem registro): a paleta da casa não comporta mais matizes.
const COR_DA_SOLUCAO: Record<string, string> = {
  orientou_ia: "var(--chart-rampa-4)",
  time_resolveu: "var(--chart-rampa-3)",
  time_assumiu: "var(--chart-rampa-2)",
  aberto: "var(--chart-2)",
  sem: "var(--ink-faint)",
};

/** As fatias da rosca: as soluções gravadas, depois "Ainda abertos" e "Fechados sem solução registrada" (zero não entra). */
export function fatiasDasSolucoes(a: Pick<AtendimentoDoCliente, "pedidos">): FatiaDeSolucao[] {
  const { solucoes, abertos, semSolucao } = a.pedidos;
  return [
    ...solucoes.map((s) => ({ chave: s.solucao as string, rotulo: s.rotulo, n: s.n })),
    ...(abertos > 0 ? [{ chave: "aberto", rotulo: "Ainda abertos", n: abertos }] : []),
    ...(semSolucao > 0 ? [{ chave: "sem", rotulo: "Fechados sem solução registrada", n: semSolucao }] : []),
  ].map((f) => ({ ...f, fill: COR_DA_SOLUCAO[f.chave] ?? "var(--ink-faint)" }));
}

/** O rótulo do eixo em até duas linhas (quebra no espaço mais perto do meio quando passa de 18 letras). */
export function quebrarRotulo(texto: string): string[] {
  if (texto.length <= 18) return [texto];
  const meio = texto.length / 2;
  let corte = -1;
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === " " && (corte < 0 || Math.abs(i - meio) < Math.abs(corte - meio))) corte = i;
  }
  return corte > 0 ? [texto.slice(0, corte), texto.slice(corte + 1)] : [texto];
}

/** O atendimento dos quatro períodos do painel, por período. */
export type AtendimentoPorPeriodo = Record<PeriodoKey, AtendimentoDoCliente>;

/**
 * As quatro janelas do painel (`ORDEM_PERIODOS`, atuais, sem as anteriores), na
 * ordem em que vão ao banco: o período `k` é a janela `indexOf(k) + 1` das
 * respostas de `painel_janelas`, `painel_motivos` e `admin_cliente_solucoes`.
 */
export function janelasDoAtendimento(agora: number): LimitesDeJanela[] {
  return ORDEM_PERIODOS.map((k) => {
    const l = limites(PERIODOS[k], agora);
    return { de: l.de, ate: l.ate };
  });
}

/** As respostas das três chamadas (uma por função, as quatro janelas juntas) viram os quatro períodos. */
export function atendimentoPorPeriodo(a: {
  janelas: JanelaAgregada[];
  motivos: { janela: number; motivo: string | null; n: number }[];
  solucoes: { janela: number; solucao: string | null; aberto: boolean; n: number }[];
  regrasSalvas: number;
  /** `painel_series` do cliente (as colunas do movimento) e o relógio do servidor. */
  series?: SeriesAgregadas | null;
  agora: number;
}): AtendimentoPorPeriodo {
  const agregado = agregadoDe(a.janelas, a.series ?? null);
  const porPeriodo = (k: PeriodoKey) => {
    const janela = ORDEM_PERIODOS.indexOf(k) + 1;
    return atendimentoDe({
      periodo: k,
      janela: agregado.janela(janela),
      motivos: a.motivos.filter((m) => m.janela === janela),
      solucoes: a.solucoes.filter((l) => l.janela === janela),
      regrasSalvas: a.regrasSalvas,
      movimento: barrasDasSeries(agregado.series, PERIODOS[k].dias, a.agora),
    });
  };
  return {
    dia: porPeriodo("dia"),
    semana: porPeriodo("semana"),
    quinzena: porPeriodo("quinzena"),
    mes: porPeriodo("mes"),
  };
}

/** As peças de UM período viram o objeto da aba, com as contas do painel. */
export function atendimentoDe(a: {
  periodo: PeriodoKey;
  janela: JanelaAgregada;
  motivos: { motivo: string | null; n: number }[];
  solucoes: { solucao: string | null; aberto: boolean; n: number }[];
  regrasSalvas: number;
  /** As colunas do movimento (`barrasDasSeries`); sem elas o período não desenha o gráfico. */
  movimento?: Barra[];
}): AtendimentoDoCliente {
  const m = metricsDaJanela(a.janela);
  const motivos = contagemPorMotivo(a.motivos);
  const solucoes = contagemPorSolucao(a.solucoes);
  return {
    periodo: a.periodo,
    legenda: PERIODOS[a.periodo].legenda,
    conversas: m.conversas,
    semIntervencao: m.semIntervencao,
    comTime: m.conversas - m.semIntervencao,
    respostasIa: m.respostasIa,
    passouParaOTime: m.preferiuConfirmar,
    primeiraRespostaMs: m.primeiraRespostaMs,
    amostraMediana: m.amostraMediana,
    pedidos: {
      total: motivos.total,
      abertos: solucoes.abertos,
      semSolucao: solucoes.semSolucao,
      motivos: motivos.itens,
      solucoes: solucoes.itens,
    },
    movimento: movimentoDoPeriodo(a.movimento ?? [], a.periodo),
    regrasSalvas: a.regrasSalvas,
  };
}

// ---------------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------------

/** As abas do detalhe (o `aba` da URL e do preview). */
export const ABAS_DO_CLIENTE = ["visao", "uso", "atendimento", "financeiro", "acoes"] as const;

export type AbaDoCliente = (typeof ABAS_DO_CLIENTE)[number];

export function ehAbaDoCliente(v: unknown): v is AbaDoCliente {
  return (ABAS_DO_CLIENTE as readonly unknown[]).includes(v);
}

/** O que a página do detalhe leva ao navegador (um cliente, sem prompt nem config). */
export interface DetalheDoCliente {
  empresa: EmpresaItem;
  /** O relógio do servidor (ms) com que `empresa` foi montada: os alertas dependem dele. */
  agora: number;
  /** `clients.prompt_mode`: guiado ou avançado. */
  modoDoPrompt: string;
  /** `clients.notify_group_jid` preenchido. */
  avisosConfigurados: boolean;
  /** E-mail do login do dono; o cadastro não guarda o nome da pessoa. */
  donoEmail: string | null;
  /** Pessoas com acesso (o dono e os atendentes). */
  membros: number;
  /** A aba Financeiro (ids do gateway já mascarados no servidor). */
  financeiro: FinanceiroDoCliente;
}
