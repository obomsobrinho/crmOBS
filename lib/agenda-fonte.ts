import type { Supa } from "@/lib/supabase/tipos";
import {
  horariosDoTime,
  momentoDoLembrete,
  conflita,
  type AgendaConfig,
  type ServicoDaAgenda,
} from "@/lib/agenda";
import type { BusinessHours } from "@/lib/agent-prompt";
import { inicioDoDiaSP } from "@/lib/fuso";
import { fonteClientesDoBanco, paramsClientes } from "@/lib/clientes-fonte";

// A ÚNICA porta da tela `/agenda` para os dados (docs/plano-agenda.md). Duas
// implementações com a mesma interface: o banco (leitura com a sessão do
// usuário, escrita pelas rotas `/api/agenda/*`) e a memória (o preview
// `/design/agenda`, sem banco). A tela é uma GRADE SEMANAL: lê a semana inteira
// de uma vez (uma agenda de uma pessoa, limitada a 500 por semana), não pagina.

export interface LinhaAgenda {
  id: number;
  phone: string;
  nome: string | null;
  servicoId: number | null;
  servicoNome: string;
  inicio: number;
  fim: number;
  status: "confirmado" | "cancelado";
  origem: "ia" | "time";
  canceladoPor: "cliente" | "time" | null;
  /** "Do que se trata" (resumo da conversa ou nota do time). */
  resumo: string | null;
  /** Quando o lembrete automático sai, ou null. */
  lembreteEm: number | null;
}

export interface BloqueioAgenda {
  id: number;
  inicio: number;
  fim: number;
  motivo: string | null;
}

export type Resultado = { ok: true } | { ok: false; erro: string };

export interface ContatoDaBusca {
  phone: string;
  nome: string | null;
}

/** Quantos contatos a busca do "Marcar horário" mostra. */
export const LIMITE_DA_BUSCA = 8;

export interface FonteAgenda {
  /** Os confirmados que começam na janela (uma semana). */
  semana(de: number, ate: number): Promise<LinhaAgenda[]>;
  /**
   * Contatos por nome ou telefone, para o "Marcar horário". No banco é a MESMA
   * busca da tela Contatos (`clientes_pagina`: no servidor, por índice, com
   * limite), nunca a lista inteira. Busca vazia não consulta.
   */
  buscarContatos(busca: string): Promise<ContatoDaBusca[]>;
  bloqueios(de: number, ate: number): Promise<BloqueioAgenda[]>;
  /** Horários livres para o TIME marcar: sem antecedência, sem limite de dias; `fora` = fora do expediente. */
  horarios(servicoId: number, dia: string, ignorar?: number, fora?: boolean): Promise<number[]>;
  marcar(p: { phone: string; nome: string; servicoId: number; inicio: number; resumo: string }): Promise<Resultado>;
  cancelar(id: number): Promise<Resultado>;
  remarcar(id: number, inicio: number): Promise<Resultado>;
  bloquear(p: { inicio: number; fim: number; motivo: string }): Promise<Resultado>;
  desbloquear(id: number): Promise<Resultado>;
  salvarConfig(
    config: AgendaConfig,
    servicos: { id: number | null; nome: string; duracaoMin: number }[]
  ): Promise<{ ok: true; config: AgendaConfig; servicos: ServicoDaAgenda[] } | { ok: false; erro: string }>;
}

/** Teto de uma semana de agenda (uma pessoa): cabe com folga. */
export const TETO_DA_SEMANA = 500;

const COLUNAS =
  "id, phone, nome, servico_id, servico_nome, inicio, fim, status, origem, cancelado_por, resumo, lembrete_em";

type Bruta = {
  id: number;
  phone: string;
  nome: string | null;
  servico_id: number | null;
  servico_nome: string;
  inicio: string;
  fim: string;
  status: string;
  origem: string;
  cancelado_por: string | null;
  resumo: string | null;
  lembrete_em: string | null;
};

function daBruta(b: Bruta): LinhaAgenda {
  return {
    id: b.id,
    phone: b.phone,
    nome: b.nome,
    servicoId: b.servico_id,
    servicoNome: b.servico_nome,
    inicio: Date.parse(b.inicio),
    fim: Date.parse(b.fim),
    status: b.status === "cancelado" ? "cancelado" : "confirmado",
    origem: b.origem === "time" ? "time" : "ia",
    canceladoPor: b.cancelado_por === "cliente" || b.cancelado_por === "time" ? b.cancelado_por : null,
    resumo: b.resumo,
    lembreteEm: b.lembrete_em ? Date.parse(b.lembrete_em) : null,
  };
}

async function chamar(url: string, init: RequestInit): Promise<{ ok: boolean; corpo: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const corpo = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, corpo };
  } catch {
    return { ok: false, corpo: { error: "sem conexão" } };
  }
}

function resultado(r: { ok: boolean; corpo: Record<string, unknown> }): Resultado {
  return r.ok ? { ok: true } : { ok: false, erro: String(r.corpo.error ?? "não foi possível") };
}

/** Leitura pelo banco com a sessão (RLS por tenant) e escrita pelas rotas. */
export function fonteDoBancoAgenda(supabase: Supa, clientId: string, fora: string[] = []): FonteAgenda {
  const contatos = fonteClientesDoBanco(supabase, clientId);
  return {
    async buscarContatos(busca) {
      if (busca.trim().length < 2) return [];
      const lista = await contatos.pagina(paramsClientes("todos", busca, fora, Date.now()), null, LIMITE_DA_BUSCA);
      return lista.map((c) => ({ phone: c.phone, nome: c.name }));
    },
    async semana(de, ate) {
      const { data, error } = await supabase
        .from("agendamentos")
        .select(COLUNAS)
        .eq("client_id", clientId)
        .eq("status", "confirmado")
        .gte("inicio", new Date(de).toISOString())
        .lt("inicio", new Date(ate).toISOString())
        .order("inicio")
        .limit(TETO_DA_SEMANA);
      if (error) throw new Error(error.message);
      return (data ?? []).map((b) => daBruta(b as Bruta));
    },
    async bloqueios(de, ate) {
      // Uma semana de bloqueios de uma agenda: poucos por natureza.
      const { data, error } = await supabase
        .from("agenda_bloqueios")
        .select("id, inicio, fim, motivo")
        .eq("client_id", clientId)
        .lt("inicio", new Date(ate).toISOString())
        .gt("fim", new Date(de).toISOString())
        .order("inicio")
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []).map((b) => ({ id: b.id, inicio: Date.parse(b.inicio), fim: Date.parse(b.fim), motivo: b.motivo }));
    },
    async horarios(servicoId, dia, ignorar, fora) {
      const qs = new URLSearchParams({ servico: String(servicoId), dia });
      if (ignorar) qs.set("ignorar", String(ignorar));
      if (fora) qs.set("fora", "1");
      const r = await chamar(`/api/agenda/horarios?${qs}`, { method: "GET" });
      if (!r.ok) throw new Error(String(r.corpo.error ?? "falha"));
      return ((r.corpo.inicios as string[] | undefined) ?? []).map((s) => Date.parse(s));
    },
    async marcar(p) {
      return resultado(
        await chamar("/api/agenda/agendamentos", {
          method: "POST",
          body: JSON.stringify({ ...p, inicio: new Date(p.inicio).toISOString() }),
        })
      );
    },
    async cancelar(id) {
      return resultado(await chamar(`/api/agenda/agendamentos/${id}`, { method: "PATCH", body: JSON.stringify({ acao: "cancelar" }) }));
    },
    async remarcar(id, inicio) {
      return resultado(
        await chamar(`/api/agenda/agendamentos/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ acao: "remarcar", inicio: new Date(inicio).toISOString() }),
        })
      );
    },
    async bloquear(p) {
      return resultado(
        await chamar("/api/agenda/bloqueios", {
          method: "POST",
          body: JSON.stringify({ inicio: new Date(p.inicio).toISOString(), fim: new Date(p.fim).toISOString(), motivo: p.motivo }),
        })
      );
    },
    async desbloquear(id) {
      return resultado(await chamar(`/api/agenda/bloqueios?id=${id}`, { method: "DELETE" }));
    },
    async salvarConfig(config, servicos) {
      const r = await chamar("/api/agenda/config", { method: "PUT", body: JSON.stringify({ config, servicos }) });
      if (!r.ok) return { ok: false, erro: String(r.corpo.error ?? "não foi possível salvar") };
      return { ok: true, config: r.corpo.config as AgendaConfig, servicos: r.corpo.servicos as ServicoDaAgenda[] };
    },
  };
}

/**
 * A mesma fonte em MEMÓRIA, para o preview `/design/agenda`: as escritas mudam
 * só a lista desta aba e usam a MESMA regra de horário livre (`horariosDoTime`).
 */
export function fonteDaMemoriaAgenda(dados: {
  linhas: LinhaAgenda[];
  bloqueios: BloqueioAgenda[];
  servicos: ServicoDaAgenda[];
  hours: BusinessHours;
  config: AgendaConfig;
  agora: number;
  /** Contatos do preview, para a busca do "Marcar horário". */
  contatos?: ContatoDaBusca[];
}): FonteAgenda {
  let linhas = [...dados.linhas];
  let bloqueios = [...dados.bloqueios];
  let servicos = [...dados.servicos];
  let seq = 1000;
  const lembrete = (inicio: number) =>
    dados.config.lembrete ? momentoDoLembrete({ inicio, marcadoEm: dados.agora, hours: dados.hours }) : null;
  const ocupados = (ignorar?: number) => [
    ...linhas.filter((l) => l.status === "confirmado" && l.id !== ignorar),
    ...bloqueios,
  ];
  return {
    async buscarContatos(busca) {
      const q = busca.trim().toLowerCase();
      if (q.length < 2) return [];
      const digitos = q.replace(/[^0-9]/g, "");
      return (dados.contatos ?? [])
        .filter((c) => (c.nome ?? "").toLowerCase().includes(q) || (digitos.length >= 2 && c.phone.includes(digitos)))
        .slice(0, LIMITE_DA_BUSCA);
    },
    async semana(de, ate) {
      return linhas
        .filter((l) => l.status === "confirmado" && l.inicio >= de && l.inicio < ate)
        .sort((a, b) => a.inicio - b.inicio || a.id - b.id);
    },
    async bloqueios(de, ate) {
      return bloqueios.filter((b) => b.inicio < ate && b.fim > de).sort((a, b) => a.inicio - b.inicio);
    },
    async horarios(servicoId, dia, ignorar, fora) {
      const s = servicos.find((x) => x.id === servicoId);
      if (!s) return [];
      return horariosDoTime({
        agora: dados.agora,
        dia,
        hours: dados.hours,
        ocupados: ocupados(ignorar),
        config: dados.config,
        duracaoMin: s.duracaoMin,
        foraDoExpediente: fora,
      });
    },
    async marcar(p) {
      const s = servicos.find((x) => x.id === p.servicoId);
      if (!s) return { ok: false, erro: "serviço não encontrado" };
      const fim = p.inicio + s.duracaoMin * 60_000;
      if (conflita(p.inicio, fim, ocupados())) return { ok: false, erro: "esse horário já está ocupado" };
      linhas.push({
        id: ++seq, phone: p.phone, nome: p.nome || null, servicoId: s.id, servicoNome: s.nome,
        inicio: p.inicio, fim, status: "confirmado", origem: "time", canceladoPor: null,
        resumo: p.resumo.trim() || null, lembreteEm: lembrete(p.inicio),
      });
      return { ok: true };
    },
    async cancelar(id) {
      linhas = linhas.map((l) => (l.id === id ? { ...l, status: "cancelado", canceladoPor: "time" } : l));
      return { ok: true };
    },
    async remarcar(id, inicio) {
      const l = linhas.find((x) => x.id === id);
      if (!l) return { ok: false, erro: "agendamento não encontrado" };
      const fim = inicio + (l.fim - l.inicio);
      if (conflita(inicio, fim, ocupados(id))) return { ok: false, erro: "esse horário já está ocupado" };
      linhas = linhas.map((x) => (x.id === id ? { ...x, status: "cancelado", canceladoPor: "time" } : x));
      linhas.push({ ...l, id: ++seq, inicio, fim, lembreteEm: lembrete(inicio) });
      return { ok: true };
    },
    async bloquear(p) {
      bloqueios.push({ id: ++seq, inicio: p.inicio, fim: p.fim, motivo: p.motivo || null });
      return { ok: true };
    },
    async desbloquear(id) {
      bloqueios = bloqueios.filter((b) => b.id !== id);
      return { ok: true };
    },
    async salvarConfig(config, novos) {
      servicos = novos.map((s, i) => ({ id: s.id ?? ++seq + i, nome: s.nome, duracaoMin: s.duracaoMin }));
      return { ok: true, config, servicos };
    },
  };
}

/** Meia-noite (SP) de um dia civil, para os recortes da tela. */
export const inicioDoDia = inicioDoDiaSP;
