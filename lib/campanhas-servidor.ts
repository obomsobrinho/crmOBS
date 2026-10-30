import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { Busca, Campanha, ConexaoDisponivel, EnvioDaCampanha, FiltroDeContatos, Lead } from "@/components/admin/campanhas/tipos";
import type { OpcoesDaBusca, SituacaoDaBusca, SituacaoDaCampanha, SituacaoNaCampanha } from "./prospeccao";
import type { ItemDaFonteDeLeads } from "./fonte-de-leads";
import { whatsappDoCliente } from "./admin";

type Svc = SupabaseClient<Database>;

export function itensParaJson(itens: ItemDaFonteDeLeads[]) {
  return itens.map((i) => ({
    telefone: i.telefone,
    telefone_original: i.telefone_original,
    tipo_telefone: i.tipo_telefone,
    fonte_id: i.fonte_id,
    nome: i.nome,
    segmento: i.segmento,
    endereco: i.endereco,
    bairro: i.bairro,
    cidade: i.cidade,
    site: i.site,
    site_classe: i.site_classe,
    nota: i.nota,
    avaliacoes: i.avaliacoes,
    pontuacao: i.pontuacao,
  }));
}

export async function criarBuscaNoBanco(
  svc: Svc,
  a: { quem: string; id: string; termo: string; cidade: string; uf: string; fonte: string; execucao: string; opcoes: OpcoesDaBusca },
) {
  const { error } = await svc.rpc("prospeccao_criar_busca", {
    p_quem: a.quem,
    p_id: a.id,
    p_termo: a.termo,
    p_cidade: a.cidade,
    p_uf: a.uf,
    p_fonte: a.fonte,
    p_execucao: a.execucao,
    p_opcoes: a.opcoes as unknown as Database["public"]["Functions"]["prospeccao_criar_busca"]["Args"]["p_opcoes"],
  });
  if (error) throw error;
}

export async function concluirBusca(svc: Svc, buscaId: string, itens: ItemDaFonteDeLeads[] | null, erro: string | null) {
  const { data, error } = await svc.rpc("prospeccao_concluir_busca", {
    p_busca: buscaId,
    p_itens: itens ? itensParaJson(itens) : [],
    p_erro: erro,
  } as never);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function conexoesDoAdmin(svc: Svc, userId: string): Promise<ConexaoDisponivel[]> {
  const { data, error } = await svc
    .from("user_clients")
    .select("client_id, clients(id, name, evolution_instance)")
    .eq("user_id", userId);
  if (error) throw error;
  const out: ConexaoDisponivel[] = [];
  for (const row of data ?? []) {
    const c = row.clients as { id: string; name: string; evolution_instance: string | null } | null;
    if (!c?.id) continue;
    let conectado = false;
    if (c.evolution_instance) {
      const st = await whatsappDoCliente(svc, c.id);
      conectado = st === "conectado";
    }
    out.push({
      id: c.id,
      nome: c.name,
      numero: c.evolution_instance ?? "Sem número",
      conectado,
    });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function ms(d: string | null): number | null {
  return d ? Date.parse(d) : null;
}

function sitBusca(s: string): SituacaoDaBusca {
  if (s === "pronta" || s === "falhou") return s;
  return "buscando";
}

function sitCampanha(s: string): SituacaoDaCampanha {
  if (s === "agendada" || s === "rodando" || s === "pausada" || s === "concluida") return s;
  return "rascunho";
}

function sitNaCampanha(s: string): SituacaoNaCampanha {
  if (s === "enviado" || s === "respondeu" || s === "falhou" || s === "parou") return s;
  return "na_fila";
}

export function linhaParaBusca(r: {
  id: string;
  termo: string;
  cidade: string;
  status: string;
  opcoes: unknown;
  erro: string | null;
  criada_em: string;
}): Busca {
  return {
    id: r.id,
    termo: r.termo,
    cidade: r.cidade,
    criadaEm: Date.parse(r.criada_em),
    situacao: sitBusca(r.status),
    total: 0,
    erro: r.erro,
    opcoes: (r.opcoes ?? {}) as OpcoesDaBusca,
  };
}

export function linhaParaLead(r: {
  id: string;
  busca_id: string;
  nome: string;
  segmento: string | null;
  bairro: string | null;
  cidade: string | null;
  telefone: string | null;
  site: string | null;
  nota: number | null;
  avaliacoes: number | null;
  marcacao: string | null;
  parou_em: string | null;
  campanha_ids: string[] | null;
}): Lead {
  return {
    id: r.id,
    buscaId: r.busca_id,
    nome: r.nome,
    segmento: r.segmento ?? "",
    bairro: r.bairro ?? "",
    cidade: r.cidade ?? "",
    telefone: r.telefone,
    site: r.site,
    nota: r.nota,
    avaliacoes: r.avaliacoes,
    marcacao: r.marcacao === "bom" || r.marcacao === "descartado" ? r.marcacao : null,
    parouEm: ms(r.parou_em),
    campanhaIds: r.campanha_ids ?? [],
  };
}

export function filtroDeJson(j: unknown): FiltroDeContatos {
  const o = (j ?? {}) as Record<string, unknown>;
  const buscaId = o.buscaId;
  return {
    buscaId: buscaId === "todas" || typeof buscaId !== "string" ? "todas" : buscaId,
    soMarcadosComoBons: !!o.soMarcadosComoBons,
    soSemSiteProprio: !!o.soSemSiteProprio,
    quemNaoRespondeuDe: typeof o.quemNaoRespondeuDe === "string" && o.quemNaoRespondeuDe ? o.quemNaoRespondeuDe : null,
  };
}

export function filtroParaJson(f: FiltroDeContatos) {
  return {
    buscaId: f.buscaId,
    soMarcadosComoBons: f.soMarcadosComoBons,
    soSemSiteProprio: f.soSemSiteProprio,
    quemNaoRespondeuDe: f.quemNaoRespondeuDe,
  };
}

export async function campanhaPorId(svc: Svc, id: string): Promise<Campanha | null> {
  const { data: c, error } = await svc.from("prospeccao_campanhas").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!c) return null;
  const { data: vars } = await svc.from("prospeccao_variantes").select("texto, ordem").eq("campanha_id", id).order("ordem");
  const { data: envios } = await svc
    .from("prospeccao_campanha_leads")
    .select("lead_id, status, variante, enviado_em, respondeu_em, ordem")
    .eq("campanha_id", id)
    .order("ordem");
  const env: EnvioDaCampanha[] = (envios ?? []).map((e) => ({
    leadId: e.lead_id,
    situacao: sitNaCampanha(e.status),
    variante: e.variante,
    enviadoEm: ms(e.enviado_em),
    respondeuEm: ms(e.respondeu_em),
  }));
  return {
    id: c.id,
    nome: c.nome,
    situacao: sitCampanha(c.status),
    agendadaPara: ms(c.agendada_para),
    conexaoId: c.client_id,
    filtro: filtroDeJson(c.filtro),
    variantes: (vars ?? []).map((v) => v.texto),
    envios: env,
    criadaEm: Date.parse(c.criada_em),
    salvaEm: Date.parse(c.salva_em),
    passo: c.passo,
  };
}
