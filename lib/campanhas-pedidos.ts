import { ehUuid } from "./admin-acesso";
import type { CampanhaEditavel, FiltroDeContatos, FiltroDosLeads, RecorteDosLeads } from "@/components/admin/campanhas/tipos";
import {
  MINIMOS_DE_AVALIACOES,
  QUANTIDADES_POR_TERMO,
  RAIOS_KM,
  type AreaDaBusca,
  UFS,
  type FiltroDeSiteDaBusca,
  type NotaMinima,
  type OpcoesDaBusca,
  type SituacaoDaBusca,
  type SituacaoDaCampanha,
  type SituacaoNaCampanha,
} from "./prospeccao";

// OS PEDIDOS DAS ROTAS DE CAMPANHAS, conferidos (puro, sem I/O, testável): cada
// parâmetro e cada corpo que chega a `/api/admin/campanhas/*` passa por aqui, e o
// que não confere vira 400, nunca 500 (regra da central, admin.md).

const SITUACOES_DA_BUSCA: SituacaoDaBusca[] = ["buscando", "pronta", "falhou"];
const SITUACOES_DA_CAMPANHA: SituacaoDaCampanha[] = ["rascunho", "agendada", "rodando", "pausada", "concluida"];
export const SITUACOES_NA_CAMPANHA: SituacaoNaCampanha[] = ["na_fila", "enviado", "respondeu", "falhou", "parou"];
const FILTROS_DOS_LEADS: FiltroDosLeads[] = ["nao_contatados", "bons", "nao_reivindicado"];
const SITES: FiltroDeSiteDaBusca[] = ["todos", "sem_site", "com_site"];
const NOTAS: NotaMinima[] = [null, 3.5, 4, 4.5];
/** Teto de categorias marcadas no filtro da tabela (a lista do recorte tem até 200). */
const MAXIMO_DE_CATEGORIAS = 30;
export { SITUACOES_DA_BUSCA, SITUACOES_DA_CAMPANHA };

/** Um id (uuid) bem formado: a mesma regra das rotas da central (`ehUuid`). */
export const ehId = (v: unknown): v is string => typeof v === "string" && ehUuid(v);

/** Um campo do corpo JSON de um pedido (undefined quando o corpo não é um objeto). */
export function campoDe(corpo: unknown, campo: string): unknown {
  return corpo !== null && typeof corpo === "object" ? (corpo as Record<string, unknown>)[campo] : undefined;
}

const de = <T extends string>(lista: readonly T[], v: unknown): v is T => typeof v === "string" && (lista as readonly string[]).includes(v);
export const ehSituacaoDaBusca = (v: unknown): v is SituacaoDaBusca => de(SITUACOES_DA_BUSCA, v);
export const ehSituacaoDaCampanha = (v: unknown): v is SituacaoDaCampanha => de(SITUACOES_DA_CAMPANHA, v);
export const ehSituacaoNaCampanha = (v: unknown): v is SituacaoNaCampanha => de(SITUACOES_NA_CAMPANHA, v);
export const ehFiltroDosLeads = (v: unknown): v is FiltroDosLeads => de(FILTROS_DOS_LEADS, v);

/** A página pedida (1 em diante); null quando não é um inteiro válido. */
export function paginaDe(v: string | null): number | null {
  if (v === null || v === "") return 1;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 1 && n <= 100_000 ? n : null;
}

/** O texto de busca, aparado e com teto (vai a um `like` no SQL, que escapa os curingas). */
export const textoDe = (v: string | null) => (v ?? "").trim().slice(0, 100);

/**
 * O recorte da tabela de leads na query (`?busca=&texto=&cidade=&filtros=a,b&site=&nota=&avaliacoes=&categorias=[json]`),
 * o mesmo da página e da "página do lead"; o motivo (string) quando algo veio torto.
 */
export function recorteDe(q: URLSearchParams): RecorteDosLeads | string {
  const busca = q.get("busca");
  if (busca !== null && !ehId(busca)) return "busca inválida";
  const filtros = (q.get("filtros") ?? "").split(",").filter(Boolean);
  if (!filtros.every(ehFiltroDosLeads)) return "filtro inválido";
  const site = q.get("site") ?? "todos";
  if (!de(SITES, site)) return "filtro de site inválido";
  const nota = NOTAS.find((n) => String(n) === (q.get("nota") ?? "null"));
  if (nota === undefined) return "nota inválida";
  const minAvaliacoes = MINIMOS_DE_AVALIACOES.find((m) => String(m) === (q.get("avaliacoes") ?? "null"));
  if (minAvaliacoes === undefined) return "mínimo de avaliações inválido";
  let categorias: unknown = [];
  try {
    categorias = JSON.parse(q.get("categorias") ?? "[]");
  } catch {
    return "categorias inválidas";
  }
  if (!Array.isArray(categorias) || categorias.length > MAXIMO_DE_CATEGORIAS || !categorias.every((c) => typeof c === "string" && c.length <= 120)) {
    return "categorias inválidas";
  }
  const cidade = q.get("cidade");
  return {
    buscaId: busca,
    texto: textoDe(q.get("texto")),
    cidade: cidade ? cidade.slice(0, 120) : null,
    filtros,
    site,
    notaMinima: nota,
    minAvaliacoes,
    categorias: categorias as string[],
  };
}

/** O recorte na query da rota (o par de `recorteDe`: o que um escreve, o outro lê). */
export function recorteParaQuery(p: RecorteDosLeads): Record<string, string | null> {
  return {
    busca: p.buscaId,
    texto: p.texto,
    cidade: p.cidade,
    filtros: p.filtros.join(","),
    site: p.site === "todos" ? null : p.site,
    nota: p.notaMinima === null ? null : String(p.notaMinima),
    avaliacoes: p.minAvaliacoes === null ? null : String(p.minAvaliacoes),
    categorias: p.categorias.length > 0 ? JSON.stringify(p.categorias) : null,
  };
}

/**
 * A área ajustada no mapa: null (a cidade inteira), um círculo válido, ou undefined
 * quando veio torta. Centro dentro de uma caixa larga em volta do Brasil; raio da lista.
 */
export function areaDe(v: unknown): AreaDaBusca | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const { lat, lng, raioKm } = o;
  if (typeof lat !== "number" || typeof lng !== "number" || typeof raioKm !== "number") return undefined;
  if (lat < -34 || lat > 6 || lng < -74.5 || lng > -28.5) return undefined;
  if (!(RAIOS_KM as readonly number[]).includes(raioKm)) return undefined;
  return { lat, lng, raioKm };
}

/** As opções da "Nova busca" vindas do navegador, conferidas campo a campo; null quando algo está fora. */
export function opcoesDe(v: unknown): OpcoesDaBusca | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const termos = Array.isArray(o.termos) ? o.termos.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 80)) : null;
  // Sem termo é o padrão (todas as empresas da área); o nome é livre e pode vir vazio.
  if (!termos || termos.length > 10) return null;
  if (typeof o.nome !== "string") return null;
  if (typeof o.cidade !== "string" || typeof o.uf !== "string" || !(UFS as readonly string[]).includes(o.uf)) return null;
  if (!(QUANTIDADES_POR_TERMO as readonly unknown[]).includes(o.porTermo)) return null;
  if (!NOTAS.includes(o.notaMinima as NotaMinima) || !SITES.includes(o.site as FiltroDeSiteDaBusca)) return null;
  if (typeof o.ignorarFechados !== "boolean" || typeof o.buscarContatos !== "boolean") return null;
  if (o.cidadeIbge !== null && (typeof o.cidadeIbge !== "number" || !Number.isInteger(o.cidadeIbge))) return null;
  const minimo = MINIMOS_DE_AVALIACOES.find((m) => m === o.minAvaliacoes);
  if (minimo === undefined) return null;
  const categorias = Array.isArray(o.categorias) ? o.categorias.filter((c): c is string => typeof c === "string").map((c) => c.trim().slice(0, 60)) : null;
  if (!categorias || categorias.length > 10) return null;
  const area = areaDe(o.area);
  if (area === undefined) return null;
  return {
    nome: o.nome.trim().slice(0, 80),
    termos: termos.filter(Boolean),
    cidade: o.cidade.trim().slice(0, 80),
    uf: o.uf,
    cidadeIbge: o.cidadeIbge,
    area,
    porTermo: o.porTermo as number,
    notaMinima: o.notaMinima as NotaMinima,
    site: o.site as FiltroDeSiteDaBusca,
    minAvaliacoes: minimo,
    categorias: categorias.filter(Boolean),
    ignorarFechados: o.ignorarFechados,
    buscarContatos: o.buscarContatos,
  };
}

/** O recorte do passo Contatos vindo do navegador (ou do jsonb salvo); null quando algo está fora. */
export function filtroDe(v: unknown): FiltroDeContatos | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const buscaId = o.buscaId === "todas" || o.buscaId === "" || ehId(o.buscaId) ? o.buscaId : null;
  const origem = o.quemNaoRespondeuDe === null || o.quemNaoRespondeuDe === undefined ? null : ehId(o.quemNaoRespondeuDe) ? o.quemNaoRespondeuDe : undefined;
  if (buscaId === null || origem === undefined) return null;
  return {
    buscaId,
    soMarcadosComoBons: o.soMarcadosComoBons === true,
    soSemSiteProprio: o.soSemSiteProprio === true,
    quemNaoRespondeuDe: origem,
    incluirJaContatados: o.incluirJaContatados === true,
  };
}

/** O rascunho vindo do assistente, conferido; null quando algo está fora. */
export function rascunhoDe(id: string, v: unknown): Omit<CampanhaEditavel, "situacao" | "criadaEm" | "salvaEm"> | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const filtro = filtroDe(o.filtro);
  const variantes = Array.isArray(o.variantes) ? o.variantes : null;
  if (typeof o.nome !== "string" || o.nome.length > 120 || !filtro) return null;
  if (o.conexaoId !== null && !ehId(o.conexaoId)) return null;
  if (o.agendadaPara !== null && (typeof o.agendadaPara !== "number" || !Number.isFinite(o.agendadaPara))) return null;
  if (typeof o.passo !== "number" || !Number.isInteger(o.passo) || o.passo < 1 || o.passo > 4) return null;
  if (!variantes || variantes.length > 3 || variantes.some((t) => typeof t !== "string" || t.length > 1000)) return null;
  return {
    id,
    nome: o.nome,
    conexaoId: o.conexaoId,
    agendadaPara: o.agendadaPara,
    filtro,
    passo: o.passo,
    variantes: variantes as string[],
  };
}

