import { pontuarLead, siteDoLead, telefoneDoLead, tipoDoTelefone, type NotaMinima, type OpcoesDaBusca } from "./prospeccao";
import type { ItemDaFonteDeLeads, LeituraDaExecucao } from "./fonte-de-leads";

// OS CAMPOS DO APIFY, puro (sem I/O, testável): a entrada do actor
// `compass/crawler-google-places`, a tradução de um lugar do dataset num lead e o
// estado de uma execução. A chamada HTTP mora em `lib/fonte-apify.ts`.
//
// ⚠️ A CONFIRMAR NUMA EXECUÇÃO REAL (o esquema de entrada lido em 29/10/2026 não
// lista os valores aceitos): `placeMinimumStars` e `website`. Usamos os nomes do
// formulário do actor; se a fonte ignorar, `filtrarPelasOpcoes` aplica os
// mesmos filtros do nosso lado, então a base nunca recebe o que ficou de fora.

export const ACTOR_APIFY = "compass/crawler-google-places";

/** O nome de um lugar que veio sem nome (o mesmo do SQL): fica na base, nunca entra numa mensagem. */
export const NOME_AUSENTE = "Sem nome";

const ESTRELAS: Record<Exclude<NotaMinima, null>, string> = {
  3.5: "threeAndHalf",
  4: "four",
  4.5: "fourAndHalf",
};

const SITE: Record<OpcoesDaBusca["site"], string> = {
  todos: "allPlaces",
  sem_site: "withoutWebsite",
  com_site: "withWebsite",
};

/** A entrada do actor para as opções do diálogo "Nova busca". */
export function entradaApify(o: OpcoesDaBusca): Record<string, unknown> {
  return {
    searchStringsArray: o.termos.map((t) => t.trim()).filter(Boolean),
    locationQuery: `${o.cidade.trim()}, ${o.uf}, Brasil`,
    maxCrawledPlacesPerSearch: o.porTermo,
    language: "pt-BR",
    skipClosedPlaces: o.ignorarFechados,
    scrapeContacts: o.buscarContatos,
    website: SITE[o.site],
    ...(o.notaMinima !== null ? { placeMinimumStars: ESTRELAS[o.notaMinima] } : {}),
  };
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
  // Sem categoria, o segmento é o termo que achou o lugar (`searchString`), ou o primeiro pedido.
  const segmento = texto(o, ["categoryName", "searchString"]) ?? termo;
  const { pontos } = pontuarLead({ telefone, segmento, site, nota, avaliacoes });
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
  };
}
