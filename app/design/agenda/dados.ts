// Dados FALSOS do preview da Agenda (docs/plano-agenda.md). Nada aqui fala com
// o banco. A conta de horário livre é a de verdade (`lib/agenda.ts`, pela
// fonte em memória de `lib/agenda-fonte.ts`).

import { AGENDA_PADRAO, type AgendaConfig, type ServicoDaAgenda } from "@/lib/agenda";
import type { BloqueioAgenda, LinhaAgenda } from "@/lib/agenda-fonte";
import type { BusinessHours } from "@/lib/agent-prompt";
import { diaIsoSP, inicioDoDiaSP, somarDias } from "@/lib/fuso";

export const EMPRESA = "Ótica Vision";
const MIN = 60_000;

/** O expediente cadastrado em "O que ele sabe" (mock). */
export const EXPEDIENTE: BusinessHours = {
  seg: { open: true, from: "09:00", to: "18:00" },
  ter: { open: true, from: "09:00", to: "18:00" },
  qua: { open: true, from: "09:00", to: "18:00" },
  qui: { open: true, from: "09:00", to: "18:00" },
  sex: { open: true, from: "09:00", to: "18:00" },
  sab: { open: true, from: "09:00", to: "13:00" },
  dom: { open: false, from: "09:00", to: "13:00" },
};

export const SERVICOS: ServicoDaAgenda[] = [
  { id: 1, nome: "Exame de vista", duracaoMin: 30 },
  { id: 2, nome: "Ajuste de armação", duracaoMin: 15 },
  { id: 3, nome: "Retirada de óculos", duracaoMin: 15 },
];

export const CONFIG: AgendaConfig = { ...AGENDA_PADRAO, ativa: true };

function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function linhas(agora: number): LinhaAgenda[] {
  const hoje = diaIsoSP(agora);
  let id = 1;
  const em = (
    d: number,
    hora: string,
    servico: ServicoDaAgenda,
    resto: Partial<LinhaAgenda> & Pick<LinhaAgenda, "phone" | "nome">
  ): LinhaAgenda => {
    const inicio = inicioDoDiaSP(somarDias(hoje, d)) + minutosDe(hora) * MIN;
    return {
      id: id++, servicoId: servico.id, servicoNome: servico.nome, inicio, fim: inicio + servico.duracaoMin * MIN,
      status: "confirmado", origem: "ia", canceladoPor: null, resumo: null,
      marcadoEm: agora - 2 * 86_400_000, lembreteEnviadoEm: null, confirmadoEm: null, ...resto,
    };
  };
  const [exame, ajuste, retirada] = SERVICOS;
  return [
    em(0, "09:30", exame, { nome: "Ana Paula", phone: "5511912345678", resumo: "Primeira consulta de vista; usa óculos há 5 anos e sente a vista cansada no computador." }),
    em(0, "11:00", retirada, { nome: "Carlos Mendes", phone: "5511944443333" }),
    em(0, "16:30", exame, { nome: "Beatriz Lima", phone: "5511933332222", origem: "time" }),
    em(0, "17:30", ajuste, { nome: "Rafael Souza", phone: "5511922221111", status: "cancelado", canceladoPor: "cliente" }),
    em(1, "10:30", exame, { nome: "Juliana Prado", phone: "5511988887777", resumo: "Quer trocar as lentes por multifocais.",
      lembreteEnviadoEm: agora - 3_600_000, confirmadoEm: agora - 1_800_000 }),
    em(1, "15:00", ajuste, { nome: "Marcos Vieira", phone: "5511977776666" }),
    em(2, "11:00", exame, { nome: "Fernanda Costa", phone: "5511966665555" }),
    em(2, "14:30", retirada, { nome: null, phone: "5511955554444" }),
    em(1, "16:30", exame, { nome: "Paulo Henrique", phone: "5511911110000" }),
  ];
}

export function bloqueios(agora: number): BloqueioAgenda[] {
  const hoje = diaIsoSP(agora);
  const em = (id: number, d: number, de: string, ate: string, motivo: string | null): BloqueioAgenda => {
    const base = inicioDoDiaSP(somarDias(hoje, d));
    return { id, inicio: base + minutosDe(de) * MIN, fim: base + minutosDe(ate) * MIN, motivo };
  };
  return [em(501, 0, "12:00", "13:00", "Almoço"), em(502, 1, "12:00", "13:00", "Almoço")];
}

/** Contatos do preview, para a busca do "Marcar horário" (no app, a busca vai ao servidor). */
export const CONTATOS = [
  { phone: "5511912345678", nome: "Ana Paula" },
  { phone: "5511944443333", nome: "Carlos Mendes" },
  { phone: "5511933332222", nome: "Beatriz Lima" },
  { phone: "5511988887777", nome: "Juliana Prado" },
  { phone: "5511977776666", nome: "Marcos Vieira" },
  { phone: "5511966665555", nome: "Fernanda Costa" },
  { phone: "5511911110000", nome: "Paulo Henrique" },
  { phone: "5511955554444", nome: null },
];
