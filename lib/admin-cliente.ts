import { diaIsoSP, diaMes, diasDoMes, somarDias, somarMes } from "./fuso";
import { custoEstimadoUsd, tokensUsados, type TokensDoMes } from "./custo-ia";
import {
  agregadoDe,
  barrasDasSeries,
  metricsDaJanela,
  montarJanelas,
  type JanelaAgregada,
  type JanelasDoPainel,
  type LimitesDeJanela,
  type SeriesAgregadas,
} from "./painel-agregado";
import { chavesDoDiaCivil, chavesDoEsqueleto, type Barra } from "./metrics";
import {
  diasEntre,
  janelaAnterior,
  janelaDeTudo,
  janelaDoIntervalo,
  janelaDoMesAnterior,
  janelaDoMesCivil,
  textoDoDia,
  type DadosDePicos,
  type JanelaDePicos,
} from "./picos";
import { contagemPorMotivo, type ContagemDeMotivo } from "./motivos";
import { contagemPorSolucao, type ContagemDeSolucao } from "./solucoes";
import { ORDEM_PERIODOS, PERIODOS, unidadeDoPeriodo, type PeriodoKey } from "./periodo";
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

/**
 * Quantos dias o banco devolve por dia: o período mais longo (30 dias, com hoje) MAIS os 30 dias
 * anteriores, que são a base da variação ("vs. os 30 dias anteriores"), e sobra um.
 */
const JANELA_DE_USO_DIAS = 61;
/**
 * Quantas horas o banco devolve por hora: o dia de hoje (até 24 colunas) e o de ontem inteiro, que é
 * a base da variação do "Dia" (hoje até agora contra ontem até a mesma hora). É o teto da função SQL.
 */
const JANELA_DE_USO_HORAS = 48;

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
  /** O dia civil (AAAA-MM-DD, São Paulo) do primeiro turno do cliente; nulo sem nenhum. Limita os meses do seletor. */
  primeira?: string | null;
  /** Turnos por dia e por dia da semana x hora de cada janela dos chips (`admin_cliente_picos`). */
  picos?: Record<PeriodoKey, DadosDePicos>;
}

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Os dias do jsonb de `admin_cliente_uso`; formato torto vira vazio, nunca erro. (A grade dia da semana x hora saiu daqui: os picos têm a função própria.) */
export function diasDoJson(v: unknown): DiaDeUso[] {
  const dias: DiaDeUso[] = [];
  const lista = v && typeof v === "object" ? (v as { dias?: unknown }).dias : null;
  if (!Array.isArray(lista)) return dias;
  for (const l of lista) {
    if (!Array.isArray(l) || typeof l[0] !== "string" || !DIA_ISO.test(l[0])) continue;
    dias.push({
      dia: l[0],
      turnos: num(l[1]),
      tokens: { entrada: num(l[2]), cache: num(l[3]), saida: num(l[4]) },
    });
  }
  return dias;
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
export function usoBruto(dias: unknown, horas: unknown, primeira?: unknown): UsoBruto {
  const dia = typeof primeira === "string" && DIA_ISO.test(primeira.slice(0, 10)) ? primeira.slice(0, 10) : null;
  return { dias: diasDoJson(dias), horas: horasDoJson(horas), primeira: dia };
}

/** Os limites que o servidor manda ao banco (instantes ISO). */
export function janelaDeUso(agora: number): { de: string; ate: string; horasDe: string } {
  return {
    de: new Date(agora - JANELA_DE_USO_DIAS * DIA_MS).toISOString(),
    ate: new Date(agora).toISOString(),
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

/** A coluna do gráfico de uso: uma hora ("Dia"), um dia ou um mês civil ("Todo o período"). */
export type UnidadeDeUso = "hora" | "dia" | "mes";

/**
 * O uso de UM período: as colunas, o total e a coluna mais alta. `periodo` é nulo
 * quando a seleção não é um dos quatro chips (um mês civil ou "Todo o período").
 */
export interface UsoDoPeriodo {
  periodo: PeriodoKey | null;
  /** "últimos 7 dias", "hoje, desde as 00h", "em setembro de 2026" */
  legenda: string;
  unidade: UnidadeDeUso;
  total: TotalDeUso;
  barras: BarraDeUso[];
  /** A coluna de mais tokens (a primeira no empate); nula sem uso. */
  maior: BarraDeUso | null;
  /** O período imediatamente anterior, de mesmo tamanho (a base da variação); `null` quando não há. */
  anterior: TotalDeUso | null;
  /** "ontem, até a mesma hora", "os 7 dias anteriores": o que a variação compara. */
  rotuloAnterior: string;
}

const TOKENS_ZERO: TokensDoMes = { entrada: 0, cache: 0, saida: 0 };

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
 * O uso de um período do painel (`lib/periodo.ts`): "Dia" sai por hora e é HOJE, da 00h de
 * São Paulo até a hora atual (`chavesDoDiaCivil`; o "Dia" do painel segue sendo a janela
 * rolante de 24 horas, outra conta), os outros por dia civil de São Paulo com hoje. As
 * colunas são o esqueleto do painel (`chavesDoEsqueleto`, `lib/metrics.ts`), hora ou dia
 * vazio incluído.
 */
export function usoDoPeriodo(bruto: UsoBruto, periodo: PeriodoKey, agora: number, modelo: string | null): UsoDoPeriodo {
  const p = PERIODOS[periodo];
  const unidade = unidadeDoPeriodo(p.dias);
  const porHora = unidade === "hora";
  const medido = porHora
    ? new Map(bruto.horas.map((h) => [h.chave, h]))
    : new Map(bruto.dias.map((d) => [d.dia, d]));
  const colunas = periodo === "dia" ? chavesDoDiaCivil(agora) : chavesDoEsqueleto(p.dias, agora);
  const barras = colunas.map(({ chave }) => {
    const d = medido.get(chave);
    const [dia, hh] = chave.split("T");
    return barraDe(
      chave,
      porHora ? `${hh}h` : diaMes(dia),
      porHora ? `${diaMes(dia)}, ${hh}h` : textoDoDia(dia),
      d?.turnos ?? 0,
      d?.tokens ?? TOKENS_ZERO,
      modelo
    );
  });

  const { anterior, rotuloAnterior } = totalAnterior(bruto, periodo, agora, modelo, colunas.length);
  return {
    periodo,
    legenda: periodo === "dia" ? "hoje, desde as 00h" : p.legenda,
    unidade,
    barras,
    anterior,
    rotuloAnterior,
    ...totalDasBarras(barras, modelo),
  };
}

/** A soma de turnos e tokens de uma lista (dias ou horas já escolhidos) como total de período. */
function totalDe(itens: { turnos: number; tokens: TokensDoMes }[], modelo: string | null): TotalDeUso {
  const tokens: TokensDoMes = { entrada: 0, cache: 0, saida: 0 };
  let turnos = 0;
  for (const i of itens) {
    turnos += i.turnos;
    tokens.entrada += i.tokens.entrada;
    tokens.cache += i.tokens.cache;
    tokens.saida += i.tokens.saida;
  }
  return { turnos, tokens, usados: tokensUsados(tokens), custoUsd: custoEstimadoUsd(tokens, modelo) };
}

/**
 * A base da variação de um período dos chips: o "Dia" (hoje desde as 00h) contra ONTEM até a mesma
 * hora; Semana, Quinzena e Mês contra os N dias imediatamente anteriores (de mesmo tamanho). Vem
 * dos mesmos agregados do gráfico (nada inventado); sem uso na base, a variação diz "sem base".
 */
function totalAnterior(
  bruto: UsoBruto,
  periodo: PeriodoKey,
  agora: number,
  modelo: string | null,
  colunasDeHoje: number
): { anterior: TotalDeUso; rotuloAnterior: string } {
  const hoje = diaIsoSP(agora);
  if (periodo === "dia") {
    const ontem = somarDias(hoje, -1);
    const chaves = new Set(Array.from({ length: colunasDeHoje }, (_, h) => `${ontem}T${String(h).padStart(2, "0")}`));
    return {
      anterior: totalDe(bruto.horas.filter((h) => chaves.has(h.chave)), modelo),
      rotuloAnterior: "ontem, até a mesma hora",
    };
  }
  const n = PERIODOS[periodo].dias;
  const de = somarDias(hoje, -(2 * n - 1));
  const ate = somarDias(hoje, -n);
  return {
    anterior: totalDe(bruto.dias.filter((d) => d.dia >= de && d.dia <= ate), modelo),
    rotuloAnterior: `os ${n} dias anteriores`,
  };
}

/** O total das colunas (`totalDe`) e a mais alta (a primeira no empate; nula sem uso). */
function totalDasBarras(barras: BarraDeUso[], modelo: string | null): Pick<UsoDoPeriodo, "total" | "maior"> {
  let maior: BarraDeUso | null = null;
  for (const b of barras) {
    if (b.usados > 0 && (maior === null || b.usados > maior.usados)) maior = b;
  }
  return { total: totalDe(barras, modelo), maior };
}

// ---------------------------------------------------------------------------
// Meses anteriores e "Todo o período" (seletor ao lado dos chips, 15/10/2026)
// ---------------------------------------------------------------------------

/** O que o seletor de período da aba Uso de IA escolheu: um dos quatro chips, um mês civil ou tudo. */
export type SelecaoDeUso =
  | { tipo: "periodo"; periodo: PeriodoKey }
  | { tipo: "mes"; mes: string }
  | { tipo: "tudo" }
  /** Um intervalo de datas (`AAAA-MM-DD`, as duas pontas dentro): a semana do Natal, dezembro inteiro. */
  | { tipo: "intervalo"; de: string; ate: string };

const MES_ISO = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `AAAA-MM` de um mês civil (a forma que a rota aceita). */
export function ehMesIso(v: unknown): v is string {
  return typeof v === "string" && MES_ISO.test(v);
}

const NOMES_DOS_MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** "2026-09" vira "setembro de 2026". */
export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${NOMES_DOS_MESES[m - 1]} de ${a}`;
}

/** "2026-09" vira "set/26" (o eixo do gráfico por mês). */
function mesCurto(mes: string): string {
  const [a, m] = mes.split("-");
  return `${NOMES_DOS_MESES[Number(m) - 1].slice(0, 3)}/${a.slice(2)}`;
}

/** Tudo que a tela e a fonte precisam saber de uma seleção do seletor de período, num lugar só. */
export interface DescricaoDaSelecao {
  /** Identifica a seleção (o `key` do conteúdo, que remonta ao trocar de seleção). */
  chave: string;
  /** "últimos 7 dias", "em setembro de 2026", "em todo o período", "de 22/12 a 28/12": a frase do período. */
  legenda: string;
  /** O texto do botão do seletor quando a seleção não é um dos chips; `null` num chip. */
  rotulo: string | null;
  /** A consulta de `GET .../uso` (`mes=`, `tudo=1`, `de=&ate=`); `null` num chip, que vem na leitura inicial. */
  consulta: string | null;
}

/**
 * A descrição de uma seleção de período: UM mapeamento no lugar dos quatro `switch` da tela e da fonte (legenda,
 * chave, rótulo do botão e consulta da rota). Uma seleção nova entra aqui e em mais nenhum lugar.
 */
export function descricaoDaSelecao(s: SelecaoHistorica): DescricaoDaSelecao & { consulta: string };
export function descricaoDaSelecao(s: SelecaoDeUso): DescricaoDaSelecao;
export function descricaoDaSelecao(s: SelecaoDeUso): DescricaoDaSelecao {
  switch (s.tipo) {
    case "periodo":
      return { chave: `periodo:${s.periodo}`, legenda: PERIODOS[s.periodo].legenda, rotulo: null, consulta: null };
    case "mes":
      return {
        chave: s.mes,
        legenda: `em ${nomeDoMes(s.mes)}`,
        rotulo: nomeDoMes(s.mes),
        consulta: `mes=${s.mes}`,
      };
    case "tudo":
      return { chave: "tudo", legenda: "em todo o período", rotulo: "Todo o período", consulta: "tudo=1" };
    case "intervalo":
      return {
        chave: `${s.de}_${s.ate}`,
        legenda: `de ${diaMes(s.de)} a ${diaMes(s.ate)}`,
        rotulo: `${diaMes(s.de)} a ${diaMes(s.ate)}`,
        consulta: `de=${s.de}&ate=${s.ate}`,
      };
  }
}

/** O mês civil de São Paulo de um instante, como `AAAA-MM`. */
export function mesAtualSP(agora: number): string {
  return diaIsoSP(agora).slice(0, 7);
}

/**
 * Os meses do seletor, do mais recente ao mais antigo: o mês atual e todos os anteriores até o
 * mês da primeira atividade do cliente (nunca antes dela). Sem atividade nenhuma, só o mês atual.
 */
export function mesesDoSeletor(primeira: string | null | undefined, agora: number): string[] {
  const atual = mesAtualSP(agora);
  const inicio = primeira && DIA_ISO.test(primeira) && primeira.slice(0, 7) <= atual ? primeira.slice(0, 7) : atual;
  const lista: string[] = [];
  for (let m = atual; m >= inicio; m = somarMes(m, -1)) lista.push(m);
  return lista;
}

/** Um mês do uso: turnos e tokens por mês civil de São Paulo. */
export interface MesDeUso {
  /** AAAA-MM */
  mes: string;
  turnos: number;
  tokens: TokensDoMes;
}

/** O jsonb de `admin_cliente_uso_meses` (`[[AAAA-MM, turnos, entrada, cache, saida], ...]`) vira meses. */
export function mesesDoJson(v: unknown): MesDeUso[] {
  if (!Array.isArray(v)) return [];
  const meses: MesDeUso[] = [];
  for (const l of v) {
    if (!Array.isArray(l) || !ehMesIso(l[0])) continue;
    meses.push({ mes: l[0], turnos: num(l[1]), tokens: { entrada: num(l[2]), cache: num(l[3]), saida: num(l[4]) } });
  }
  return meses;
}

/**
 * O uso de UM mês civil, uma coluna por dia (do dia 1 ao último, ou até hoje no mês atual; dia sem
 * turno é buraco). `dias` são os dias do banco (`admin_cliente_uso` com a janela do mês).
 */
export function usoDoMes(
  dias: DiaDeUso[],
  mes: string,
  agora: number,
  modelo: string | null,
  /** Os dias do mês anterior (a base da variação); sem eles, sem comparação. */
  diasDoMesAnterior: DiaDeUso[] | null = null
): UsoDoPeriodo {
  const hoje = diaIsoSP(agora);
  const medido = new Map(dias.map((d) => [d.dia, d]));
  const barras: BarraDeUso[] = [];
  for (let d = 1; d <= diasDoMes(mes); d++) {
    const dia = `${mes}-${String(d).padStart(2, "0")}`;
    if (dia > hoje) break;
    const x = medido.get(dia);
    barras.push(barraDe(dia, diaMes(dia), textoDoDia(dia), x?.turnos ?? 0, x?.tokens ?? TOKENS_ZERO, modelo));
  }
  return {
    periodo: null,
    legenda: `em ${nomeDoMes(mes)}`,
    unidade: "dia",
    barras,
    anterior: diasDoMesAnterior ? totalDe(diasDoMesAnterior, modelo) : null,
    rotuloAnterior: nomeDoMes(somarMes(mes, -1)),
    ...totalDasBarras(barras, modelo),
  };
}

/** "Todo o período": uma coluna por mês civil, do mês da primeira atividade ao atual (mês sem turno é buraco). */
export function usoDeTodoOPeriodo(
  meses: MesDeUso[],
  primeira: string | null | undefined,
  agora: number,
  modelo: string | null
): UsoDoPeriodo {
  const lista = mesesDoSeletor(primeira, agora).reverse();
  const medido = new Map(meses.map((x) => [x.mes, x]));
  const barras = lista.map((mes) => {
    const x = medido.get(mes);
    return barraDe(mes, mesCurto(mes), nomeDoMes(mes), x?.turnos ?? 0, x?.tokens ?? TOKENS_ZERO, modelo);
  });
  return {
    periodo: null,
    legenda: `desde ${nomeDoMes(lista[0])}`,
    unidade: "mes",
    barras,
    anterior: null,
    rotuloAnterior: "",
    ...totalDasBarras(barras, modelo),
  };
}

/** Até quantos dias um intervalo escolhido sai com uma coluna por DIA; acima disso, uma por mês. */
export const MAX_DIAS_POR_COLUNA_DE_DIA = 62;

/** "22/12/2026" */
function dataCompleta(dia: string): string {
  return `${diaMes(dia)}/${dia.slice(0, 4)}`;
}

/**
 * O uso de um INTERVALO de datas escolhido pelo dono (a semana do Natal, dezembro inteiro): uma coluna
 * por dia até 62 dias, uma por mês acima disso (só os turnos que caem DENTRO do intervalo). A base da
 * variação é o intervalo anterior de mesmo tamanho, quando o servidor a mandou.
 */
export function usoDoIntervalo(a: {
  janela: JanelaDePicos;
  dias: DiaDeUso[];
  meses: MesDeUso[];
  diasAnteriores: DiaDeUso[] | null;
  agora: number;
  modelo: string | null;
}): UsoDoPeriodo {
  const { janela, modelo } = a;
  const n = diasEntre(janela.de, janela.ate);
  const barras: BarraDeUso[] = [];
  let unidade: UnidadeDeUso;
  if (n <= MAX_DIAS_POR_COLUNA_DE_DIA) {
    unidade = "dia";
    const medido = new Map(a.dias.map((d) => [d.dia, d]));
    for (let dia = janela.de; dia <= janela.ate; dia = somarDias(dia, 1)) {
      const x = medido.get(dia);
      barras.push(barraDe(dia, diaMes(dia), textoDoDia(dia), x?.turnos ?? 0, x?.tokens ?? TOKENS_ZERO, modelo));
    }
  } else {
    unidade = "mes";
    const medido = new Map(a.meses.map((x) => [x.mes, x]));
    for (let mes = janela.de.slice(0, 7); mes <= janela.ate.slice(0, 7); mes = somarMes(mes, 1)) {
      const x = medido.get(mes);
      barras.push(barraDe(mes, mesCurto(mes), nomeDoMes(mes), x?.turnos ?? 0, x?.tokens ?? TOKENS_ZERO, modelo));
    }
  }
  return {
    periodo: null,
    legenda: `de ${dataCompleta(janela.de)} a ${dataCompleta(janela.ate)}`,
    unidade,
    barras,
    anterior: a.diasAnteriores ? totalDe(a.diasAnteriores, modelo) : null,
    rotuloAnterior: `${n} ${n === 1 ? "dia anterior" : "dias anteriores"}`,
    ...totalDasBarras(barras, modelo),
  };
}

/** O que a rota de um mês, de todo o período ou de um intervalo devolve: o uso, os picos e a janela dos picos. */
export interface UsoHistorico {
  uso: UsoDoPeriodo;
  picos: DadosDePicos;
  /** O intervalo de dias que `picos` cobre (a tela precisa dele para as colunas por data e a média). */
  janela: JanelaDePicos;
}

/** Um mês, "Todo o período" ou um intervalo escolhido: o que o seletor ao lado dos chips pode pedir. */
export type SelecaoHistorica = Extract<SelecaoDeUso, { tipo: "mes" | "tudo" | "intervalo" }>;

/**
 * O que ler para montar o uso de uma seleção histórica: a janela dos picos e as janelas de dias civis de
 * cada leitura (`null` = não precisa). É a parte PURA que o servidor (`usoHistoricoDoCliente`, que lê o banco
 * por estas janelas) e o preview (`usoHistoricoDeMemoria`, que filtra o histórico falso por elas) dividem:
 * as duas pontas decidem o mesmo, e só a fonte dos números muda. `primeira` é o primeiro dia de uso do cliente
 * (só "Todo o período" depende dele). Intervalo inválido lança.
 */
export interface LeituraDoHistorico {
  janela: JanelaDePicos;
  /** Os dias das colunas (`admin_cliente_uso`); um mês passado lê o mês inteiro, um intervalo curto a própria janela. */
  dias: JanelaDePicos | null;
  /** A base da variação: o mês anterior, ou o intervalo anterior de mesmo tamanho (só por dia). */
  anteriores: JanelaDePicos | null;
  /** Os meses das colunas (`admin_cliente_uso_meses`): "Todo o período" com uso, ou um intervalo longo. */
  meses: JanelaDePicos | null;
}

export function leituraDoHistorico(selecao: SelecaoHistorica, hoje: string, primeira: string | null): LeituraDoHistorico {
  if (selecao.tipo === "mes") {
    return {
      janela: janelaDoMesCivil(selecao.mes, hoje),
      dias: janelaDoMesCivil(selecao.mes, "9999-12-31"),
      anteriores: janelaDoMesAnterior(selecao.mes),
      meses: null,
    };
  }
  if (selecao.tipo === "tudo") {
    const janela = janelaDeTudo(primeira, hoje);
    return { janela, dias: null, anteriores: null, meses: primeira ? janela : null };
  }
  const janela = janelaDoIntervalo(selecao.de, selecao.ate, hoje);
  if (!janela) throw new Error("intervalo inválido");
  const porDia = diasEntre(janela.de, janela.ate) <= MAX_DIAS_POR_COLUNA_DE_DIA;
  return {
    janela,
    dias: porDia ? janela : null,
    anteriores: porDia ? janelaAnterior(janela) : null,
    meses: porDia ? null : janela,
  };
}

/** O uso da seleção histórica, a partir do que foi lido pelas janelas de `leituraDoHistorico`. */
export function usoDoHistorico(
  selecao: SelecaoHistorica,
  lido: { dias: DiaDeUso[]; anteriores: DiaDeUso[] | null; meses: MesDeUso[] },
  ctx: { janela: JanelaDePicos; agora: number; modelo: string | null; primeira: string | null }
): UsoDoPeriodo {
  if (selecao.tipo === "mes") return usoDoMes(lido.dias, selecao.mes, ctx.agora, ctx.modelo, lido.anteriores);
  if (selecao.tipo === "tudo") return usoDeTodoOPeriodo(lido.meses, ctx.primeira, ctx.agora, ctx.modelo);
  return usoDoIntervalo({
    janela: ctx.janela,
    dias: lido.dias,
    meses: lido.meses,
    diasAnteriores: lido.anteriores,
    agora: ctx.agora,
    modelo: ctx.modelo,
  });
}

/**
 * O RITMO do limite de UMA coluna: quanto de uso esgotaria o limite do mês se o uso fosse parelho (limite ÷
 * dias do mês, e ÷ 24 por hora). Os dias são os do MÊS A QUE A COLUNA PERTENCE (`chave`: AAAA-MM-DD, AAAA-MM-DDTHH
 * ou AAAA-MM), nunca os do mês do relógio: um período de 30 dias que atravessa dois meses tem um ritmo por mês.
 * É só aritmética sobre o limite que o cliente tem; o que decide a parada continua sendo o contador do mês
 * (`consumo_ia_mensal`).
 */
export function ritmoDaBarra(limite: number, chave: string, unidade: UnidadeDeUso): number {
  if (unidade === "mes") return limite;
  return limite / diasDoMes(chave.slice(0, 7)) / (unidade === "hora" ? 24 : 1);
}

/** Uma coluna de uso com a conta contra o ritmo: o que fica abaixo e o que passa dele (duas séries empilhadas, uma sempre zero). */
export interface BarraComRitmo extends BarraDeUso {
  /** O ritmo do limite DESTA coluna (os dias do mês dela). */
  ritmo: number;
  abaixo: number;
  acima: number;
  /** A coluna passou do ritmo (estritamente acima). */
  passou: boolean;
  /** Quanto passou, em % do ritmo (0 quando não passou). */
  excessoPct: number;
}

/**
 * Separa as colunas que passam da linha do ritmo das que não passam (o gráfico pinta as de cima
 * com o tom de estado). É só comparação com o ritmo, nunca uma regra de limite: quem para a IA
 * continua sendo o contador do mês.
 */
export function barrasComRitmo(barras: BarraDeUso[], limite: number, unidade: UnidadeDeUso): BarraComRitmo[] {
  return barras.map((b) => {
    const ritmo = ritmoDaBarra(limite, b.chave, unidade);
    const passou = ritmo > 0 && b.usados > ritmo;
    return {
      ...b,
      ritmo,
      passou,
      abaixo: passou ? 0 : b.usados,
      acima: passou ? b.usados : 0,
      excessoPct: passou ? Math.round((b.usados / ritmo - 1) * 100) : 0,
    };
  });
}

/** Um trecho seguido de colunas com o MESMO ritmo (o limite por coluna muda na virada do mês): a linha tracejada é um trecho por mês. */
export interface TrechoDoRitmo {
  /** O `eixo` da primeira e da última coluna do trecho. */
  de: string;
  ate: string;
  ritmo: number;
}

export function trechosDoRitmo(barras: BarraComRitmo[]): TrechoDoRitmo[] {
  const trechos: TrechoDoRitmo[] = [];
  for (const b of barras) {
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo.ritmo === b.ritmo) ultimo.ate = b.eixo;
    else trechos.push({ de: b.eixo, ate: b.eixo, ritmo: b.ritmo });
  }
  return trechos;
}

/**
 * O tamanho da fonte (px) do número no centro de um donut: 32 (o `text-numero`) enquanto cabe e menor quando o
 * texto é largo ("15,1 mi", "128,4 mi"), para nunca passar do furo (cerca de 86px de largura no donut da aba
 * Uso de IA). Largura estimada de um algarismo ou sinal: 0,58 do tamanho; nunca abaixo de 16.
 */
export function tamanhoDoCentroDoDonut(texto: string, larguraUtil = 86): number {
  const n = Math.max(1, texto.length);
  return Math.max(16, Math.min(32, Math.floor(larguraUtil / (n * 0.58))));
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

/** O que a aba "Uso de IA" desenha (a rota devolve isto; o preview monta igual). Os quatro períodos chegam numa leitura só. */
export interface UsoDoCliente {
  periodos: Record<PeriodoKey, UsoDoPeriodo>;
  /** Turnos por dia e por dia da semana x hora de cada chip (a janela de cada um é `janelaDoChip`, `lib/picos.ts`). */
  picos: Record<PeriodoKey, DadosDePicos>;
  /** O dia (AAAA-MM-DD) do primeiro turno do cliente; limita os meses do seletor. */
  primeiraAtividade: string | null;
}

export function usoParaTela(bruto: UsoBruto, agora: number, modelo: string | null): UsoDoCliente {
  return {
    periodos: {
      dia: usoDoPeriodo(bruto, "dia", agora, modelo),
      semana: usoDoPeriodo(bruto, "semana", agora, modelo),
      quinzena: usoDoPeriodo(bruto, "quinzena", agora, modelo),
      mes: usoDoPeriodo(bruto, "mes", agora, modelo),
    },
    picos: bruto.picos ?? {
      dia: { dias: [], cubo: [] },
      semana: { dias: [], cubo: [] },
      quinzena: { dias: [], cubo: [] },
      mes: { dias: [], cubo: [] },
    },
    primeiraAtividade: bruto.primeira ?? null,
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
        rotulo: unidade === "hora" ? `${diaMes(dia)}, ${hh}h` : textoDoDia(dia),
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
  /**
   * As contas do período anterior que têm variação (a base dos selos). `null` quando a leitura não trouxe
   * a janela anterior. O volume de conversas fica de fora de propósito (a definição dessa métrica está com o dono).
   */
  anterior: { respostasIa: number; primeiraRespostaMs: number | null } | null;
  /** "o mesmo dia da semana passada", "os 7 dias anteriores": o que a variação compara. */
  rotuloAnterior: string;
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
 * As OITO janelas do atendimento numa lista só, como o painel pede (`montarJanelas`, `lib/painel-agregado.ts`): a
 * atual de cada período (`ORDEM_PERIODOS`) e a anterior colada nela (a base da variação, pela regra de
 * `lib/periodo.ts`: a janela igual, e para o Dia o mesmo dia da semana passada). UMA chamada de
 * `painel_janelas` as lê juntas (separadas, cada uma refazia a janela do acumulado).
 */
export function planoDoAtendimento(agora: number): JanelasDoPainel {
  return montarJanelas(agora, {}, null);
}

/**
 * As quatro janelas ATUAIS (`ORDEM_PERIODOS`), na ordem em que vão ao banco: o período `k` é a janela
 * `indexOf(k) + 1` das respostas de `painel_motivos` e `admin_cliente_solucoes`.
 */
export function janelasDoAtendimento(agora: number): LimitesDeJanela[] {
  const plano = planoDoAtendimento(agora);
  return ORDEM_PERIODOS.map((k) => plano.lista[plano.operacao[k].atual - 1]);
}

/**
 * A resposta de UMA chamada de `painel_janelas` com o plano de `planoDoAtendimento` vira as quatro janelas
 * atuais e as quatro anteriores, cada lista renumerada 1 a 4 na ordem de `ORDEM_PERIODOS` (o que
 * `atendimentoPorPeriodo` espera).
 */
export function atuaisEAnteriores(
  linhas: JanelaAgregada[],
  plano: JanelasDoPainel
): { atuais: JanelaAgregada[]; anteriores: JanelaAgregada[] } {
  const lido = agregadoDe(linhas, null);
  const separar = (qual: "atual" | "anterior") =>
    ORDEM_PERIODOS.map((k, i) => ({ ...lido.janela(plano.operacao[k][qual]), janela: i + 1 }));
  return { atuais: separar("atual"), anteriores: separar("anterior") };
}

/** As respostas das três chamadas (uma por função, as quatro janelas juntas) viram os quatro períodos. */
export function atendimentoPorPeriodo(a: {
  janelas: JanelaAgregada[];
  /** `painel_janelas` das quatro janelas anteriores (`atuaisEAnteriores`); sem elas, sem variação. */
  anteriores?: JanelaAgregada[];
  motivos: { janela: number; motivo: string | null; n: number }[];
  solucoes: { janela: number; solucao: string | null; aberto: boolean; n: number }[];
  regrasSalvas: number;
  /** `painel_series` do cliente (as colunas do movimento) e o relógio do servidor. */
  series?: SeriesAgregadas | null;
  agora: number;
}): AtendimentoPorPeriodo {
  const agregado = agregadoDe(a.janelas, a.series ?? null);
  const agregadoAnterior = a.anteriores ? agregadoDe(a.anteriores, null) : null;
  const porPeriodo = (k: PeriodoKey) => {
    const janela = ORDEM_PERIODOS.indexOf(k) + 1;
    return atendimentoDe({
      periodo: k,
      janela: agregado.janela(janela),
      anterior: agregadoAnterior ? agregadoAnterior.janela(janela) : undefined,
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
  /** A janela anterior (a base da variação). */
  anterior?: JanelaAgregada;
}): AtendimentoDoCliente {
  const m = metricsDaJanela(a.janela);
  const antes = a.anterior ? metricsDaJanela(a.anterior) : null;
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
    anterior: antes ? { respostasIa: antes.respostasIa, primeiraRespostaMs: antes.primeiraRespostaMs } : null,
    rotuloAnterior: a.periodo === "dia" ? "o mesmo dia da semana passada" : `os ${PERIODOS[a.periodo].dias} dias anteriores`,
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
  /** O modelo de IA que o cliente usa (o do último turno, ou o do sistema) e de onde veio. */
  modelo: ModeloDoCliente;
}

/**
 * O modelo de IA do cliente. `ultimo_turno`: o `agent_turns.model` do turno mais recente do cliente
 * (o que ele realmente usa). `sistema`: o cliente ainda não teve turno com modelo, então vale o modelo
 * atual do sistema (`AGENT_MODEL`). O custo estimado de TODO o período usa o preço desse modelo.
 */
export interface ModeloDoCliente {
  nome: string;
  origem: "ultimo_turno" | "sistema";
}

/** A frase que diz qual modelo é e por quê. */
export function textoDoModelo(m: ModeloDoCliente): string {
  return m.origem === "ultimo_turno"
    ? `${m.nome}, o modelo do último turno do cliente`
    : `${m.nome}, o modelo atual do sistema (o cliente ainda não teve turno)`;
}
