// AGENDA PRÓPRIA (28/10/2026, docs/plano-agenda.md). MÓDULO PURO: sem I/O, sem
// supabase, sem process.env. É a ÚNICA regra de horário livre do produto: o
// cérebro (`processTurn`), as rotas da agenda, a tela `/agenda` e o preview de
// `/design/agenda` importam daqui. O princípio é o de `lib/horarios.ts`: o
// modelo conversa, o código faz a conta (bateria de 05/10/2026).
//
// ⚠️ OS PADRÕES ABAIXO (`AGENDA_PADRAO`) SÃO ESCOLHAS DA MADRUGADA DE 28/10, NÃO
// DECISÕES DO DONO. Estão todos aqui para mudar num lugar só (plano, seção 6).

import { DAY_LABEL, type BusinessHours, type DayKey } from "./agent-prompt";
import { diaIsoSP, diaMes, inicioDoDiaSP, somarDias } from "./fuso";
import { horaTexto, minutosAgoraSP } from "./horarios";

const MIN = 60_000;
const CHAVE_POR_DIA: DayKey[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

// ————————————————————————————————————————————————————————————————
// Configuração e padrões (decisões D2 a D15 do plano, ainda em aberto)
// ————————————————————————————————————————————————————————————————

export interface AgendaConfig {
  /** A IA marca de verdade (com o objetivo "Agendar" marcado). */
  ativa: boolean;
  /** D3: antecedência mínima, em minutos. */
  antecedenciaMin: number;
  /** D4: até quantos dias à frente, contando hoje. */
  diasAFrente: number;
  /** D5: intervalo livre antes e depois de cada horário ocupado, em minutos. */
  intervaloMin: number;
  /** D6: a grade dos horários (de quanto em quanto tempo começa um). */
  passoMin: number;
}

/** Padrões escolhidos sem o dono (ver o aviso do topo). */
export const AGENDA_PADRAO: AgendaConfig = {
  ativa: false,
  antecedenciaMin: 120,
  diasAFrente: 14,
  intervaloMin: 0,
  passoMin: 30,
};

/** D7: quantos horários a IA oferece de uma vez (vai no texto do bloco). */
export const OFERTAS_DE_UMA_VEZ = 3;
/** Teto do bloco do prompt: dias com horário, horários por dia e serviços. */
export const DIAS_NO_PROMPT = 3;
export const HORARIOS_POR_DIA_NO_PROMPT = 6;
export const SERVICOS_NO_PROMPT = 6;
/** Duração aceita para um serviço, em minutos. Igual ao check da migration. */
export const DURACAO_MIN = 5;
export const DURACAO_MAX = 480;

export const OPCOES_DA_AGENDA = {
  antecedenciaMin: [0, 60, 120, 240, 1440],
  diasAFrente: [7, 14, 30, 60],
  intervaloMin: [0, 10, 15, 30],
  passoMin: [15, 30, 60],
  duracaoMin: [15, 30, 45, 60, 90, 120],
} as const;

function daLista(v: unknown, lista: readonly number[], padrao: number): number {
  return typeof v === "number" && lista.includes(v) ? v : padrao;
}

/** `clients.agenda_config` como chega do banco (null = nunca configurada). */
export function normalizarConfigDaAgenda(raw: unknown): AgendaConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    ativa: o.ativa === true,
    antecedenciaMin: daLista(o.antecedenciaMin, OPCOES_DA_AGENDA.antecedenciaMin, AGENDA_PADRAO.antecedenciaMin),
    diasAFrente: daLista(o.diasAFrente, OPCOES_DA_AGENDA.diasAFrente, AGENDA_PADRAO.diasAFrente),
    intervaloMin: daLista(o.intervaloMin, OPCOES_DA_AGENDA.intervaloMin, AGENDA_PADRAO.intervaloMin),
    passoMin: daLista(o.passoMin, OPCOES_DA_AGENDA.passoMin, AGENDA_PADRAO.passoMin),
  };
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

/** Um horário oferecido NESTE turno, com o código que o modelo devolve. */
export interface Oferta {
  codigo: string;
  servicoId: number;
  servicoNome: string;
  inicio: number;
  fim: number;
}

/** Um agendamento futuro da pessoa da conversa, com o código do turno. */
export interface AgendamentoDaPessoa {
  codigo: string;
  id: number;
  servicoId: number | null;
  servicoNome: string;
  inicio: number;
  fim: number;
}

export interface DiaLivre {
  dia: string; // AAAA-MM-DD em São Paulo
  inicios: number[]; // ms
}

// ————————————————————————————————————————————————————————————————
// Conta de horário livre
// ————————————————————————————————————————————————————————————————

function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
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

/** O trecho bate em algum ocupado, contando o intervalo antes e depois? */
export function conflita(
  inicio: number,
  fim: number,
  ocupados: Intervalo[],
  intervaloMin = 0
): boolean {
  const folga = intervaloMin * MIN;
  return ocupados.some((o) => inicio < o.fim + folga && fim + folga > o.inicio);
}

/**
 * Horários livres para um serviço de `duracaoMin`: dentro do expediente, na
 * grade de `passoMin` a partir da abertura, depois da antecedência, antes do
 * limite de dias e sem bater em nada ocupado. `deDia` restringe a um dia só
 * (a tela de marcar pelo time).
 */
export function horariosLivres(a: {
  agora: number;
  hours: BusinessHours;
  ocupados: Intervalo[];
  config: AgendaConfig;
  duracaoMin: number;
  maxDias?: number;
  deDia?: string;
  /** O time pode marcar sem a antecedência mínima (padrão: respeita). */
  semAntecedencia?: boolean;
}): DiaLivre[] {
  const hoje = diaIsoSP(a.agora);
  const cedo = a.agora + (a.semAntecedencia ? 0 : a.config.antecedenciaMin) * MIN;
  const passo = a.config.passoMin * MIN;
  const dur = a.duracaoMin * MIN;
  const dias: DiaLivre[] = [];
  const total = a.deDia ? 1 : a.config.diasAFrente;
  for (let i = 0; i < total && dias.length < (a.maxDias ?? Infinity); i++) {
    const dia = a.deDia ?? somarDias(hoje, i);
    if (dia < hoje) continue;
    const exp = expedienteDoDia(dia, a.hours);
    if (!exp) continue;
    const inicios: number[] = [];
    for (let t = exp.inicio; t + dur <= exp.fim; t += passo) {
      if (t < cedo) continue;
      if (conflita(t, t + dur, a.ocupados, a.config.intervaloMin)) continue;
      inicios.push(t);
    }
    if (inicios.length > 0) dias.push({ dia, inicios });
  }
  return dias;
}

/** Até `n` itens espalhados pela lista (primeiro, último e o meio). */
export function espalhados<T>(lista: T[], n: number): T[] {
  if (lista.length <= n) return lista;
  if (n <= 1) return lista.slice(0, 1);
  const out: T[] = [];
  for (let k = 0; k < n; k++) out.push(lista[Math.round((k * (lista.length - 1)) / (n - 1))]);
  return out;
}

/** As ofertas do turno: por serviço, os primeiros dias com horário, com código. */
export function montarOfertas(a: {
  agora: number;
  hours: BusinessHours;
  ocupados: Intervalo[];
  config: AgendaConfig;
  servicos: ServicoDaAgenda[];
}): Oferta[] {
  const ofertas: Oferta[] = [];
  for (const s of a.servicos.slice(0, SERVICOS_NO_PROMPT)) {
    const dias = horariosLivres({ ...a, duracaoMin: s.duracaoMin, maxDias: DIAS_NO_PROMPT });
    for (const d of dias) {
      for (const inicio of espalhados(d.inicios, HORARIOS_POR_DIA_NO_PROMPT)) {
        ofertas.push({
          codigo: `S${ofertas.length + 1}`,
          servicoId: s.id,
          servicoNome: s.nome,
          inicio,
          fim: inicio + s.duracaoMin * MIN,
        });
      }
    }
  }
  return ofertas;
}

// ————————————————————————————————————————————————————————————————
// Texto: dias e horas como a conversa e a tela dizem
// ————————————————————————————————————————————————————————————————

function minutosNoDia(ms: number): number {
  return minutosAgoraSP(new Date(ms));
}

/** "09:30": hora e minuto com dois dígitos, no fuso de São Paulo. */
export function hhmm(ms: number): string {
  const m = minutosNoDia(ms);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "09:30 às 10:00". */
export function faixaHoraria(inicio: number, fim: number): string {
  return `${hhmm(inicio)} às ${hhmm(fim)}`;
}

/** "amanhã, quinta, 29/10" ou "sexta, 30/10": como a IA diz o dia. */
export function diaFalado(ms: number, agora: number): string {
  const dia = diaIsoSP(ms);
  const hoje = diaIsoSP(agora);
  const nome = `${DAY_LABEL[chaveDoDia(dia)]}, ${diaMes(dia)}`;
  if (dia === hoje) return `hoje, ${nome}`;
  if (dia === somarDias(hoje, 1)) return `amanhã, ${nome}`;
  return nome;
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

// ————————————————————————————————————————————————————————————————
// Bloco do prompt
// ————————————————————————————————————————————————————————————————

/**
 * `### HORÁRIOS LIVRES` e `### AGENDAMENTOS DESTA PESSOA`. Vai DEPOIS do AGORA
 * e do CALENDÁRIO (`runAgent`): muda a cada minuto e não pode mexer no prefixo
 * que o cache de prompt reaproveita. Só existe com a agenda ligada.
 */
export function blocoDaAgenda(a: {
  agora: number;
  ofertas: Oferta[];
  daPessoa: AgendamentoDaPessoa[];
  servicos: ServicoDaAgenda[];
}): string {
  const linhas: string[] = ["### HORÁRIOS LIVRES"];
  linhas.push(
    "A agenda da empresa, calculada pelo sistema agora. É a única fonte de horário: ofereça só horários desta lista, no máximo " +
      `${OFERTAS_DE_UMA_VEZ} de cada vez, sempre com o dia. Nunca invente nem aceite horário fora dela; se a pessoa pedir outro, ofereça os mais próximos da lista.`
  );
  if (a.servicos.length > 1) {
    linhas.push("Há mais de um serviço: se ainda não está claro qual a pessoa quer, pergunte antes de oferecer horário.");
  }
  linhas.push(
    'Para marcar: quando a pessoa escolher um horário da lista, confirme dizendo o dia e a hora, use action agendar, agenda.acao "marcar" e agenda.horario com o código entre colchetes (ex.: "S2"). Sem escolha clara, action none e agenda vazia.'
  );
  if (a.ofertas.length === 0) {
    linhas.push("- Nenhum horário livre nos próximos dias. Diga que vai ver com o time e use action pausar.");
  } else {
    const grupos = new Map<string, string[]>();
    for (const o of a.ofertas) {
      const chave = `${o.servicoNome}|${diaIsoSP(o.inicio)}`;
      grupos.set(chave, [...(grupos.get(chave) ?? []), `${horaTexto(minutosNoDia(o.inicio))} [${o.codigo}]`]);
    }
    for (const [chave, hs] of grupos) {
      const [nome] = chave.split("|");
      const primeiro = a.ofertas.find((o) => `${o.servicoNome}|${diaIsoSP(o.inicio)}` === chave)!;
      const serv = a.servicos.find((s) => s.id === primeiro.servicoId);
      const dur = serv ? ` (${serv.duracaoMin} min)` : "";
      linhas.push(`- ${nome}${dur}, ${diaFalado(primeiro.inicio, a.agora)}: ${hs.join(", ")}`);
    }
  }
  if (a.daPessoa.length > 0) {
    linhas.push("", "### AGENDAMENTOS DESTA PESSOA");
    for (const g of a.daPessoa) {
      linhas.push(`- [${g.codigo}] ${g.servicoNome}, ${quandoFalado(g.inicio, a.agora)}`);
    }
    linhas.push(
      'Remarcar: ofereça horários da lista; com a escolha, action agendar, agenda.acao "remarcar", agenda.horario com o novo código e agenda.agendamento com o código do agendamento (ex.: "A1").',
      'Cancelar: confirme com a pessoa uma vez; confirmado, action none, agenda.acao "cancelar" e agenda.agendamento com o código.'
    );
  }
  return linhas.join("\n");
}

// ————————————————————————————————————————————————————————————————
// Decisão do turno (o que o código faz com a saída do modelo)
// ————————————————————————————————————————————————————————————————

export type AcaoDaAgenda = "" | "marcar" | "remarcar" | "cancelar";

/** O campo `agenda` da saída do modelo (`lib/agent.ts`). */
export interface SaidaDaAgenda {
  acao: AcaoDaAgenda;
  horario: string;
  agendamento: string;
}

export const SAIDA_DA_AGENDA_VAZIA: SaidaDaAgenda = { acao: "", horario: "", agendamento: "" };

export type DecisaoDaAgenda =
  | { tipo: "nada" }
  | { tipo: "marcar"; oferta: Oferta }
  | { tipo: "remarcar"; oferta: Oferta; agendamento: AgendamentoDaPessoa }
  | { tipo: "cancelar"; agendamento: AgendamentoDaPessoa }
  /** O modelo quis marcar sem um código válido deste turno: a resposta é trocada. */
  | { tipo: "invalido" };

/**
 * Regra pura: o modelo só marca com um código oferecido NESTE turno. Com a
 * agenda ligada, `action: agendar` sem código válido nunca vira "marcado": a
 * resposta é trocada por uma que pede a escolha na lista.
 */
export function decidirAgenda(a: {
  action: string;
  saida: SaidaDaAgenda;
  ofertas: Oferta[];
  daPessoa: AgendamentoDaPessoa[];
}): DecisaoDaAgenda {
  const oferta = a.ofertas.find((o) => o.codigo === a.saida.horario.trim().toUpperCase());
  const agendamento = a.daPessoa.find((g) => g.codigo === a.saida.agendamento.trim().toUpperCase());
  if (a.saida.acao === "cancelar") {
    return agendamento ? { tipo: "cancelar", agendamento } : { tipo: "nada" };
  }
  const querMarcar = a.action === "agendar" || a.saida.acao === "marcar" || a.saida.acao === "remarcar";
  if (!querMarcar) return { tipo: "nada" };
  if (!oferta) return { tipo: "invalido" };
  if (a.saida.acao === "remarcar" && agendamento) return { tipo: "remarcar", oferta, agendamento };
  return { tipo: "marcar", oferta };
}

/** Resposta escrita pelo CÓDIGO quando o horário escolhido não vale mais. */
export function textoSemHorario(proximas: Oferta[], agora: number): string {
  const tres = espalhados(proximas, 2).map((o) => quandoFalado(o.inicio, agora));
  return tres.length > 0
    ? `Esse horário acabou de ser preenchido. Posso ${listaFalada(tres)}?`
    : "Esse horário não está mais livre. Vou pedir para alguém do time falar com você para combinar.";
}

/** Resposta escrita pelo CÓDIGO quando o modelo quis marcar sem horário da lista. */
export function textoEscolhaNaLista(ofertas: Oferta[], agora: number): string {
  const tres = espalhados(ofertas, OFERTAS_DE_UMA_VEZ).map((o) => quandoFalado(o.inicio, agora));
  return tres.length > 0
    ? `Pra eu marcar certinho, qual destes fica melhor: ${listaFalada(tres)}?`
    : "No momento não tenho horário livre. Vou pedir para alguém do time falar com você.";
}

/** `preferencia_horario` gravado e lido pelo "Notifica grupo" do n8n. */
export function preferenciaDaOferta(o: Oferta, agora: number): string {
  return `${quandoFalado(o.inicio, agora)} (${o.servicoNome}, na agenda)`;
}

/** O lembrete pronto que o time copia (D8: manual por enquanto). */
export function textoDoLembrete(a: { empresa: string; servico: string; inicio: number; agora: number }): string {
  return `Oi! Passando para lembrar do seu horário na ${a.empresa}: ${quandoFalado(a.inicio, a.agora)} (${a.servico}). Se precisar remarcar, é só responder por aqui.`;
}

/** O aviso ao time de um cancelamento ou remarcação feito pela IA. */
export function textoDoAvisoDaAgenda(a: {
  tipo: "cancelado" | "remarcado";
  nome: string;
  servico: string;
  antes: number;
  depois?: number;
  agora: number;
}): string {
  const quem = a.nome || "Um contato";
  return a.tipo === "cancelado"
    ? `Agenda: ${quem} cancelou ${a.servico} de ${quandoFalado(a.antes, a.agora)}. O horário ficou livre.`
    : `Agenda: ${quem} remarcou ${a.servico} de ${quandoFalado(a.antes, a.agora)} para ${quandoFalado(a.depois ?? a.antes, a.agora)}.`;
}
