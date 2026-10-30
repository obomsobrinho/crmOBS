import "server-only";
import type {
  Busca,
  BuscaDaTabela,
  CampanhaAberta,
  CampanhaDaTabela,
  CampanhaEditavel,
  ConexaoDisponivel,
  FiltroDeContatos,
  FiltroDosLeads,
  LeadDaTabela,
  LeadNaCampanha,
  Pagina,
  PreviaDoFiltro,
  Resultados,
  Totais,
} from "@/components/admin/campanhas/tipos";
import { estadoDoWhatsApp, type EstadoDoWhatsApp } from "./admin-alertas";
import { estadoDaInstancia } from "./evolution";
import {
  SITUACOES_DA_BUSCA,
  SITUACOES_DA_CAMPANHA,
  SITUACOES_NA_CAMPANHA,
  ehSituacaoDaBusca,
  ehSituacaoDaCampanha,
  ehSituacaoNaCampanha,
  areaDe,
  filtroDe,
} from "./campanhas-pedidos";
import { filtrarPelasOpcoes, itemParaOBanco, type FonteDeLeads } from "./fonte-de-leads";
import { diaIsoSP, inicioDoDiaSP, somarDias } from "./fuso";
import { paraJson } from "./json";
import { PERIODOS, type PeriodoKey } from "./periodo";
import {
  DIAS_DA_LINHA,
  MINIMOS_DE_AVALIACOES,
  OPCOES_PADRAO,
  POR_PAGINA_DE_CAMPANHAS as POR_PAGINA,
  proximoEnvioEm,
  resultadoDasLinhas,
  resumoDasLinhas,
  serieDasLinhas,
  type MarcacaoDoLead,
  type NotaMinima,
  type OpcoesDaBusca,
  type ResumoDobrado,
  type SituacaoDaBusca,
  type SituacaoDaCampanha,
  type SituacaoNaCampanha,
} from "./prospeccao";
import type { Json } from "./database.types";
import type { Supa } from "./supabase/tipos";

// O LADO SERVIDOR DE CAMPANHAS (a prospecção do dono do produto,
// docs/plano-campanhas.md): leituras e escritas das rotas `/api/admin/campanhas/*`,
// do webhook da fonte e do cron, sempre com service_role. Toda escrita do admin é
// UMA função SQL com a linha em `admin_acoes`; toda conta dos painéis é agregada
// no SQL e dobrada aqui pelos gêmeos puros de `lib/prospeccao.ts`.

const SEMANAS_DO_PAINEL = 8;
const DIAS_DO_PAINEL = 14;

// ── Mapas de linha ─────────────────────────────────────────────────────

const ms = (d: string | null | undefined): number | null => (d ? Date.parse(d) : null);
const situacaoDaBusca = (s: string): SituacaoDaBusca => (ehSituacaoDaBusca(s) ? s : "buscando");
const situacaoDaCampanha = (s: string): SituacaoDaCampanha => (ehSituacaoDaCampanha(s) ? s : "rascunho");
const situacaoNaCampanha = (s: string): SituacaoNaCampanha => (ehSituacaoNaCampanha(s) ? s : "na_fila");
const marcacaoDe = (s: string | null): MarcacaoDoLead => (s === "bom" || s === "descartado" ? s : null);

/** Quantas linhas em cada situação, com zero nas que não vieram. */
function contarPorSituacao<K extends string>(chaves: K[], linhas: { status: string; n: number }[]): Record<K, number> {
  return Object.fromEntries(chaves.map((k) => [k, linhas.find((l) => l.status === k)?.n ?? 0])) as Record<K, number>;
}

const NOTAS: NotaMinima[] = [3.5, 4, 4.5];

/**
 * O jsonb `opcoes` GRAVADO de uma busca, lido com folga: cada campo legível fica como
 * foi pedido e só o que falta cai no padrão (a conferência estrita de um pedido novo é
 * `opcoesDe`; apertá-la depois não pode mudar as opções de uma busca antiga).
 */
function opcoesDoJson(j: Json, termo: string, cidade: string, uf: string | null): OpcoesDaBusca {
  const o = j !== null && typeof j === "object" && !Array.isArray(j) ? j : {};
  const termos = Array.isArray(o.termos) ? o.termos.filter((t): t is string => typeof t === "string") : [];
  const nota = NOTAS.find((n) => n === o.notaMinima) ?? null;
  return {
    termos: termos.length > 0 ? termos : termo.split(",").map((t) => t.trim()),
    cidade: typeof o.cidade === "string" ? o.cidade : cidade,
    uf: typeof o.uf === "string" ? o.uf : (uf ?? ""),
    porTermo: typeof o.porTermo === "number" ? o.porTermo : OPCOES_PADRAO.porTermo,
    notaMinima: nota,
    site: o.site === "sem_site" || o.site === "com_site" ? o.site : "todos",
    cidadeIbge: typeof o.cidadeIbge === "number" ? o.cidadeIbge : null,
    area: areaDe(o.area) ?? null,
    minAvaliacoes: MINIMOS_DE_AVALIACOES.find((m) => m === o.minAvaliacoes) ?? null,
    categorias: Array.isArray(o.categorias) ? o.categorias.filter((c): c is string => typeof c === "string") : [],
    ignorarFechados: typeof o.ignorarFechados === "boolean" ? o.ignorarFechados : OPCOES_PADRAO.ignorarFechados,
    buscarContatos: typeof o.buscarContatos === "boolean" ? o.buscarContatos : OPCOES_PADRAO.buscarContatos,
  };
}

/** O estado do número agora (Evolution ao vivo); uma falha da Evolution é "desconhecido", nunca "desconectado". */
export async function estadoDoNumero(instancia: string): Promise<EstadoDoWhatsApp> {
  try {
    return estadoDoWhatsApp(await estadoDaInstancia(instancia));
  } catch {
    return "desconhecido";
  }
}

interface LinhaDeBusca {
  id: string;
  termo: string;
  cidade: string;
  uf: string | null;
  status: string;
  opcoes: Json;
  erro: string | null;
  criada_em: string;
  total: number;
}

function paraBusca(r: LinhaDeBusca): Busca {
  return {
    id: r.id,
    termo: r.termo,
    cidade: r.cidade,
    criadaEm: Date.parse(r.criada_em),
    situacao: situacaoDaBusca(r.status),
    total: r.total,
    erro: r.erro,
    opcoes: opcoesDoJson(r.opcoes, r.termo, r.cidade, r.uf),
  };
}

const COLUNAS_DA_BUSCA = "id, termo, cidade, uf, status, opcoes, erro, criada_em, total";
const COLUNAS_DA_CAMPANHA = "id, nome, status, agendada_para, client_id, filtro, passo, criada_em, salva_em";

// ── Leituras das telas ─────────────────────────────────────────────────

export async function totais(svc: Supa): Promise<Totais> {
  const [leads, buscas, campanhas] = await Promise.all([
    svc.from("prospeccao_leads").select("id", { count: "exact", head: true }),
    svc.rpc("prospeccao_buscas_contagens"),
    svc.rpc("prospeccao_campanhas_contagens"),
  ]);
  if (leads.error) throw leads.error;
  if (buscas.error) throw buscas.error;
  if (campanhas.error) throw campanhas.error;
  return {
    leads: leads.count ?? 0,
    buscas: contarPorSituacao(SITUACOES_DA_BUSCA, buscas.data ?? []),
    campanhas: contarPorSituacao(SITUACOES_DA_CAMPANHA, campanhas.data ?? []),
  };
}

/**
 * Os números que podem enviar: SÓ as empresas de que o próprio admin é membro e que
 * têm instância (uma mensagem de prospecção nunca sai do número de um cliente por
 * engano). O estado de cada uma é lido ao vivo na Evolution, pelo navegador, nunca
 * na renderização da página.
 */
export async function conexoesDoAdmin(svc: Supa, admin: string): Promise<ConexaoDisponivel[]> {
  const ids = await empresasDoAdmin(svc, admin);
  if (ids.length === 0) return [];
  const { data, error } = await svc.from("clients").select("id, name, evolution_instance").in("id", ids).not("evolution_instance", "is", null);
  if (error) throw error;
  const lista = await Promise.all(
    (data ?? []).map(async (c) => ({
      id: c.id,
      nome: c.name,
      numero: c.evolution_instance ?? "",
      conectado: c.evolution_instance ? (await estadoDoNumero(c.evolution_instance)) === "conectado" : false,
    })),
  );
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function empresasDoAdmin(svc: Supa, admin: string): Promise<string[]> {
  const { data, error } = await svc.from("user_clients").select("client_id").eq("user_id", admin);
  if (error) throw error;
  return (data ?? []).map((r) => r.client_id);
}

export async function paginaDeBuscas(
  svc: Supa,
  p: { texto: string; situacao: SituacaoDaBusca | null; pagina: number },
): Promise<Pagina<BuscaDaTabela>> {
  const { data, error } = await svc.rpc("prospeccao_buscas_pagina", {
    p_texto: p.texto || null,
    p_status: p.situacao,
    p_offset: (p.pagina - 1) * POR_PAGINA,
    p_limite: POR_PAGINA,
  });
  if (error) throw error;
  const linhas = data ?? [];
  return {
    total: linhas[0]?.total_geral ?? 0,
    itens: linhas.map((r) => ({
      ...paraBusca({ ...r, total: r.achadas }),
      contagem: { total: r.achadas, comCelular: r.com_celular, bons: r.bons, contatados: r.contatados, responderam: r.responderam },
    })),
  };
}

export async function buscasParaEscolher(svc: Supa): Promise<Busca[]> {
  const { data, error } = await svc
    .from("prospeccao_buscas")
    .select(COLUNAS_DA_BUSCA)
    .order("criada_em", { ascending: false })
    .order("id")
    // eslint-disable-next-line no-restricted-syntax -- the options of one select (the wizard's search), newest first, never filtered in memory
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(paraBusca);
}

export async function buscaPorId(svc: Supa, id: string): Promise<Busca | null> {
  const { data, error } = await svc.from("prospeccao_buscas").select(COLUNAS_DA_BUSCA).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? paraBusca(data) : null;
}

export async function paginaDeLeads(
  svc: Supa,
  p: { buscaId: string | null; texto: string; cidade: string | null; filtros: FiltroDosLeads[]; pagina: number },
): Promise<Pagina<LeadDaTabela>> {
  const digitos = p.texto.replace(/\D/g, "");
  const { data, error } = await svc.rpc("prospeccao_leads_pagina", {
    p_busca: p.buscaId,
    p_texto: p.texto || null,
    p_digitos: digitos.length >= 3 ? digitos : null,
    p_cidade: p.cidade,
    p_nao_contatados: p.filtros.includes("nao_contatados"),
    p_so_bons: p.filtros.includes("bons"),
    p_so_sem_site: p.filtros.includes("sem_site"),
    p_nota_minima: p.filtros.includes("nota") ? 4.5 : null,
    p_offset: (p.pagina - 1) * POR_PAGINA,
    p_limite: POR_PAGINA,
  });
  if (error) throw error;
  const linhas = data ?? [];
  return {
    total: linhas[0]?.total_geral ?? 0,
    itens: linhas.map((r) => {
      const ids = r.campanha_ids ?? [];
      const nomes = r.campanha_nomes ?? [];
      return {
        id: r.id,
        buscaId: r.busca_id,
        nome: r.nome,
        segmento: r.segmento ?? "",
        bairro: r.bairro ?? "",
        cidade: r.cidade ?? "",
        telefone: r.telefone,
        site: r.site,
        nota: r.nota === null ? null : Number(r.nota),
        avaliacoes: r.avaliacoes,
        marcacao: marcacaoDe(r.marcacao),
        parouEm: ms(r.parou_em),
        campanhaIds: ids,
        detalhes: null,
        campanhas: ids.map((id, i) => ({ id, nome: nomes[i] ?? "" })),
        respondeu: r.respondeu,
      };
    }),
  };
}

export async function cidadesDosLeads(svc: Supa, buscaId: string | null): Promise<string[]> {
  const { data, error } = await svc.rpc("prospeccao_cidades", { p_busca: buscaId });
  if (error) throw error;
  return (data ?? []).map((r) => r.cidade);
}

/** Marca o lead (`prospeccao_marcar_lead`, com a linha em admin_acoes); null = o lead não existe. */
export async function marcarLead(svc: Supa, admin: string, id: string, marcacao: MarcacaoDoLead): Promise<{ marcacao: MarcacaoDoLead } | null> {
  const { data, error } = await svc.rpc("prospeccao_marcar_lead", { p_quem: admin, p_lead: id, p_marcacao: marcacao });
  if (error) throw error;
  const r = data?.[0];
  if (!r) return null;
  return { marcacao: marcacaoDe(r.marcacao) };
}

export async function painelDaBase(svc: Supa, buscaId: string | null, agora: number): Promise<ResumoDobrado> {
  const hoje = diaIsoSP(agora);
  const { data, error } = await svc.rpc("prospeccao_resumo_da_base", {
    p_busca: buscaId,
    p_hoje: hoje,
    p_semanas: SEMANAS_DO_PAINEL,
    p_dias: DIAS_DO_PAINEL,
  });
  if (error) throw error;
  const linhas = (data ?? []).map((r) => ({
    dimensao: r.dimensao,
    chave: r.chave,
    n: Number(r.n ?? 0),
    aContatar: r.a_contatar === null ? null : Number(r.a_contatar),
    contatados: r.contatados === null ? null : Number(r.contatados),
    responderam: r.responderam === null ? null : Number(r.responderam),
    soma: r.soma === null ? null : Number(r.soma),
  }));
  return resumoDasLinhas(linhas, hoje, SEMANAS_DO_PAINEL, DIAS_DO_PAINEL);
}

export async function paginaDeCampanhas(
  svc: Supa,
  p: { texto: string; situacao: SituacaoDaCampanha | null; pagina: number },
  agora: number,
): Promise<Pagina<CampanhaDaTabela>> {
  const hoje = diaIsoSP(agora);
  const { data, error } = await svc.rpc("prospeccao_campanhas_pagina", {
    p_texto: p.texto || null,
    p_status: p.situacao,
    p_offset: (p.pagina - 1) * POR_PAGINA,
    p_limite: POR_PAGINA,
    p_hoje: hoje,
    p_dias: DIAS_DA_LINHA,
  });
  if (error) throw error;
  const linhas = data ?? [];
  return {
    total: linhas[0]?.total_geral ?? 0,
    itens: linhas.map((r) => ({
      id: r.id,
      nome: r.nome,
      situacao: situacaoDaCampanha(r.status),
      agendadaPara: ms(r.agendada_para),
      conexaoId: r.client_id,
      passo: r.passo,
      criadaEm: Date.parse(r.criada_em),
      salvaEm: Date.parse(r.salva_em),
      total: r.total,
      enviados: r.enviados,
      falharam: r.falharam,
      responderam: r.responderam,
      serie: (r.serie ?? []).map((enviados, i) => ({ dia: somarDias(hoje, i - DIAS_DA_LINHA + 1), enviados, responderam: 0 })),
    })),
  };
}

/** As campanhas que já começaram (o seletor do painel de resultados), as mais novas primeiro. */
export async function campanhasComEnvio(svc: Supa): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await svc
    .from("prospeccao_campanhas")
    .select("id, nome")
    .not("iniciada_em", "is", null)
    .order("criada_em", { ascending: false })
    .order("id")
    // eslint-disable-next-line no-restricted-syntax -- the options of one select (the results panel's campaign), newest first, never filtered in memory
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

async function quantasVariantes(svc: Supa, campanhaId: string): Promise<number> {
  const { count, error } = await svc.from("prospeccao_variantes").select("ordem", { count: "exact", head: true }).eq("campanha_id", campanhaId);
  if (error) throw error;
  return count ?? 0;
}

/** O primeiro envio da campanha (o começo da série do detalhe); null sem envio. */
async function primeiroEnvio(svc: Supa, campanhaId: string): Promise<number | null> {
  const { data, error } = await svc
    .from("prospeccao_campanha_leads")
    .select("enviado_em")
    .eq("campanha_id", campanhaId)
    .not("enviado_em", "is", null)
    .order("enviado_em")
    .limit(1);
  if (error) throw error;
  return ms(data?.[0]?.enviado_em);
}

async function linhasDoResultado(
  svc: Supa,
  a: { campanhaId: string | null; de: number | null; ate: number | null; serieDe: string | null; serieAte: string | null },
) {
  const { data, error } = await svc.rpc("prospeccao_resultados", {
    p_campanha: a.campanhaId,
    p_de: a.de === null ? null : new Date(a.de).toISOString(),
    p_ate: a.ate === null ? null : new Date(a.ate).toISOString(),
    p_serie_de: a.serieDe,
    p_serie_ate: a.serieAte,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    dimensao: r.dimensao,
    chave: r.chave,
    n: r.n === null ? null : Number(r.n),
    enviados: r.enviados === null ? null : Number(r.enviados),
    responderam: r.responderam === null ? null : Number(r.responderam),
  }));
}

/**
 * O painel de resultados: com `periodo`, a janela que termina hoje e a anterior
 * igual (os selos); sem, a campanha inteira desde o início, com a série do
 * primeiro envio até hoje (de 7 a 30 dias), como no preview.
 */
export async function resultados(
  svc: Supa,
  p: { campanhaId: string | null; periodo: PeriodoKey | null },
  agora: number,
): Promise<Resultados> {
  const hoje = diaIsoSP(agora);
  // A contagem das variantes corre junto com as outras leituras.
  const quantas = p.campanhaId ? quantasVariantes(svc, p.campanhaId).then((n) => Math.max(1, n)) : Promise.resolve(3);
  if (p.periodo === null) {
    const [variantes, primeiro] = await Promise.all([quantas, p.campanhaId ? primeiroEnvio(svc, p.campanhaId) : null]);
    const dias = primeiro === null ? 7 : Math.min(30, Math.max(7, Math.round((agora - primeiro) / 86_400_000) + 1));
    const serieDe = somarDias(hoje, -dias + 1);
    const linhas = await linhasDoResultado(svc, { campanhaId: p.campanhaId, de: null, ate: null, serieDe, serieAte: hoje });
    const { resultado, espera } = resultadoDasLinhas(linhas, variantes);
    return { atual: resultado, anterior: null, espera, serie: serieDasLinhas(linhas, serieDe, dias) };
  }
  const dias = PERIODOS[p.periodo].dias;
  const de = inicioDoDiaSP(somarDias(hoje, -dias + 1));
  const deAntes = inicioDoDiaSP(somarDias(hoje, -2 * dias + 1));
  const ate = inicioDoDiaSP(somarDias(hoje, 1));
  const diasDaSerie = Math.max(7, dias);
  const serieDe = somarDias(hoje, -diasDaSerie + 1);
  const [atual, antes, variantes] = await Promise.all([
    linhasDoResultado(svc, { campanhaId: p.campanhaId, de, ate, serieDe, serieAte: hoje }),
    linhasDoResultado(svc, { campanhaId: p.campanhaId, de: deAntes, ate: de, serieDe: null, serieAte: null }),
    quantas,
  ]);
  const a = resultadoDasLinhas(atual, variantes);
  return {
    atual: a.resultado,
    anterior: resultadoDasLinhas(antes, variantes).resultado,
    espera: a.espera,
    serie: serieDasLinhas(atual, serieDe, diasDaSerie),
  };
}

async function campanhaEditavel(svc: Supa, id: string): Promise<CampanhaEditavel | null> {
  const [c, v] = await Promise.all([
    svc.from("prospeccao_campanhas").select(COLUNAS_DA_CAMPANHA).eq("id", id).maybeSingle(),
    svc.from("prospeccao_variantes").select("texto, ordem").eq("campanha_id", id).order("ordem"),
  ]);
  if (c.error) throw c.error;
  if (v.error) throw v.error;
  if (!c.data) return null;
  const r = c.data;
  return {
    id: r.id,
    nome: r.nome,
    situacao: situacaoDaCampanha(r.status),
    agendadaPara: ms(r.agendada_para),
    conexaoId: r.client_id,
    filtro: filtroDe(r.filtro) ?? { buscaId: "todas", soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null },
    variantes: (v.data ?? []).map((x) => x.texto),
    criadaEm: Date.parse(r.criada_em),
    salvaEm: Date.parse(r.salva_em),
    passo: r.passo,
  };
}

export async function campanhaAberta(svc: Supa, id: string): Promise<CampanhaAberta | null> {
  const [campanha, contagens] = await Promise.all([campanhaEditavel(svc, id), svc.rpc("prospeccao_contagens_da_campanha", { p_campanha: id })]);
  if (contagens.error) throw contagens.error;
  if (!campanha) return null;
  const linhas = contagens.data ?? [];
  return {
    campanha,
    contagens: contarPorSituacao(SITUACOES_NA_CAMPANHA, linhas),
  };
}

export async function leadsDaCampanha(
  svc: Supa,
  id: string,
  p: { texto: string; situacao: SituacaoNaCampanha | null; pagina: number },
): Promise<Pagina<LeadNaCampanha>> {
  const { data, error } = await svc.rpc("prospeccao_leads_da_campanha", {
    p_campanha: id,
    p_texto: p.texto || null,
    p_status: p.situacao,
    p_offset: (p.pagina - 1) * POR_PAGINA,
    p_limite: POR_PAGINA,
  });
  if (error) throw error;
  const linhas = data ?? [];
  return {
    total: linhas[0]?.total_geral ?? 0,
    itens: linhas.map((r) => ({
      leadId: r.lead_id,
      nome: r.nome,
      bairro: r.bairro ?? "",
      cidade: r.cidade ?? "",
      situacao: situacaoNaCampanha(r.status),
      variante: r.variante,
      enviadoEm: ms(r.enviado_em),
      respondeuEm: ms(r.respondeu_em),
    })),
  };
}

/** Quem entra pelo recorte (a MESMA função SQL que monta a fila ao iniciar): o total e os primeiros nomes. */
export async function previaDoFiltro(svc: Supa, f: FiltroDeContatos): Promise<PreviaDoFiltro> {
  const [fila, origem] = await Promise.all([
    svc.rpc("prospeccao_leads_do_filtro", {
      p_busca: f.buscaId === "todas" ? null : f.buscaId,
      p_so_bons: f.soMarcadosComoBons,
      p_so_sem_site: f.soSemSiteProprio,
      p_origem: f.quemNaoRespondeuDe,
      p_limite: 8,
    }),
    f.quemNaoRespondeuDe
      ? svc.from("prospeccao_campanhas").select("nome").eq("id", f.quemNaoRespondeuDe).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (fila.error) throw fila.error;
  if (origem.error) throw origem.error;
  const linhas = fila.data ?? [];
  return { total: linhas[0]?.total ?? 0, primeiros: linhas.map((l) => l.nome), origem: origem.data?.nome ?? null };
}

// ── Escritas do admin (uma função SQL cada, com a linha em admin_acoes) ──

/** Salva o rascunho; null = a campanha já não é rascunho (a rota responde 409). */
export async function salvarRascunho(
  svc: Supa,
  admin: string,
  c: Omit<CampanhaEditavel, "situacao" | "criadaEm" | "salvaEm">,
): Promise<number | null> {
  const { data, error } = await svc.rpc("prospeccao_salvar_campanha", {
    p_quem: admin,
    p_id: c.id,
    p_nome: c.nome,
    p_client: c.conexaoId,
    p_agendada_para: c.agendadaPara === null ? null : new Date(c.agendadaPara).toISOString(),
    p_filtro: paraJson(c.filtro),
    p_passo: c.passo,
    p_variantes: c.variantes,
  });
  if (error) throw error;
  const r = data?.[0];
  return r ? Date.parse(r.salva_em) : null;
}

/** Quantos já saíram hoje (São Paulo) na campanha: a faixa do próximo envio. */
async function enviadosHoje(svc: Supa, campanhaId: string, agora: number): Promise<number> {
  const { count, error } = await svc
    .from("prospeccao_campanha_leads")
    .select("lead_id", { count: "exact", head: true })
    .eq("campanha_id", campanhaId)
    .gte("enviado_em", new Date(inicioDoDiaSP(diaIsoSP(agora))).toISOString());
  if (error) throw error;
  return count ?? 0;
}

export type RespostaDaAcao =
  | { ok: true; situacao: SituacaoDaCampanha }
  | { ok: false; status: 404 | 409 | 422; erro: string };

const RECUSAS_DO_INICIO: Record<string, { status: 404 | 409 | 422; erro: string }> = {
  nao_encontrada: { status: 404, erro: "Esta campanha não existe mais." },
  nao_e_rascunho: { status: 409, erro: "Esta campanha já foi iniciada." },
  sem_numero: { status: 422, erro: "Falta o número que envia" },
  sem_variante: { status: 422, erro: "Falta a mensagem" },
  sem_leads: { status: 422, erro: "Ninguém nesse recorte. Tire um recorte ou faça uma nova busca." },
};

async function situacaoAgora(svc: Supa, id: string): Promise<SituacaoDaCampanha> {
  const { data, error } = await svc.from("prospeccao_campanhas").select("status").eq("id", id).maybeSingle();
  if (error) throw error;
  return situacaoDaCampanha(data?.status ?? "rascunho");
}

/**
 * Iniciar (ou agendar). O servidor confere de novo o que trava o assistente
 * (`problemasParaIniciar`, com `problemasDaVariante`) e que o número é de uma
 * empresa do próprio admin; a fila sai de `prospeccao_leads_do_filtro`
 * (`podeEntrarNaCampanha` no SQL), numa transação.
 */
export async function iniciarCampanha(
  svc: Supa,
  admin: string,
  id: string,
  agora: number,
  problemas: (c: CampanhaEditavel) => string[],
): Promise<RespostaDaAcao> {
  const [c, empresas] = await Promise.all([campanhaEditavel(svc, id), empresasDoAdmin(svc, admin)]);
  if (!c) return { ok: false, ...RECUSAS_DO_INICIO.nao_encontrada };
  if (c.situacao !== "rascunho") return { ok: false, ...RECUSAS_DO_INICIO.nao_e_rascunho };
  const p = problemas(c);
  if (p.length > 0) return { ok: false, status: 422, erro: p[0] };
  if (!c.conexaoId || !empresas.includes(c.conexaoId)) {
    return { ok: false, status: 422, erro: "Escolha um número das suas empresas" };
  }
  const { data, error } = await svc.rpc("prospeccao_iniciar_campanha", {
    p_quem: admin,
    p_id: id,
    p_agora: new Date(agora).toISOString(),
    p_proximo: new Date(proximoEnvioEm(agora, 0)).toISOString(),
  });
  if (error) throw error;
  if (data !== "ok") return { ok: false, ...(RECUSAS_DO_INICIO[data] ?? { status: 422 as const, erro: "Não deu para iniciar." }) };
  return { ok: true, situacao: await situacaoAgora(svc, id) };
}

export async function pausarCampanha(svc: Supa, admin: string, id: string): Promise<RespostaDaAcao> {
  const { data, error } = await svc.rpc("prospeccao_pausar_campanha", { p_quem: admin, p_id: id, p_motivo: null });
  if (error) throw error;
  if (data === "nao_encontrada") return { ok: false, ...RECUSAS_DO_INICIO.nao_encontrada };
  return { ok: true, situacao: await situacaoAgora(svc, id) };
}

export async function retomarCampanha(svc: Supa, admin: string, id: string, agora: number): Promise<RespostaDaAcao> {
  const hoje = await enviadosHoje(svc, id, agora);
  const { data, error } = await svc.rpc("prospeccao_retomar_campanha", {
    p_quem: admin,
    p_id: id,
    p_agora: new Date(agora).toISOString(),
    p_proximo: new Date(proximoEnvioEm(agora, hoje)).toISOString(),
  });
  if (error) throw error;
  if (data === "nao_encontrada") return { ok: false, ...RECUSAS_DO_INICIO.nao_encontrada };
  return { ok: true, situacao: await situacaoAgora(svc, id) };
}

// ── A busca na fonte ─────────────────────────────────────────────────────

export async function criarBusca(
  svc: Supa,
  a: { admin: string; id: string; opcoes: OpcoesDaBusca; fonte: string; execucao: string },
): Promise<void> {
  const { error } = await svc.rpc("prospeccao_criar_busca", {
    p_quem: a.admin,
    p_id: a.id,
    p_termo: a.opcoes.termos.join(", "),
    p_cidade: a.opcoes.cidade,
    p_uf: a.opcoes.uf,
    p_fonte: a.fonte,
    p_execucao: a.execucao,
    p_opcoes: paraJson(a.opcoes),
  });
  if (error) throw error;
}

/**
 * Fecha uma busca que ainda está "buscando", pelo que a FONTE diz da execução
 * (nunca pelo corpo do webhook): rodando = deixa para depois; falhou = grava o
 * motivo e nada mais; pronta = traduz, aplica as opções do nosso lado e grava
 * (`prospeccao_concluir_busca` deduplica e é idempotente). Devolve a situação.
 */
export async function fecharBusca(svc: Supa, fonte: FonteDeLeads, buscaId: string): Promise<SituacaoDaBusca | null> {
  const { data: b, error } = await svc
    .from("prospeccao_buscas")
    .select("id, termo, cidade, uf, status, opcoes, fonte_execucao_id")
    .eq("id", buscaId)
    .maybeSingle();
  if (error) throw error;
  if (!b) return null;
  if (b.status !== "buscando") return situacaoDaBusca(b.status);
  if (!b.fonte_execucao_id) {
    await concluir(svc, b.id, null, "A busca começou sem o identificador da fonte.");
    return "falhou";
  }
  const leitura = await fonte.lerExecucao(b.fonte_execucao_id);
  if (leitura.situacao === "rodando") return "buscando";
  if (leitura.situacao === "falhou") {
    await concluir(svc, b.id, null, leitura.motivo);
    return "falhou";
  }
  const opcoes = opcoesDoJson(b.opcoes, b.termo, b.cidade, b.uf);
  const termo = opcoes.termos[0] ?? b.termo;
  const itens = filtrarPelasOpcoes(
    leitura.itens.map((i) => fonte.mapearItem(i, termo)),
    opcoes,
  );
  await concluir(svc, b.id, itens.map(itemParaOBanco), null);
  return "pronta";
}

/** Desiste de uma busca que a fonte não fechou a tempo (a linha sai de "buscando" com o motivo). */
export function desistirDaBusca(svc: Supa, buscaId: string): Promise<void> {
  return concluir(svc, buscaId, null, "A fonte não respondeu a tempo. Nada foi gravado; dá para buscar de novo.");
}

async function concluir(svc: Supa, buscaId: string, itens: ReturnType<typeof itemParaOBanco>[] | null, erro: string | null) {
  const { error } = await svc.rpc("prospeccao_concluir_busca", { p_busca: buscaId, p_itens: itens ?? [], p_erro: erro });
  if (error) throw error;
}

/** A resposta de uma leitura ou escrita que falhou no banco ou na fonte (o detalhe só no log). */
export function falhou(onde: string, e: unknown): Response {
  console.error(`campanhas, ${onde}:`, e);
  return Response.json({ error: `falha ao ${onde}` }, { status: 500 });
}

/** 400 com o motivo (parâmetro torto). */
export const torto = (motivo: string): Response => Response.json({ error: motivo }, { status: 400 });
