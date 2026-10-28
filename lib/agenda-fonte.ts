import type { Supa } from "@/lib/supabase/tipos";
import {
  horariosLivres,
  conflita,
  type AgendaConfig,
  type ServicoDaAgenda,
} from "@/lib/agenda";
import type { BusinessHours } from "@/lib/agent-prompt";
import { inicioDoDiaSP } from "@/lib/fuso";

// A ÚNICA porta da tela `/agenda` para os dados (docs/plano-agenda.md). Duas
// implementações com a mesma interface: o banco (leitura com a sessão do
// usuário, escrita pelas rotas `/api/agenda/*`) e a memória (o preview
// `/design/agenda`, sem banco). A lista pagina de 10 em 10 por (inicio, id).

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
}

export interface BloqueioAgenda {
  id: number;
  inicio: number;
  fim: number;
  motivo: string | null;
}

export interface RecorteAgenda {
  de: number;
  ate: number;
  status: "confirmado" | "cancelado";
}

export type Resultado = { ok: true } | { ok: false; erro: string };

export interface FonteAgenda {
  listar(r: RecorteAgenda, depois: LinhaAgenda | null, n: number): Promise<LinhaAgenda[]>;
  bloqueios(de: number, ate: number): Promise<BloqueioAgenda[]>;
  horarios(servicoId: number, dia: string, ignorar?: number): Promise<number[]>;
  marcar(p: { phone: string; nome: string; servicoId: number; inicio: number }): Promise<Resultado>;
  cancelar(id: number): Promise<Resultado>;
  remarcar(id: number, inicio: number): Promise<Resultado>;
  bloquear(p: { inicio: number; fim: number; motivo: string }): Promise<Resultado>;
  desbloquear(id: number): Promise<Resultado>;
  salvarConfig(
    config: AgendaConfig,
    servicos: { id: number | null; nome: string; duracaoMin: number }[]
  ): Promise<{ ok: true; config: AgendaConfig; servicos: ServicoDaAgenda[] } | { ok: false; erro: string }>;
}

export const PAGINA_AGENDA = 10;

const COLUNAS = "id, phone, nome, servico_id, servico_nome, inicio, fim, status, origem, cancelado_por";

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
export function fonteDoBancoAgenda(supabase: Supa, clientId: string): FonteAgenda {
  return {
    async listar(r, depois, n) {
      let q = supabase
        .from("agendamentos")
        .select(COLUNAS)
        .eq("client_id", clientId)
        .eq("status", r.status)
        .gte("inicio", new Date(r.de).toISOString())
        .lt("inicio", new Date(r.ate).toISOString())
        .order("inicio")
        .order("id")
        .limit(n);
      if (depois) {
        const iso = new Date(depois.inicio).toISOString();
        q = q.or(`inicio.gt.${iso},and(inicio.eq.${iso},id.gt.${depois.id})`);
      }
      const { data, error } = await q;
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
    async horarios(servicoId, dia, ignorar) {
      const qs = new URLSearchParams({ servico: String(servicoId), dia });
      if (ignorar) qs.set("ignorar", String(ignorar));
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
 * só a lista desta aba e usam a MESMA regra de horário livre (`horariosLivres`).
 */
export function fonteDaMemoriaAgenda(dados: {
  linhas: LinhaAgenda[];
  bloqueios: BloqueioAgenda[];
  servicos: ServicoDaAgenda[];
  hours: BusinessHours;
  config: AgendaConfig;
  agora: number;
}): FonteAgenda {
  let linhas = [...dados.linhas];
  let bloqueios = [...dados.bloqueios];
  let servicos = [...dados.servicos];
  let seq = 1000;
  const ocupados = (ignorar?: number) => [
    ...linhas.filter((l) => l.status === "confirmado" && l.id !== ignorar),
    ...bloqueios,
  ];
  return {
    async listar(r, depois, n) {
      return linhas
        .filter((l) => l.status === r.status && l.inicio >= r.de && l.inicio < r.ate)
        .sort((a, b) => a.inicio - b.inicio || a.id - b.id)
        .filter((l) => !depois || l.inicio > depois.inicio || (l.inicio === depois.inicio && l.id > depois.id))
        .slice(0, n);
    },
    async bloqueios(de, ate) {
      return bloqueios.filter((b) => b.inicio < ate && b.fim > de).sort((a, b) => a.inicio - b.inicio);
    },
    async horarios(servicoId, dia, ignorar) {
      const s = servicos.find((x) => x.id === servicoId);
      if (!s) return [];
      const d = horariosLivres({
        agora: dados.agora,
        hours: dados.hours,
        ocupados: ocupados(ignorar),
        config: dados.config,
        duracaoMin: s.duracaoMin,
        deDia: dia,
        semAntecedencia: true,
      });
      return d[0]?.inicios ?? [];
    },
    async marcar(p) {
      const s = servicos.find((x) => x.id === p.servicoId);
      if (!s) return { ok: false, erro: "serviço não encontrado" };
      const fim = p.inicio + s.duracaoMin * 60_000;
      if (conflita(p.inicio, fim, ocupados())) return { ok: false, erro: "esse horário já está ocupado" };
      linhas.push({
        id: ++seq, phone: p.phone, nome: p.nome || null, servicoId: s.id, servicoNome: s.nome,
        inicio: p.inicio, fim, status: "confirmado", origem: "time", canceladoPor: null,
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
      linhas.push({ ...l, id: ++seq, inicio, fim });
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
