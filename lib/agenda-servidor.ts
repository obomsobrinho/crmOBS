import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import type { BusinessHours } from "@/lib/agent-prompt";
import {
  normalizarConfigDaAgenda,
  type AgendaConfig,
  type AgendamentoDaPessoa,
  type Intervalo,
  type ServicoDaAgenda,
} from "@/lib/agenda";

// Leituras e escritas da AGENDA PRÓPRIA no servidor (service_role). A regra
// (horário livre, decisão do turno) é de `lib/agenda.ts`; aqui só banco.
//
// ⚠️ ENQUANTO A MIGRATION NÃO FOR APLICADA as tabelas não existem: toda leitura
// devolve `null` (agenda desligada) e o atendimento segue como hoje. Nunca
// lança para quem chama.

type Svc = ReturnType<typeof createServiceClient>;

const MIN = 60_000;

/** O objetivo "Agendar" está ligado? Guiado: `goals`; avançado: sempre (como `buildBaseTail`). */
export function querAgendar(promptMode: string | null | undefined, agentConfig: unknown): boolean {
  if (promptMode === "avancado") return true;
  const goals = (agentConfig as { goals?: unknown } | null)?.goals;
  return Array.isArray(goals) && goals.includes("agendar");
}

export interface AgendaDoTenant {
  config: AgendaConfig;
  servicos: ServicoDaAgenda[];
}

/** Config e serviços ativos, ou null quando não há agenda (ou a tabela não existe). */
export async function agendaDoTenant(svc: Svc, clientId: string): Promise<AgendaDoTenant | null> {
  try {
    const [{ data: c, error: cErr }, { data: s, error: sErr }] = await Promise.all([
      svc.from("clients").select("agenda_config").eq("id", clientId).maybeSingle(),
      svc
        .from("agenda_servicos")
        .select("id, nome, duracao_min")
        .eq("client_id", clientId)
        .eq("ativo", true)
        .order("ordem")
        .order("id")
        .limit(50),
    ]);
    if (cErr || sErr) return null;
    return {
      config: normalizarConfigDaAgenda(c?.agenda_config ?? null),
      servicos: (s ?? []).map((x) => ({ id: x.id, nome: x.nome, duracaoMin: x.duracao_min })),
    };
  } catch {
    return null;
  }
}

/**
 * O que ocupa a agenda entre `de` e `ate`: agendamentos confirmados e
 * bloqueios. Limitado ao horizonte da agenda (no máximo 60 dias), então o
 * volume é o de uma agenda de uma pessoa, nunca a tabela inteira.
 */
export async function ocupadosDoTenant(
  svc: Svc,
  clientId: string,
  de: number,
  ate: number,
  ignorar?: number
): Promise<Intervalo[] | null> {
  try {
    const deIso = new Date(de).toISOString();
    const ateIso = new Date(ate).toISOString();
    let q = svc
      .from("agendamentos")
      .select("id, inicio, fim")
      .eq("client_id", clientId)
      .eq("status", "confirmado")
      .lt("inicio", ateIso)
      .gt("fim", deIso)
      // eslint-disable-next-line no-restricted-syntax -- horizonte de no maximo 60 dias de uma agenda de uma pessoa: a conta de horario livre precisa de todos os ocupados, nao e lista
      .limit(2000);
    if (ignorar) q = q.neq("id", ignorar);
    const [{ data: ags, error: aErr }, { data: bls, error: bErr }] = await Promise.all([
      q,
      svc
        .from("agenda_bloqueios")
        .select("inicio, fim")
        .eq("client_id", clientId)
        .lt("inicio", ateIso)
        .gt("fim", deIso)
        // eslint-disable-next-line no-restricted-syntax -- mesmo horizonte; bloqueios sao poucos
        .limit(500),
    ]);
    if (aErr || bErr) return null;
    return [...(ags ?? []), ...(bls ?? [])].map((x) => ({
      inicio: Date.parse(x.inicio),
      fim: Date.parse(x.fim),
    }));
  } catch {
    return null;
  }
}

/** Os agendamentos futuros de UM contato (no máximo 5), com o código do turno. */
export async function agendamentosDaPessoa(
  svc: Svc,
  clientId: string,
  phone: string,
  agora: number
): Promise<AgendamentoDaPessoa[]> {
  try {
    const { data } = await svc
      .from("agendamentos")
      .select("id, servico_id, servico_nome, inicio, fim")
      .eq("client_id", clientId)
      .eq("phone", phone)
      .eq("status", "confirmado")
      .gt("inicio", new Date(agora).toISOString())
      .order("inicio")
      .limit(5);
    return (data ?? []).map((g, i) => ({
      codigo: `A${i + 1}`,
      id: g.id,
      servicoId: g.servico_id,
      servicoNome: g.servico_nome,
      inicio: Date.parse(g.inicio),
      fim: Date.parse(g.fim),
    }));
  } catch {
    return [];
  }
}

/** Tudo que o turno precisa, ou null quando a agenda não vale para esta conversa. */
export async function agendaDoTurno(a: {
  svc: Svc;
  clientId: string;
  phone: string;
  agora: number;
  hours: BusinessHours | null;
  promptMode: string | null;
  agentConfig: unknown;
}): Promise<{
  config: AgendaConfig;
  servicos: ServicoDaAgenda[];
  ocupados: Intervalo[];
  daPessoa: AgendamentoDaPessoa[];
  hours: BusinessHours;
} | null> {
  if (!a.hours || !querAgendar(a.promptMode, a.agentConfig)) return null;
  const ag = await agendaDoTenant(a.svc, a.clientId);
  if (!ag || !ag.config.ativa || ag.servicos.length === 0) return null;
  const [ocupados, daPessoa] = await Promise.all([
    ocupadosDoTenant(a.svc, a.clientId, a.agora, a.agora + (ag.config.diasAFrente + 1) * 1440 * MIN),
    agendamentosDaPessoa(a.svc, a.clientId, a.phone, a.agora),
  ]);
  if (!ocupados) return null;
  return { ...ag, ocupados, daPessoa, hours: a.hours };
}

export type ResultadoDaMarcacao =
  | { ok: true; id: number }
  | { ok: false; motivo: "conflito" | "erro" };

/** Marca. O banco recusa sobreposição (23P01, `agendamentos_sem_sobreposicao`). */
export async function marcarAgendamento(
  svc: Svc,
  a: {
    clientId: string;
    phone: string;
    nome: string | null;
    servicoId: number | null;
    servicoNome: string;
    inicio: number;
    fim: number;
    origem: "ia" | "time";
    criadoPor?: string | null;
    remarcadoDe?: number | null;
  }
): Promise<ResultadoDaMarcacao> {
  const { data, error } = await svc
    .from("agendamentos")
    .insert({
      client_id: a.clientId,
      phone: a.phone,
      nome: a.nome,
      servico_id: a.servicoId,
      servico_nome: a.servicoNome,
      inicio: new Date(a.inicio).toISOString(),
      fim: new Date(a.fim).toISOString(),
      origem: a.origem,
      criado_por: a.criadoPor ?? null,
      remarcado_de: a.remarcadoDe ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, motivo: error.code === "23P01" ? "conflito" : "erro" };
  return data ? { ok: true, id: data.id } : { ok: false, motivo: "erro" };
}

/** Cancela um confirmado do tenant. Devolve se cancelou (já cancelado = false). */
export async function cancelarAgendamento(
  svc: Svc,
  clientId: string,
  id: number,
  por: "cliente" | "time"
): Promise<boolean> {
  const { data, error } = await svc
    .from("agendamentos")
    .update({ status: "cancelado", cancelado_em: new Date().toISOString(), cancelado_por: por })
    .eq("id", id)
    .eq("client_id", clientId)
    .eq("status", "confirmado")
    .select("id");
  return !error && (data ?? []).length > 0;
}

/**
 * Remarca: cancela o antigo e marca o novo. O antigo sai PRIMEIRO para o novo
 * horário poder encostar nele (mesmo contato mudando 30 min); se o novo falhar,
 * o antigo volta.
 */
export async function remarcarAgendamento(
  svc: Svc,
  a: {
    clientId: string;
    id: number;
    inicio: number;
    fim: number;
    servicoId: number | null;
    servicoNome: string;
    origem: "ia" | "time";
    criadoPor?: string | null;
    por: "cliente" | "time";
  }
): Promise<ResultadoDaMarcacao> {
  const { data: antigo } = await svc
    .from("agendamentos")
    .select("phone, nome")
    .eq("id", a.id)
    .eq("client_id", a.clientId)
    .eq("status", "confirmado")
    .maybeSingle();
  if (!antigo) return { ok: false, motivo: "erro" };
  if (!(await cancelarAgendamento(svc, a.clientId, a.id, a.por))) return { ok: false, motivo: "erro" };
  const novo = await marcarAgendamento(svc, {
    clientId: a.clientId,
    phone: antigo.phone,
    nome: antigo.nome,
    servicoId: a.servicoId,
    servicoNome: a.servicoNome,
    inicio: a.inicio,
    fim: a.fim,
    origem: a.origem,
    criadoPor: a.criadoPor,
    remarcadoDe: a.id,
  });
  if (!novo.ok) {
    await svc
      .from("agendamentos")
      .update({ status: "confirmado", cancelado_em: null, cancelado_por: null })
      .eq("id", a.id)
      .eq("client_id", a.clientId);
  }
  return novo;
}
