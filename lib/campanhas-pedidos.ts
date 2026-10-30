import type { CampanhaEditavel, FiltroDeContatos, FiltroDosLeads } from "@/components/admin/campanhas/tipos";
import {
  QUANTIDADES_POR_TERMO,
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
const FILTROS_DOS_LEADS: FiltroDosLeads[] = ["nao_contatados", "bons", "sem_site", "nota"];
export { SITUACOES_DA_BUSCA, SITUACOES_DA_CAMPANHA };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

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

/** As opções da "Nova busca" vindas do navegador, conferidas campo a campo; null quando algo está fora. */
export function opcoesDe(v: unknown): OpcoesDaBusca | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const termos = Array.isArray(o.termos) ? o.termos.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 80)) : null;
  const notas: NotaMinima[] = [null, 3.5, 4, 4.5];
  const sites: FiltroDeSiteDaBusca[] = ["todos", "sem_site", "com_site"];
  if (!termos || termos.length === 0 || termos.length > 10) return null;
  if (typeof o.cidade !== "string" || typeof o.uf !== "string" || !(UFS as readonly string[]).includes(o.uf)) return null;
  if (!(QUANTIDADES_POR_TERMO as readonly unknown[]).includes(o.porTermo)) return null;
  if (!notas.includes(o.notaMinima as NotaMinima) || !sites.includes(o.site as FiltroDeSiteDaBusca)) return null;
  if (typeof o.ignorarFechados !== "boolean" || typeof o.buscarContatos !== "boolean") return null;
  return {
    termos,
    cidade: o.cidade.trim().slice(0, 80),
    uf: o.uf,
    porTermo: o.porTermo as number,
    notaMinima: o.notaMinima as NotaMinima,
    site: o.site as FiltroDeSiteDaBusca,
    ignorarFechados: o.ignorarFechados,
    buscarContatos: o.buscarContatos,
  };
}

/** O recorte do passo Contatos vindo do navegador (ou do jsonb salvo); null quando algo está fora. */
export function filtroDe(v: unknown): FiltroDeContatos | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const buscaId = o.buscaId === "todas" || ehId(o.buscaId) ? o.buscaId : null;
  const origem = o.quemNaoRespondeuDe === null || o.quemNaoRespondeuDe === undefined ? null : ehId(o.quemNaoRespondeuDe) ? o.quemNaoRespondeuDe : undefined;
  if (buscaId === null || origem === undefined) return null;
  return { buscaId, soMarcadosComoBons: o.soMarcadosComoBons === true, soSemSiteProprio: o.soSemSiteProprio === true, quemNaoRespondeuDe: origem };
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

