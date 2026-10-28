// Dados FALSOS do protótipo da Agenda (docs/plano-agenda.md). Nada aqui fala
// com o Google nem com o banco. A conta de horário livre mora aqui, e não em
// `lib/`, de propósito: as regras (antecedência, intervalo, até quando) ainda
// são decisões do dono (D5 a D7). Quando forem decididas, a conta vira
// `lib/agenda.ts`, pura e testada, e este arquivo passa a importar de lá.

import { DAY_LABEL, type BusinessHours, type DayKey } from "@/lib/agent-prompt";
import { diaIsoSP, diaMes, inicioDoDiaSP, somarDias } from "@/lib/fuso";
import { horaTexto, minutosAgoraSP } from "@/lib/horarios";

export const EMPRESA = "Ótica Vision";
export const CONTA_GOOGLE = "agenda@oticavision.com.br";
export const NOME_DA_AGENDA = `${EMPRESA}: agendamentos`;

const MIN = 60_000;
const CHAVE_POR_DIA: DayKey[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

/** O expediente cadastrado em "O que ele sabe" (o mesmo do mock de /design/agente). */
export const EXPEDIENTE: BusinessHours = {
  seg: { open: true, from: "09:00", to: "18:00" },
  ter: { open: true, from: "09:00", to: "18:00" },
  qua: { open: true, from: "09:00", to: "18:00" },
  qui: { open: true, from: "09:00", to: "18:00" },
  sex: { open: true, from: "09:00", to: "18:00" },
  sab: { open: true, from: "09:00", to: "13:00" },
  dom: { open: false, from: "09:00", to: "13:00" },
};

export interface Servico {
  chave: string;
  nome: string;
  minutos: number;
}

export interface Regras {
  servicos: Servico[];
  /** Antecedência mínima, em minutos (D5). */
  antecedencia: number;
  /** Até quantos dias à frente (D6). */
  diasAFrente: number;
  /** Intervalo entre um horário e outro, em minutos (D7). */
  intervalo: number;
  /** Quem confirma (D3). */
  confirmacao: "ia" | "time";
}

export const REGRAS_INICIAIS: Regras = {
  servicos: [
    { chave: "exame", nome: "Exame de vista", minutos: 30 },
    { chave: "ajuste", nome: "Ajuste de armação", minutos: 15 },
    { chave: "entrega", nome: "Retirada de óculos", minutos: 15 },
  ],
  antecedencia: 120,
  diasAFrente: 14,
  intervalo: 0,
  confirmacao: "ia",
};

export const OPCOES_DURACAO = [15, 30, 45, 60, 90, 120];
export const OPCOES_ANTECEDENCIA = [
  { valor: 0, rotulo: "Sem mínimo" },
  { valor: 60, rotulo: "1 hora" },
  { valor: 120, rotulo: "2 horas" },
  { valor: 240, rotulo: "4 horas" },
  { valor: 1440, rotulo: "1 dia" },
];
export const OPCOES_DIAS = [7, 14, 30, 60];
export const OPCOES_INTERVALO = [0, 10, 15, 30];

export function rotuloDuracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** "09:30": hora e minuto, sempre com dois dígitos. */
export function hhmm(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

function chaveDoDia(dia: string): DayKey {
  const [a, m, d] = dia.split("-").map(Number);
  return CHAVE_POR_DIA[new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()];
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Hoje, quarta 28/10", "Amanhã, quinta 29/10", "Sexta 30/10". */
export function rotuloDoDia(dia: string, hoje: string): string {
  const nome = `${DAY_LABEL[chaveDoDia(dia)]} ${diaMes(dia)}`;
  if (dia === hoje) return `Hoje, ${nome}`;
  if (dia === somarDias(hoje, 1)) return `Amanhã, ${nome}`;
  return capitalizar(nome);
}

/** Minutos desde a meia-noite de São Paulo de um instante (SP é UTC-3 o ano todo). */
function minutosNoDia(ms: number): number {
  return minutosAgoraSP(new Date(ms));
}

function minutosDe(hhmmTexto: string): number {
  const [h, m] = hhmmTexto.split(":").map(Number);
  return h * 60 + m;
}

// ————————————————————————————————————————————————————————————————
// Ocupado na Google Agenda do dono (o que o freeBusy devolveria)
// ————————————————————————————————————————————————————————————————

export interface Bloco {
  inicio: number;
  fim: number;
}

/**
 * Blocos ocupados dos próximos dias, relativos a hoje: compromissos pessoais do
 * dono (que o CRM só vê como "ocupado") e os horários já marcados.
 */
export function ocupados(agora: number): Bloco[] {
  const hoje = diaIsoSP(agora);
  const em = (d: number, de: string, ate: string): Bloco => {
    const base = inicioDoDiaSP(somarDias(hoje, d));
    return { inicio: base + minutosDe(de) * MIN, fim: base + minutosDe(ate) * MIN };
  };
  return [
    em(0, "12:00", "13:30"),
    em(0, "15:00", "16:00"),
    em(1, "09:00", "10:30"),
    em(1, "12:00", "13:00"),
    em(1, "14:00", "14:30"),
    em(1, "16:30", "18:00"),
    em(2, "09:30", "10:00"),
    em(2, "12:00", "13:00"),
    em(3, "09:00", "11:00"),
  ];
}

export interface DiaLivre {
  dia: string;
  horarios: number[]; // minutos desde a meia-noite
}

/**
 * Horários livres: dentro do expediente, na grade de 30 em 30 minutos, depois da
 * antecedência mínima, antes do limite de dias, sem encostar num bloco ocupado
 * (com o intervalo antes e depois). Só o protótipo usa; ver o aviso do topo.
 */
export function horariosLivres(
  agora: number,
  regras: Regras,
  duracao: number,
  maxDias = 4
): DiaLivre[] {
  const hoje = diaIsoSP(agora);
  const blocos = ocupados(agora);
  const cedo = agora + regras.antecedencia * MIN;
  const dias: DiaLivre[] = [];
  for (let i = 0; i < regras.diasAFrente && dias.length < maxDias; i++) {
    const dia = somarDias(hoje, i);
    const h = EXPEDIENTE[chaveDoDia(dia)];
    if (!h.open) continue;
    const base = inicioDoDiaSP(dia);
    const horarios: number[] = [];
    for (let m = minutosDe(h.from); m + duracao <= minutosDe(h.to); m += 30) {
      const ini = base + m * MIN;
      const fim = ini + duracao * MIN;
      if (ini < cedo) continue;
      const bate = blocos.some(
        (b) => ini < b.fim + regras.intervalo * MIN && fim + regras.intervalo * MIN > b.inicio
      );
      if (!bate) horarios.push(m);
    }
    if (horarios.length > 0) dias.push({ dia, horarios });
  }
  return dias;
}

/**
 * Até três horários espalhados (manhã, começo e fim da tarde), que é o que a IA
 * ofereceria de uma vez (D8, recomendação A).
 */
export function tresEspalhados(horarios: number[]): number[] {
  if (horarios.length <= 3) return horarios;
  const meio = horarios[Math.floor(horarios.length / 2)];
  return [horarios[0], meio, horarios[horarios.length - 1]];
}

/** A frase que a IA mandaria com os horários do primeiro dia livre. */
export function fraseDaIA(dias: DiaLivre[], hoje: string): string {
  const d = dias[0];
  if (!d) return "Não tenho horário livre nos próximos dias. Vou pedir para alguém do time te chamar.";
  const hs = tresEspalhados(d.horarios).map((m) => horaTexto(m));
  const lista = hs.length > 1 ? `${hs.slice(0, -1).join(", ")} ou ${hs[hs.length - 1]}` : hs[0];
  return `Tenho ${diaFalado(d.dia, hoje)}, às ${lista}. Qual fica melhor pra você?`;
}

/** "amanhã, quinta, 29/10" ou "sexta, 30/10": o dia como a IA diz na conversa. */
function diaFalado(dia: string, hoje: string): string {
  const nome = `${DAY_LABEL[chaveDoDia(dia)]}, ${diaMes(dia)}`;
  if (dia === hoje) return `hoje, ${nome}`;
  if (dia === somarDias(hoje, 1)) return `amanhã, ${nome}`;
  return nome;
}

// ————————————————————————————————————————————————————————————————
// Horários marcados (a tabela `appointments` proposta)
// ————————————————————————————————————————————————————————————————

export type Situacao = "confirmado" | "cancelado" | "removido_google";

export interface Marcado {
  id: number;
  nome: string;
  telefone: string;
  servico: string;
  inicio: number;
  fim: number;
  situacao: Situacao;
  marcadoPor: "ia" | "time";
  /** Quem cancelou, quando cancelado. */
  canceladoPor?: "cliente" | "time";
  lembreteEnviado?: boolean;
}

export function marcados(agora: number): Marcado[] {
  const hoje = diaIsoSP(agora);
  let id = 1;
  const em = (
    d: number,
    hora: string,
    minutos: number,
    resto: Omit<Marcado, "id" | "inicio" | "fim">
  ): Marcado => {
    const inicio = inicioDoDiaSP(somarDias(hoje, d)) + minutosDe(hora) * MIN;
    return { id: id++, inicio, fim: inicio + minutos * MIN, ...resto };
  };
  const ia = { situacao: "confirmado" as const, marcadoPor: "ia" as const };
  return [
    em(0, "09:30", 30, { nome: "Ana Paula", telefone: "5511912345678", servico: "Exame de vista", ...ia }),
    em(0, "11:00", 15, { nome: "Carlos Mendes", telefone: "5511944443333", servico: "Retirada de óculos", ...ia }),
    em(0, "16:30", 30, { nome: "Beatriz Lima", telefone: "5511933332222", servico: "Exame de vista", situacao: "confirmado", marcadoPor: "time" }),
    em(0, "17:30", 15, { nome: "Rafael Souza", telefone: "5511922221111", servico: "Ajuste de armação", situacao: "cancelado", marcadoPor: "ia", canceladoPor: "cliente" }),
    em(1, "10:30", 30, { nome: "Juliana Prado", telefone: "5511988887777", servico: "Exame de vista", ...ia, lembreteEnviado: true }),
    em(1, "15:00", 15, { nome: "Marcos Vieira", telefone: "5511977776666", servico: "Ajuste de armação", situacao: "removido_google", marcadoPor: "ia" }),
    em(2, "11:00", 30, { nome: "Fernanda Costa", telefone: "5511966665555", servico: "Exame de vista", ...ia }),
    em(2, "14:30", 15, { nome: "+55 11 95555-4444", telefone: "5511955554444", servico: "Retirada de óculos", ...ia }),
    em(4, "09:00", 30, { nome: "Paulo Henrique", telefone: "5511911110000", servico: "Exame de vista", ...ia }),
  ];
}

/** "09:30 às 10:00", no fuso de São Paulo. */
export function faixa(m: Marcado): string {
  return `${hhmm(minutosNoDia(m.inicio))} às ${hhmm(minutosNoDia(m.fim))}`;
}

/** O texto pronto do lembrete (D9, recomendação A: um clique do time). */
export function textoDoLembrete(m: Marcado, hoje: string): string {
  const quando = diaFalado(diaIsoSP(m.inicio), hoje);
  return `Oi! Passando para lembrar do seu horário na ${EMPRESA}: ${quando}, às ${horaTexto(minutosNoDia(m.inicio))} (${m.servico}). Se precisar remarcar, é só responder por aqui.`;
}
