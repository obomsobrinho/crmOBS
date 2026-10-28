// AGENDA PRÓPRIA (28/10/2026, docs/plano-agenda.md). MÓDULO PURO: sem I/O, sem
// supabase, sem process.env. É a ÚNICA regra de horário livre do produto: o
// cérebro (`processTurn`), as rotas da agenda, a tela `/agenda` e o preview de
// `/design/agenda` importam daqui. O princípio é o de `lib/horarios.ts`: o
// modelo conversa, o código faz a conta (bateria de 05/10/2026).
//
// Regras do dono (revisão de 28/10/2026, "Pode mandar"):
// - a IA SEMPRE pergunta o dia e o período antes; com os dois, o CÓDIGO escreve
//   a oferta: no máximo 3 horários daquele período, os mais próximos;
// - a IA não tem limite de dias à frente; o time marca à mão sem limite e fora
//   do expediente;
// - horário livre dentro da antecedência mínima a IA não marca: escala para o
//   time (pedido de ajuda), não esconde;
// - lembrete automático numa execução por dia às 9h, para os horários de
//   amanhã até o próximo dia aberto.
// O que ainda não foi decidido está marcado "PENDENTE" ao lado.

import { DAY_LABEL, normalizeHours, type BusinessHours, type DayKey } from "./agent-prompt";
import { diaIsoSP, diaMes, inicioDoDiaSP, somarDias } from "./fuso";
import { horaTexto, minutosAgoraSP } from "./horarios";
import { feriadoDoDia, type Feriado } from "./feriados";

const MIN = 60_000;
const DIA_MS = 86_400_000;
const CHAVE_POR_DIA: DayKey[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

// ————————————————————————————————————————————————————————————————
// Configuração
// ————————————————————————————————————————————————————————————————

/** "Os horários começam": na hora cheia, na hora ou meia hora, ou logo após o anterior. */
export type InicioDosHorarios = "hora" | "meia" | "seguido";

export interface AgendaConfig {
  /** Agenda ligada: menu, coluna "Agendado" do funil e prompt da IA. */
  ativa: boolean;
  /** Antecedência mínima para a IA marcar sozinha, em minutos (valor livre). */
  antecedenciaMin: number;
  /** Intervalo livre depois de cada horário, em minutos. */
  intervaloMin: number;
  inicio: InicioDosHorarios;
  /** Lembrete automático às 9h do dia anterior (último dia aberto antes do horário). */
  lembrete: boolean;
  /**
   * Dias e horários PRÓPRIOS da agenda (decisão do dono, 28/10/2026: "Sim,
   * horário próprio"), separados do horário de atendimento do agente. É deles
   * que saem os horários livres da IA e a grade. null = nunca salvo: vale a
   * cópia do horário de atendimento (`horarioDaAgenda`). O lembrete segue os
   * dias em que a LOJA abre (horário de atendimento, `janelaDoLembrete`).
   */
  horario: BusinessHours | null;
  /** Feriados nacionais que o dono LIBEROU (AAAA-MM-DD); os outros vêm bloqueados para a IA. */
  feriadosLiberados: string[];
}

export const AGENDA_PADRAO: AgendaConfig = {
  ativa: false,
  antecedenciaMin: 120,
  intervaloMin: 0,
  inicio: "meia",
  // Ligado ao ativar a agenda (decisão do dono, 28/10/2026).
  lembrete: true,
  horario: null,
  feriadosLiberados: [],
};

/** No máximo quantos horários a IA oferece de uma vez (regra do dono). */
export const OFERTAS_DE_UMA_VEZ = 3;
/** Antecedência aceita (minutos): até 7 dias. */
export const ANTECEDENCIA_MAX = 7 * 24 * 60;
/** Duração aceita para um serviço, em minutos. Igual ao check da migration. */
export const DURACAO_MIN = 5;
export const DURACAO_MAX = 480;

export const OPCOES_INTERVALO = [0, 5, 10, 15, 30] as const;

export const OPCOES_INICIO: { valor: InicioDosHorarios; rotulo: string; exemplo: string }[] = [
  { valor: "hora", rotulo: "Na hora cheia", exemplo: "8h, 9h, 10h" },
  { valor: "meia", rotulo: "Na hora cheia ou na meia hora", exemplo: "8h, 8h30, 9h" },
  { valor: "seguido", rotulo: "Logo após o anterior", exemplo: "8h, 8h40, 9h20" },
];

function inteiroEntre(v: unknown, min: number, max: number, padrao: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : padrao;
}

/** `clients.agenda_config` como chega do banco (null = nunca configurada). */
export function normalizarConfigDaAgenda(raw: unknown): AgendaConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    ativa: o.ativa === true,
    antecedenciaMin: inteiroEntre(o.antecedenciaMin, 0, ANTECEDENCIA_MAX, AGENDA_PADRAO.antecedenciaMin),
    intervaloMin:
      typeof o.intervaloMin === "number" && (OPCOES_INTERVALO as readonly number[]).includes(o.intervaloMin)
        ? o.intervaloMin
        : AGENDA_PADRAO.intervaloMin,
    inicio: o.inicio === "hora" || o.inicio === "meia" || o.inicio === "seguido" ? o.inicio : AGENDA_PADRAO.inicio,
    lembrete: typeof o.lembrete === "boolean" ? o.lembrete : AGENDA_PADRAO.lembrete,
    horario: o.horario && typeof o.horario === "object" ? normalizeHours(o.horario) : null,
    feriadosLiberados: Array.isArray(o.feriadosLiberados)
      ? o.feriadosLiberados.filter((d): d is string => typeof d === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d)).slice(0, 60)
      : [],
  };
}

/**
 * O horário que a AGENDA usa: o próprio, ou, enquanto nunca foi salvo, uma
 * cópia do horário de atendimento. Pode passar do horário de atendimento, sem
 * bloqueio (decisão do dono, 28/10/2026: "Pode passar"); o lembrete segue
 * pelo horário de atendimento (`janelaDoLembrete`).
 */
export function horarioDaAgenda(config: AgendaConfig, atendimento: BusinessHours | null): BusinessHours | null {
  return config.horario ?? atendimento;
}

/** "2h", "30 min", "1h30", "1 dia": a antecedência como a tela e a IA dizem. */
export function textoDeDuracao(min: number): string {
  if (min % 1440 === 0 && min > 0) return min === 1440 ? "1 dia" : `${min / 1440} dias`;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// ————————————————————————————————————————————————————————————————
// Tipos
// ————————————————————————————————————————————————————————————————

/** Um trecho de tempo em ms (agendamento confirmado ou bloqueio). */
export interface Intervalo {
  inicio: number;
  fim: number;
}

export interface ServicoDaAgenda {
  id: number;
  nome: string;
  duracaoMin: number;
}

/**
 * O que impede salvar a lista de serviços, na frase da tela, ou null. Usada
 * pelas Configurações da agenda e pela montagem (a rota confere de novo).
 */
export function problemaDosServicos(
  ativa: boolean,
  lista: { nome: string; duracaoMin: number }[]
): string | null {
  if (ativa && lista.length === 0) return "Cadastre pelo menos um serviço para ligar a agenda.";
  if (lista.some((s) => !s.nome || !Number.isInteger(s.duracaoMin) || s.duracaoMin < DURACAO_MIN || s.duracaoMin > DURACAO_MAX)) {
    return `Todo serviço precisa de nome e de uma duração entre ${DURACAO_MIN} e ${DURACAO_MAX} minutos.`;
  }
  return null;
}

/** Um agendamento futuro da pessoa da conversa, com o código do turno. */
export interface AgendamentoDaPessoa {
  codigo: string;
  id: number;
  servicoId: number | null;
  servicoNome: string;
  inicio: number;
  fim: number;
  /** Quando o lembrete saiu (null = não saiu). */
  lembreteEnviadoEm?: number | null;
  /** Quando o contato confirmou presença (null = não confirmou). */
  confirmadoEm?: number | null;
}

/**
 * Períodos da AGENDA, pelo horário de início. PENDENTE: o dono decidiu "dia e
 * período (manhã/tarde etc.)", não onde cada um começa. Diferente de
 * `PERIODOS_DO_DIA` (lib/horarios.ts), que lista horas cheias para oferecer sem
 * agenda e deixa o meio-dia de fora: aqui todo horário livre cai num período.
 */
export const PERIODOS_DA_AGENDA = [
  { chave: "manha", nome: "de manhã", de: 0, ate: 12 * 60 },
  { chave: "tarde", nome: "à tarde", de: 12 * 60, ate: 18 * 60 },
  { chave: "noite", nome: "à noite", de: 18 * 60, ate: 24 * 60 },
] as const;
export type PeriodoDaAgenda = (typeof PERIODOS_DA_AGENDA)[number]["chave"];

// ————————————————————————————————————————————————————————————————
// Conta de horário livre
// ————————————————————————————————————————————————————————————————

function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutosNoDia(ms: number): number {
  return minutosAgoraSP(new Date(ms));
}

export function chaveDoDia(dia: string): DayKey {
  const [a, m, d] = dia.split("-").map(Number);
  return CHAVE_POR_DIA[new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()];
}

/**
 * O expediente de um dia em ms, ou null quando fechado. Expediente que vira a
 * noite (18:00 às 02:00) termina no dia seguinte, como em `calendarioBlock`.
 */
export function expedienteDoDia(dia: string, hours: BusinessHours): Intervalo | null {
  const h = hours[chaveDoDia(dia)];
  if (!h.open) return null;
  const base = inicioDoDiaSP(dia);
  const de = minutosDe(h.from);
  let ate = minutosDe(h.to);
  if (ate <= de) ate += 24 * 60;
  return { inicio: base + de * MIN, fim: base + ate * MIN };
}

/** O trecho bate em algum ocupado, contando o intervalo depois de cada um? */
export function conflita(inicio: number, fim: number, ocupados: Intervalo[], intervaloMin = 0): boolean {
  const folga = intervaloMin * MIN;
  return ocupados.some((o) => inicio < o.fim + folga && fim + folga > o.inicio);
}

/** A próxima marca da grade a partir de `t` (hora cheia ou meia hora, no fuso de SP). */
function proximaMarca(t: number, inicio: InicioDosHorarios): number {
  if (inicio === "seguido") return t;
  const passo = (inicio === "hora" ? 60 : 30) * MIN;
  // SP é UTC-3 o ano todo: a grade em UTC deslocada 3h é a grade de SP.
  const desloc = 3 * 60 * MIN;
  return Math.ceil((t + desloc) / passo) * passo - desloc;
}

/**
 * Os inícios livres de UM dia para um serviço de `duracaoMin`, dentro do
 * expediente (a menos que `janela` diga outra), sem bater em nada ocupado e
 * respeitando o intervalo. "Logo após o anterior" encadeia: depois de cada
 * horário (livre ou ocupado) vem fim + intervalo. Hora cheia e meia hora:
 * fim + intervalo arredondado para a próxima marca.
 */
export function iniciosDoDia(a: {
  dia: string;
  hours: BusinessHours;
  ocupados: Intervalo[];
  config: Pick<AgendaConfig, "intervaloMin" | "inicio">;
  duracaoMin: number;
  /** Só inícios a partir deste instante (o "agora" ou a antecedência). */
  aPartirDe?: number;
  /** O time marca fora do expediente: a janela é o dia inteiro. */
  janela?: Intervalo;
}): number[] {
  const exp = a.janela ?? expedienteDoDia(a.dia, a.hours);
  if (!exp) return [];
  const dur = a.duracaoMin * MIN;
  const folga = a.config.intervaloMin * MIN;
  const ordenados = [...a.ocupados].sort((x, y) => x.inicio - y.inicio);
  const out: number[] = [];
  let t = proximaMarca(exp.inicio, a.config.inicio);
  while (t + dur <= exp.fim) {
    const bate = ordenados.find((o) => t < o.fim + folga && t + dur + folga > o.inicio);
    if (bate) {
      t = proximaMarca(bate.fim + folga, a.config.inicio);
      continue;
    }
    if (a.aPartirDe === undefined || t >= a.aPartirDe) out.push(t);
    t = a.config.inicio === "seguido" ? t + dur + folga : proximaMarca(t + 1, a.config.inicio);
  }
  return out;
}

/** O período de um início. */
export function periodoDe(ms: number): PeriodoDaAgenda {
  const m = minutosNoDia(ms);
  return PERIODOS_DA_AGENDA.find((p) => m >= p.de && m < p.ate)?.chave ?? "noite";
}

/**
 * Feriado nacional que a agenda NÃO atende: vem bloqueado para a IA por padrão
 * e o dono libera um feriado específico (`feriadosLiberados`). Ponto
 * facultativo (Carnaval, Corpus Christi) só aparece marcado. Devolve o feriado
 * que fecha o dia, ou null.
 */
export function feriadoQueFecha(dia: string, config: Pick<AgendaConfig, "feriadosLiberados">): Feriado | null {
  const f = feriadoDoDia(dia);
  return f && f.tipo === "nacional" && !config.feriadosLiberados.includes(dia) ? f : null;
}

/**
 * Os períodos em que a agenda atende num dia (decisão do dono, 28/10/2026: a
 * IA entende o período pelo horário da agenda; das 13h às 17h é só à tarde).
 */
export function periodosDoDia(dia: string, hours: BusinessHours): PeriodoDaAgenda[] {
  const exp = expedienteDoDia(dia, hours);
  if (!exp) return [];
  const base = inicioDoDiaSP(dia);
  return PERIODOS_DA_AGENDA.filter((p) => exp.inicio < base + p.ate * MIN && exp.fim > base + p.de * MIN).map(
    (p) => p.chave
  );
}

export type ResultadoDaConsulta =
  /** Até 3 horários do período, os mais próximos. */
  | { tipo: "ofertas"; inicios: number[] }
  /** O período tem livre só dentro da antecedência: a IA escala. */
  | { tipo: "antecedencia"; inicios: number[] }
  /** Dia fechado na agenda (dia sem atendimento ou feriado). */
  | { tipo: "fechado"; feriado: string | null }
  /** O dia tem agenda, mas não nesse período: diz quais períodos existem. */
  | { tipo: "semPeriodo"; periodos: PeriodoDaAgenda[] }
  /** Nada livre no período (tudo ocupado, bloqueado ou já passou). */
  | { tipo: "vazio" };

/** O que a IA pode oferecer para um dia e período (a consulta do turno). */
export function consultarPeriodo(a: {
  agora: number;
  dia: string;
  periodo: PeriodoDaAgenda;
  hours: BusinessHours;
  ocupados: Intervalo[];
  config: AgendaConfig;
  duracaoMin: number;
}): ResultadoDaConsulta {
  const feriado = feriadoQueFecha(a.dia, a.config);
  if (feriado) return { tipo: "fechado", feriado: feriado.nome };
  const periodos = periodosDoDia(a.dia, a.hours);
  if (periodos.length === 0) return { tipo: "fechado", feriado: null };
  if (!periodos.includes(a.periodo)) return { tipo: "semPeriodo", periodos };
  const todos = iniciosDoDia({ ...a, aPartirDe: a.agora }).filter((t) => periodoDe(t) === a.periodo);
  const cedo = a.agora + a.config.antecedenciaMin * MIN;
  const fora = todos.filter((t) => t >= cedo);
  if (fora.length > 0) return { tipo: "ofertas", inicios: fora.slice(0, OFERTAS_DE_UMA_VEZ) };
  if (todos.length > 0) return { tipo: "antecedencia", inicios: todos.slice(0, OFERTAS_DE_UMA_VEZ) };
  return { tipo: "vazio" };
}

export type ValidacaoDoHorario = "ok" | "antecedencia" | "ocupado" | "fora" | "passou";

/** Um horário escolhido pela pessoa pode ser marcado pela IA? */
export function validarHorario(a: {
  agora: number;
  inicio: number;
  hours: BusinessHours;
  ocupados: Intervalo[];
  config: AgendaConfig;
  duracaoMin: number;
}): ValidacaoDoHorario {
  if (a.inicio <= a.agora) return "passou";
  const dia = diaIsoSP(a.inicio);
  if (feriadoQueFecha(dia, a.config)) return "fora";
  // Com os ocupados: em "logo após o anterior" a grade depende do que já está
  // marcado. Expediente que vira a noite: o início pode ser do de ontem.
  const valeNoDia = (d: string) => iniciosDoDia({ ...a, dia: d }).includes(a.inicio);
  if (!valeNoDia(dia) && !valeNoDia(somarDias(dia, -1))) {
    return conflita(a.inicio, a.inicio + a.duracaoMin * MIN, a.ocupados, a.config.intervaloMin) ? "ocupado" : "fora";
  }
  if (a.inicio < a.agora + a.config.antecedenciaMin * MIN) return "antecedencia";
  return "ok";
}

/** Horários livres de um dia para o TIME (sem antecedência; fora do expediente opcional). */
export function horariosDoTime(a: {
  agora: number;
  dia: string;
  hours: BusinessHours;
  ocupados: Intervalo[];
  config: AgendaConfig;
  duracaoMin: number;
  foraDoExpediente?: boolean;
}): number[] {
  const base = inicioDoDiaSP(a.dia);
  // Feriado fechado conta como dia sem expediente: o time marca só pedindo "fora do expediente".
  if (!a.foraDoExpediente && feriadoQueFecha(a.dia, a.config)) return [];
  return iniciosDoDia({
    ...a,
    aPartirDe: a.agora,
    janela: a.foraDoExpediente ? { inicio: base, fim: base + DIA_MS } : undefined,
  });
}

// ————————————————————————————————————————————————————————————————
// Lembrete (uma execução por dia às 9h de São Paulo, decisão do dono)
// ————————————————————————————————————————————————————————————————
//
// Uma execução por dia, às `HORA_DO_LEMBRETE` (igual para todas as empresas,
// não segue a abertura de cada uma). Só roda para a empresa em dia que ela ABRE
// (horário de atendimento) e manda os horários marcados de amanhã até o próximo
// dia em que ela abre, inclusive: fecha sábado e domingo, na sexta saem os de
// sábado, domingo e segunda. Horário marcado depois da execução que o cobriria
// não recebe lembrete (a confirmação na marcação já serve). Feriado não entra:
// o produto não tem calendário de feriados, vale só o horário semanal.

/** Hora da execução diária do lembrete, em São Paulo. */
export const HORA_DO_LEMBRETE = 9;
/** Até quantos dias à frente procurar o próximo dia aberto. */
const DIAS_DE_BUSCA = 7;

function abreNoDia(dia: string, hours: BusinessHours): boolean {
  return hours[chaveDoDia(dia)].open;
}

/**
 * Os dias cobertos pela execução de `hoje`: de amanhã até o próximo dia em que
 * a empresa abre, inclusive. null quando a empresa não abre hoje (não roda) ou
 * não abre em nenhum dos próximos 7 dias.
 */
export function janelaDoLembrete(hoje: string, hours: BusinessHours): { de: string; ate: string } | null {
  if (!abreNoDia(hoje, hours)) return null;
  for (let i = 1; i <= DIAS_DE_BUSCA; i++) {
    const d = somarDias(hoje, i);
    if (abreNoDia(d, hours)) return { de: somarDias(hoje, 1), ate: d };
  }
  return null;
}

/** O dia da execução que cobre um horário: o último dia aberto ANTES dele, ou null. */
export function diaDoLembrete(diaDoHorario: string, hours: BusinessHours): string | null {
  for (let i = 1; i <= DIAS_DE_BUSCA; i++) {
    const d = somarDias(diaDoHorario, -i);
    if (abreNoDia(d, hours)) return d;
  }
  return null;
}

/** O instante da execução de um dia (9h em São Paulo). */
export function execucaoDoDia(dia: string): number {
  return inicioDoDiaSP(dia) + HORA_DO_LEMBRETE * 60 * MIN;
}

/**
 * O lembrete deste horário: o dia em que sai, ou null (lembrete desligado, sem
 * dia aberto antes, ou marcado depois da execução que o cobriria). O Vercel
 * Cron do plano Hobby pode disparar até 59 min depois das 9h: o que for
 * marcado nesse meio pode ainda entrar, e a tela diz "sem lembrete".
 */
export function lembreteDoHorario(a: {
  inicio: number;
  marcadoEm: number;
  hours: BusinessHours | null;
  ligado: boolean;
}): { dia: string } | null {
  if (!a.ligado || !a.hours) return null;
  const dia = diaDoLembrete(diaIsoSP(a.inicio), a.hours);
  if (!dia || a.marcadoEm >= execucaoDoDia(dia)) return null;
  return { dia };
}

// ————————————————————————————————————————————————————————————————
// Texto: dias e horas como a conversa e a tela dizem
// ————————————————————————————————————————————————————————————————

/** "09:30": hora e minuto com dois dígitos, no fuso de São Paulo. */
export function hhmm(ms: number): string {
  const m = minutosNoDia(ms);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "09:30 às 10:00". */
export function faixaHoraria(inicio: number, fim: number): string {
  return `${hhmm(inicio)} às ${hhmm(fim)}`;
}

function diaFaladoDoIso(dia: string, hoje: string): string {
  const nome = `${DAY_LABEL[chaveDoDia(dia)]}, ${diaMes(dia)}`;
  if (dia === hoje) return `hoje, ${nome}`;
  if (dia === somarDias(hoje, 1)) return `amanhã, ${nome}`;
  return nome;
}

/** "amanhã, quinta, 29/10" ou "sexta, 30/10": como a IA diz o dia. */
export function diaFalado(ms: number, agora: number): string {
  return diaFaladoDoIso(diaIsoSP(ms), diaIsoSP(agora));
}

/** "amanhã, quinta, 29/10, às 10h30". */
export function quandoFalado(ms: number, agora: number): string {
  return `${diaFalado(ms, agora)}, às ${horaTexto(minutosNoDia(ms))}`;
}

/** Título de grupo na tela: "Hoje, quarta 28/10", "Amanhã, quinta 29/10", "Sexta 30/10". */
export function rotuloDoDia(dia: string, hoje: string): string {
  const nome = `${DAY_LABEL[chaveDoDia(dia)]} ${diaMes(dia)}`;
  if (dia === hoje) return `Hoje, ${nome}`;
  if (dia === somarDias(hoje, 1)) return `Amanhã, ${nome}`;
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function listaFalada(itens: string[]): string {
  return itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} ou ${itens[itens.length - 1]}`;
}

function nomeDoPeriodo(p: PeriodoDaAgenda): string {
  return PERIODOS_DA_AGENDA.find((x) => x.chave === p)!.nome;
}

// ————————————————————————————————————————————————————————————————
// Bloco do prompt
// ————————————————————————————————————————————————————————————————

/** Código de um serviço no turno: V1, V2... na ordem da lista. */
export function codigoDoServico(i: number): string {
  return `V${i + 1}`;
}

/** "segunda a sexta: manhã e tarde; sábado: manhã": os períodos da agenda por dia da semana. */
export function resumoDosPeriodos(hours: BusinessHours): string {
  const ordem: DayKey[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  // Uma semana qualquer (a de 05/01/2026 começa na segunda): só importa o dia da semana.
  const grupos: { dias: DayKey[]; texto: string }[] = [];
  ordem.forEach((k, i) => {
    const ps = periodosDoDia(somarDias("2026-01-05", i), hours);
    if (ps.length === 0) return;
    const texto = ps.map((p) => PERIODOS_DA_AGENDA.find((x) => x.chave === p)!.nome.replace(/^(de|à) /, "")).join(" e ");
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === texto && ordem.indexOf(ultimo.dias[ultimo.dias.length - 1]) === i - 1) ultimo.dias.push(k);
    else grupos.push({ dias: [k], texto });
  });
  if (grupos.length === 0) return "nenhum";
  return grupos
    .map((g) => `${g.dias.length > 1 ? `${DAY_LABEL[g.dias[0]]} a ${DAY_LABEL[g.dias[g.dias.length - 1]]}` : DAY_LABEL[g.dias[0]]}: ${g.texto}`)
    .join("; ");
}

/**
 * `### AGENDA` do turno: os serviços (com código quando há mais de um), os
 * agendamentos futuros da pessoa e o contrato. Vai DEPOIS do AGORA e do
 * CALENDÁRIO (`runAgent`): muda a cada marcação e não pode mexer no prefixo do
 * cache. Os horários NÃO vão aqui: quem os escreve, no máximo 3, é o código,
 * depois que a pessoa diz o dia e o período.
 */
export function blocoDaAgenda(a: {
  agora: number;
  daPessoa: AgendamentoDaPessoa[];
  servicos: ServicoDaAgenda[];
  config: AgendaConfig;
  /** O horário da agenda (para dizer em que períodos ela atende). */
  hours: BusinessHours;
}): string {
  const varios = a.servicos.length > 1;
  const linhas = [
    "### AGENDA",
    "A empresa marca horários pela conversa, e o sistema confere a agenda. Você não sabe quais horários estão livres: nunca diga um horário por conta própria.",
    varios
      ? "1. Se ainda não sabe o serviço, pergunte qual é (lista abaixo)."
      : "1. Só há um serviço: não pergunte qual.",
    '2. Pergunte o dia e o período (manhã, tarde ou noite). Com o dia E o período, use agenda.acao "consultar", agenda.dia (AAAA-MM-DD, pelo CALENDÁRIO) e agenda.periodo (manha, tarde ou noite)' +
      (varios ? " e agenda.servico com o código" : "") +
      ". O sistema escreve a resposta com até 3 horários; a sua é descartada.",
    '3. Quando a pessoa escolher um dos horários que o sistema ofereceu, confirme o dia e a hora, use action agendar, agenda.acao "marcar", agenda.dia e agenda.hora (HH:MM)' +
      (varios ? " e agenda.servico" : "") +
      ". O sistema confere antes de gravar.",
    `Horário com menos de ${textoDeDuracao(a.config.antecedenciaMin)} de antecedência o sistema não marca: ele chama o time.`,
    `Períodos em que a agenda atende: ${resumoDosPeriodos(a.hours)}. Ofereça só esses; se a pessoa pedir outro, diga quais existem. Feriado nacional a agenda não atende, a menos que o sistema ofereça horário.`,
  ];
  if (varios) {
    linhas.push("Serviços:");
    a.servicos.forEach((s, i) => linhas.push(`- [${codigoDoServico(i)}] ${s.nome} (${s.duracaoMin} min)`));
  }
  if (a.daPessoa.length > 0) {
    linhas.push("", "### AGENDAMENTOS DESTA PESSOA");
    for (const g of a.daPessoa) {
      const estado = g.confirmadoEm
        ? " (confirmado pelo contato)"
        : g.lembreteEnviadoEm
          ? " (lembrete enviado, aguardando confirmação)"
          : "";
      linhas.push(`- [${g.codigo}] ${g.servicoNome}, ${quandoFalado(g.inicio, a.agora)}${estado}`);
    }
    linhas.push(
      'Remarcar: siga os passos 2 e 3 com agenda.acao "remarcar" e agenda.agendamento com o código (ex.: "A1").',
      'Cancelar: confirme com a pessoa uma vez; confirmado, action none, agenda.acao "cancelar" e agenda.agendamento com o código.'
    );
    if (a.daPessoa.some((g) => g.lembreteEnviadoEm && !g.confirmadoEm)) {
      linhas.push(
        'Confirmar presença: se a pessoa confirmar (sim, confirmo, ok, estarei lá) um horário com "lembrete enviado, aguardando confirmação", use action none, agenda.acao "confirmar" e agenda.agendamento com o código, e responda curto com o dia e a hora (ex.: "Perfeito, te espero amanhã às 10h30!"). Qualquer outra mensagem você atende normal, sabendo do lembrete.'
      );
    }
  }
  return linhas.join("\n");
}

// ————————————————————————————————————————————————————————————————
// Decisão do turno (o que o código faz com a saída do modelo)
// ————————————————————————————————————————————————————————————————

export type AcaoDaAgenda = "" | "consultar" | "marcar" | "remarcar" | "cancelar" | "confirmar";

/** O campo `agenda` da saída do modelo (`lib/agent.ts`). */
export interface SaidaDaAgenda {
  acao: AcaoDaAgenda;
  servico: string;
  dia: string;
  periodo: string;
  hora: string;
  agendamento: string;
}

export const SAIDA_DA_AGENDA_VAZIA: SaidaDaAgenda = {
  acao: "",
  servico: "",
  dia: "",
  periodo: "",
  hora: "",
  agendamento: "",
};

export type DecisaoDaAgenda =
  | { tipo: "nada" }
  /** O código responde com até 3 horários (ou diz que não há). */
  | { tipo: "consultar"; servico: ServicoDaAgenda; dia: string; periodo: PeriodoDaAgenda; resultado: ResultadoDaConsulta }
  | { tipo: "marcar"; servico: ServicoDaAgenda; inicio: number; fim: number }
  | { tipo: "remarcar"; servico: ServicoDaAgenda; inicio: number; fim: number; agendamento: AgendamentoDaPessoa }
  | { tipo: "cancelar"; agendamento: AgendamentoDaPessoa }
  /** O contato confirmou presença (normalmente depois do lembrete). */
  | { tipo: "confirmar"; agendamento: AgendamentoDaPessoa }
  /** Horário escolhido dentro da antecedência mínima: pedido de ajuda ao time. */
  | { tipo: "escalar"; servico: ServicoDaAgenda; inicio: number }
  /** O horário escolhido não vale (ocupado, fora da grade): o código oferece outros do período. */
  | { tipo: "indisponivel"; servico: ServicoDaAgenda; dia: string; periodo: PeriodoDaAgenda; resultado: ResultadoDaConsulta }
  /** O modelo quis marcar sem dia, hora ou serviço válidos: o código pede o que falta. */
  | { tipo: "invalido" };

function servicoDaSaida(codigo: string, servicos: ServicoDaAgenda[]): ServicoDaAgenda | null {
  if (servicos.length === 1) return servicos[0];
  const i = servicos.findIndex((_, j) => codigoDoServico(j) === codigo.trim().toUpperCase());
  return i >= 0 ? servicos[i] : null;
}

function inicioDaSaida(dia: string, hora: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{1,2}:\d{2}$/.test(hora)) return null;
  const m = minutosDe(hora);
  if (m < 0 || m >= 24 * 60) return null;
  return inicioDoDiaSP(dia) + m * MIN;
}

function ehPeriodo(p: string): p is PeriodoDaAgenda {
  return PERIODOS_DA_AGENDA.some((x) => x.chave === p);
}

/**
 * Regra pura do turno. Com a agenda ligada, `action: agendar` sem dia, hora e
 * serviço válidos nunca vira "marcado", e um horário só é gravado depois de
 * `validarHorario`.
 */
export function decidirAgenda(a: {
  action: string;
  saida: SaidaDaAgenda;
  agora: number;
  hours: BusinessHours;
  ocupados: Intervalo[];
  config: AgendaConfig;
  servicos: ServicoDaAgenda[];
  daPessoa: AgendamentoDaPessoa[];
}): DecisaoDaAgenda {
  const agendamento = a.daPessoa.find((g) => g.codigo === a.saida.agendamento.trim().toUpperCase()) ?? null;
  if (a.saida.acao === "cancelar") return agendamento ? { tipo: "cancelar", agendamento } : { tipo: "nada" };
  // Confirmação de presença (depois do lembrete): só grava, a resposta é da IA.
  if (a.saida.acao === "confirmar") return agendamento ? { tipo: "confirmar", agendamento } : { tipo: "nada" };

  const servico = servicoDaSaida(a.saida.servico, a.servicos);
  if (a.saida.acao === "consultar") {
    if (!servico || !/^\d{4}-\d{2}-\d{2}$/.test(a.saida.dia) || !ehPeriodo(a.saida.periodo)) return { tipo: "invalido" };
    // Na remarcação o horário antigo da pessoa não conta como ocupado.
    const ocupados = agendamento ? a.ocupados.filter((o) => o.inicio !== agendamento.inicio) : a.ocupados;
    const resultado = consultarPeriodo({ ...a, ocupados, dia: a.saida.dia, periodo: a.saida.periodo, duracaoMin: servico.duracaoMin });
    return { tipo: "consultar", servico, dia: a.saida.dia, periodo: a.saida.periodo, resultado };
  }

  const querMarcar = a.action === "agendar" || a.saida.acao === "marcar" || a.saida.acao === "remarcar";
  if (!querMarcar) return { tipo: "nada" };
  const inicio = inicioDaSaida(a.saida.dia, a.saida.hora);
  if (!servico || inicio === null) return { tipo: "invalido" };
  const ocupados = agendamento ? a.ocupados.filter((o) => o.inicio !== agendamento.inicio) : a.ocupados;
  const v = validarHorario({ ...a, ocupados, inicio, duracaoMin: servico.duracaoMin });
  if (v === "antecedencia") return { tipo: "escalar", servico, inicio };
  if (v !== "ok") {
    const dia = diaIsoSP(inicio);
    const periodo = periodoDe(inicio);
    const resultado = consultarPeriodo({ ...a, ocupados, dia, periodo, duracaoMin: servico.duracaoMin });
    return { tipo: "indisponivel", servico, dia, periodo, resultado };
  }
  const fim = inicio + servico.duracaoMin * MIN;
  if (a.saida.acao === "remarcar" && agendamento) return { tipo: "remarcar", servico, inicio, fim, agendamento };
  return { tipo: "marcar", servico, inicio, fim };
}

// ————————————————————————————————————————————————————————————————
// Respostas escritas pelo CÓDIGO
// ————————————————————————————————————————————————————————————————

/** A oferta (no máximo 3) ou o "não tenho", para um dia e período. */
export function textoDaConsulta(a: {
  dia: string;
  periodo: PeriodoDaAgenda;
  resultado: ResultadoDaConsulta;
  agora: number;
  antecedenciaMin: number;
  /** O horário pedido não estava livre. */
  indisponivel?: boolean;
}): string {
  const quando = `${diaFaladoDoIso(a.dia, diaIsoSP(a.agora))}, ${nomeDoPeriodo(a.periodo)}`;
  const abre = a.indisponivel ? "Esse horário não está livre. " : "";
  if (a.resultado.tipo === "ofertas") {
    const hs = a.resultado.inicios.map((t) => horaTexto(minutosNoDia(t)));
    const p = `${quando.charAt(0).toUpperCase()}${quando.slice(1)}`;
    return `${abre}${p}, tenho ${listaFalada(hs)}. Qual fica melhor?`;
  }
  if (a.resultado.tipo === "antecedencia") {
    return `${abre}Para ${quando} os horários livres estão muito em cima. Vou confirmar com a equipe e já te retorno.`;
  }
  if (a.resultado.tipo === "fechado") {
    const dia = diaFaladoDoIso(a.dia, diaIsoSP(a.agora));
    const d = `${dia.charAt(0).toUpperCase()}${dia.slice(1)}`;
    return a.resultado.feriado
      ? `${abre}${d} é feriado (${a.resultado.feriado}) e não temos horário. Prefere outro dia?`
      : `${abre}${d} não temos horário. Prefere outro dia?`;
  }
  if (a.resultado.tipo === "semPeriodo") {
    const dia = diaFaladoDoIso(a.dia, diaIsoSP(a.agora));
    const nomes = a.resultado.periodos.map(nomeDoPeriodo);
    return `${abre}${dia.charAt(0).toUpperCase()}${dia.slice(1)} só temos horário ${listaFalada(nomes)}. Pode ser?`;
  }
  return `${abre}Para ${quando} não tenho horário livre. Prefere outro período ou outro dia?`;
}

/** Quando o modelo quis marcar sem o que precisa: pede o dia e o período. */
export const TEXTO_PEDE_DIA_E_PERIODO = "Pra eu ver os horários livres, qual dia e período ficam melhores pra você: manhã, tarde ou noite?";

/** Escalada por antecedência: a mensagem ao contato e o resumo para o time. */
export function textosDaEscalada(a: { servico: string; inicio: number; agora: number; antecedenciaMin: number }): {
  mensagem: string;
  resumo: string;
} {
  return {
    mensagem: "Esse horário é bem em cima. Vou confirmar com a equipe se dá para encaixar e já te retorno.",
    resumo: `Quer ${a.servico} ${quandoFalado(a.inicio, a.agora)}, com menos de ${textoDeDuracao(a.antecedenciaMin)} de antecedência. O horário está livre na agenda; confirmar se dá para encaixar.`,
  };
}

/** `preferencia_horario` gravado e lido pelo "Notifica grupo" do n8n. */
export function preferenciaDoHorario(servico: string, inicio: number, agora: number): string {
  return `${quandoFalado(inicio, agora)} (${servico}, na agenda)`;
}

/**
 * O lembrete automático: texto FIXO, sem IA (versão 1, escolhida pelo dono em
 * 28/10/2026: pede o SIM e oferece remarcar). Com o nome do contato, só o
 * primeiro nome; sem nome, "Oi!".
 */
export function textoDoLembrete(a: { nome?: string | null; empresa: string; servico: string; inicio: number; agora: number }): string {
  const primeiro = (a.nome ?? "").trim().split(/\s+/)[0];
  const oi = primeiro ? `Oi, ${primeiro}!` : "Oi!";
  return `${oi} Seu horário de ${a.servico} na ${a.empresa} está reservado para você ${quandoFalado(a.inicio, a.agora)}. Pode confirmar respondendo SIM? Se precisar mudar, é só me dizer um novo dia que eu remarco por aqui.`;
}

/** O aviso ao time de um cancelamento feito pela IA. */
export function textoDoAvisoDaAgenda(a: { nome: string; servico: string; antes: number; agora: number }): string {
  return `Agenda: ${a.nome || "Um contato"} cancelou ${a.servico} de ${quandoFalado(a.antes, a.agora)}. O horário ficou livre.`;
}

/** A segunda-feira da semana de um dia (a grade da agenda começa na segunda). */
export function segundaDaSemana(dia: string): string {
  const ordem: DayKey[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  return somarDias(dia, -ordem.indexOf(chaveDoDia(dia)));
}
