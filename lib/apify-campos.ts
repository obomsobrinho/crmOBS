import { normalizar } from "./clientes";
import { localDaBusca } from "./municipios";
import {
  custoMinimoDaBuscaUsd,
  lerHorarios,
  pontuarLead,
  siteDoLead,
  telefoneDoLead,
  tipoDoTelefone,
  type DetalhesDoLead,
  type DistribuicaoDasNotas,
  type OpcoesDaBusca,
} from "./prospeccao";
import type { ItemDaFonteDeLeads, LeituraDaExecucao } from "./fonte-de-leads";

// OS CAMPOS DO APIFY, puro (sem I/O, testável): a entrada do actor
// `compass/crawler-google-places`, a tradução de um lugar do dataset num lead e o
// estado de uma execução. A chamada HTTP mora em `lib/fonte-apify.ts`.
//
// Os filtros pagos do actor (US$ 0,001 por empresa cada: nota mínima, site,
// categoria) NÃO vão na entrada (revisão do dono, 30/10/2026): o dado já vem em
// todo item, então `filtrarPelasOpcoes` filtra do nosso lado, de graça. A exceção
// é a categoria quando o dono marca "Só desta categoria" (31/10/2026): vai como
// `categoryFilterWords`, para a fonte não trazer (e cobrar) o lugar de outra
// categoria, e é conferida do nosso lado também.
//
// Desde 02/11/2026 a busca nova vai SEM termo: `allPlacesNoSearchAction` traz todas
// as empresas visíveis no mapa da área, até o teto, e só pula as fechadas na fonte
// (o único filtro pago que o dono quis). O resto se filtra na tabela de leads.

/**
 * As categorias principais do Google que nunca viram cliente: a busca sem termo traz tudo da área, praça e
 * ponto de ônibus também (05/11/2026). A lista é do dono. Para acrescentar, use o nome que a fonte traz em
 * `categoryName`, nunca um palpite. Vale só para busca nova: lead que já está na base não sai.
 */
export const CATEGORIAS_DESCARTADAS = [
  "Ponto de ônibus",
  "Marco histórico",
  "Ginásio poliesportivo",
  "Universidade pública",
  "Igreja católica",
  "Parque",
  "Escola pública",
  "Centro médico público",
  "Correios",
  "Atração turística",
] as const;

const DESCARTADAS = new Set<string>(CATEGORIAS_DESCARTADAS.map(normalizar));

export const ACTOR_APIFY = "compass/crawler-google-places";

/** O nome de um lugar que veio sem nome (o mesmo do SQL): fica na base, nunca entra numa mensagem. */
export const NOME_AUSENTE = "Sem nome";

/** O modo "todas as empresas visíveis no mapa" do actor (o outro valor, por mouse, está obsoleto). */
export const TODAS_AS_EMPRESAS = "all_places_no_search_ocr";

/** A entrada do actor para as opções do diálogo "Nova busca". */
export function entradaApify(o: OpcoesDaBusca): Record<string, unknown> {
  const termos = o.termos.map((t) => t.trim()).filter(Boolean);
  return {
    ...(termos.length > 0 ? { searchStringsArray: termos } : { allPlacesNoSearchAction: TODAS_AS_EMPRESAS }),
    // Com o centro ou o raio ajustados no mapa, o círculo e NÃO a cidade (formato conferido
    // numa execução real em 30/10/2026, run Rfb0VfmDckdMIbiwT: LONGITUDE primeiro).
    ...(o.area
      ? { customGeolocation: { type: "Point", coordinates: [o.area.lng, o.area.lat], radiusKm: o.area.raioKm } }
      : { locationQuery: localDaBusca(o) }),
    ...(o.categorias.length > 0 ? { categoryFilterWords: o.categorias } : {}),
    maxCrawledPlacesPerSearch: o.porTermo,
    language: "pt-BR",
    skipClosedPlaces: o.ignorarFechados,
    scrapeContacts: o.buscarContatos,
  };
}

/** O mínimo que o actor aceita em `maxTotalChargeUsd` (`minimalMaxTotalChargeUsd`, API pública, 02/11/2026). */
export const GASTO_MINIMO_DA_EXECUCAO_USD = 0.5;

/** O teto de gasto da execução: o custo máximo da busca pelo preço de tabela, nunca abaixo do mínimo do actor. */
export function tetoDeGastoUsd(o: OpcoesDaBusca): number {
  return Math.max(GASTO_MINIMO_DA_EXECUCAO_USD, Math.ceil(custoMinimoDaBuscaUsd(o) * 100) / 100);
}

/**
 * Os webhooks ad hoc de uma execução: vão na QUERY `webhooks` em base64 (o corpo
 * do POST é a entrada do actor). O segredo vai num header, nunca na URL. Sem
 * `payloadTemplate`: a rota não lê o corpo, pergunta à fonte como a execução terminou.
 */
export function webhooksDaExecucao(url: string, segredo: string): string {
  const def = [
    {
      eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
      requestUrl: url,
      headersTemplate: JSON.stringify({ "x-apify-secret": segredo }),
    },
  ];
  return Buffer.from(JSON.stringify(def), "utf8").toString("base64");
}

/** A situação de uma execução pelo `status` do Apify. */
export function leituraDoStatus(status: string | null | undefined): LeituraDaExecucao | null {
  if (status === "SUCCEEDED") return null;
  if (status === "READY" || status === "RUNNING" || status === "TIMING-OUT" || status === "ABORTING") return { situacao: "rodando" };
  return { situacao: "falhou", motivo: textoDaFalha(status) };
}

/** A frase da falha, para a linha da busca. */
function textoDaFalha(status: string | null | undefined): string {
  if (status === "TIMED-OUT") return "A fonte passou do tempo. Nada foi gravado; dá para buscar de novo.";
  if (status === "ABORTED") return "A busca foi interrompida na fonte. Nada foi gravado.";
  return "A fonte não terminou a busca. Nada foi gravado; dá para buscar de novo.";
}

function texto(o: Record<string, unknown>, chaves: string[]): string | null {
  for (const k of chaves) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function numero(o: Record<string, unknown>, chaves: string[]): number | null {
  for (const k of chaves) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function distribuicaoDe(v: unknown): DistribuicaoDasNotas | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : 0);
  const d = { 1: n("oneStar"), 2: n("twoStar"), 3: n("threeStar"), 4: n("fourStar"), 5: n("fiveStar") };
  return Object.values(d).some((x) => x > 0) ? d : null;
}

function textos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
}

/** O @ de um perfil do Instagram (`instagram.com/fulano`), ou null. */
function arrobaDoInstagram(urls: string[]): string | null {
  for (const u of urls) {
    const m = u.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
    if (m && !["p", "reel", "explore", "stories"].includes(m[1].toLowerCase())) return `@${m[1]}`;
  }
  return null;
}

/** O que a fonte traz de graça e a ficha mostra (`location`, `claimThisBusiness`, horário, notas, fotos, categorias). */
export function detalhesDoApify(o: Record<string, unknown>): DetalhesDoLead {
  const loc = o.location !== null && typeof o.location === "object" ? (o.location as Record<string, unknown>) : {};
  const coord = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const principal = texto(o, ["categoryName"]);
  const categorias = [...new Set([...(principal ? [principal] : []), ...textos(o.categories)])];
  return {
    lat: coord(loc.lat),
    lng: coord(loc.lng),
    reivindicado: typeof o.claimThisBusiness === "boolean" ? !o.claimThisBusiness : null,
    horarios: lerHorarios(o.openingHours),
    distribuicao: distribuicaoDe(o.reviewsDistribution),
    fotos: numero(o, ["imagesCount"]),
    categorias,
    endereco: texto(o, ["address"]),
    instagram: arrobaDoInstagram(textos(o.instagrams)),
  };
}

/**
 * Um lugar do dataset virando lead. Campos de saída do actor (página do Apify Store,
 * 29/10/2026): `title`, `categoryName`, `address`, `neighborhood`, `city`,
 * `phone`/`phoneUnformatted`, `website`, `totalScore`, `reviewsCount`, `placeId`,
 * `permanentlyClosed`, `searchString`. `termo` é o segmento quando o lugar não traz nenhum dos dois.
 */
export function itemDoApify(bruto: unknown, termo: string): ItemDaFonteDeLeads {
  const o = bruto !== null && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
  const telefone = texto(o, ["phoneUnformatted", "phone"]);
  const site = texto(o, ["website"]);
  const notaBruta = numero(o, ["totalScore"]);
  const nota = notaBruta !== null && notaBruta > 0 && notaBruta <= 5 ? Math.round(notaBruta * 10) / 10 : null;
  const reviews = numero(o, ["reviewsCount"]);
  const avaliacoes = reviews !== null && reviews >= 0 ? Math.round(reviews) : null;
  // Sem categoria, o segmento é o termo que achou o lugar (`searchString`), ou o primeiro pedido
  // (uma busca sem termo não tem: fica sem segmento).
  const segmento = texto(o, ["categoryName", "searchString"]) ?? (termo.trim() || null);
  const detalhes = detalhesDoApify(o);
  const { pontos } = pontuarLead({ telefone, segmento: segmento ?? "", site, nota, avaliacoes, reivindicado: detalhes.reivindicado, horarios: detalhes.horarios });
  return {
    telefone: telefoneDoLead(telefone),
    telefone_original: telefone,
    tipo_telefone: telefone ? tipoDoTelefone(telefone) : null,
    fonte_id: texto(o, ["placeId"]),
    nome: texto(o, ["title"]) ?? NOME_AUSENTE,
    segmento,
    endereco: texto(o, ["address"]),
    bairro: texto(o, ["neighborhood"]),
    cidade: texto(o, ["city"]),
    site,
    site_classe: siteDoLead(site),
    nota,
    avaliacoes,
    pontuacao: pontos,
    fechado: o.permanentlyClosed === true,
    descartavel: DESCARTADAS.has(normalizar(texto(o, ["categoryName"]) ?? "")),
    detalhes,
  };
}
