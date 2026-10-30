import "server-only";
import {
  pontuarLead,
  siteDoLead,
  telefoneDoLead,
  tipoDoTelefone,
  type FiltroDeSiteDaBusca,
  type NotaMinima,
  type OpcoesDaBusca,
} from "./prospeccao";
import type { FonteDeLeads, InicioDaBusca, ItemDaFonteDeLeads } from "./fonte-de-leads";

const ACTOR = "compass/crawler-google-places";
const ACTOR_PATH = "compass~crawler-google-places";

/** Apify actor input fields read on 2026-10-29; star/website enum values marked TODO until a real run. */
export function entradaApify(opcoes: OpcoesDaBusca): Record<string, unknown> {
  const locationQuery = opcoes.uf ? `${opcoes.cidade}, ${opcoes.uf}, Brazil` : `${opcoes.cidade}, Brazil`;
  const placeMinimumStars = mapNotaMinima(opcoes.notaMinima);
  const website = mapFiltroSite(opcoes.site);
  return {
    searchStringsArray: opcoes.termos.map((t) => t.trim()).filter(Boolean),
    locationQuery,
    maxCrawledPlacesPerSearch: opcoes.porTermo,
    language: "pt-BR",
    skipClosedPlaces: opcoes.ignorarFechados,
    scrapeContacts: opcoes.buscarContatos,
    ...(placeMinimumStars !== undefined ? { placeMinimumStars } : {}),
    ...(website !== undefined ? { website } : {}),
  };
}

function mapNotaMinima(n: NotaMinima): string | undefined {
  if (n === null) return undefined;
  // TODO: confirm accepted values on a real Apify run (schema only shows "").
  return String(n);
}

function mapFiltroSite(f: FiltroDeSiteDaBusca): string | undefined {
  if (f === "todos") return undefined;
  // TODO: confirm on real run; schema example is "allPlaces".
  return f === "sem_site" ? "withoutWebsite" : "withWebsite";
}

function apiBase() {
  return "https://api.apify.com/v2";
}

async function apifyFetch(path: string, init?: RequestInit) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN missing");
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${apiBase()}${path}${sep}token=${encodeURIComponent(token)}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<unknown>;
}

export const fonteApify: FonteDeLeads = {
  id: ACTOR,

  async iniciar(buscaId, opcoes, webhookUrl) {
    const body = {
      ...entradaApify(opcoes),
      webhooks: [
        {
          eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
          requestUrl: webhookUrl,
          payloadTemplate: `{"buscaId":"${buscaId}","runId":"{{resource.id}}","status":"{{resource.status}}","datasetId":"{{resource.defaultDatasetId}}","eventType":"{{eventType}}"}`,
        },
      ],
    };
    const data = (await apifyFetch(`/acts/${ACTOR_PATH}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })) as { data?: { id?: string } };
    const execucaoId = data.data?.id;
    if (!execucaoId) throw new Error("Apify run id missing");
    return { fonte: ACTOR, execucaoId };
  },

  async lerDataset(execucaoId) {
    const run = (await apifyFetch(`/actor-runs/${execucaoId}`)) as {
      data?: { defaultDatasetId?: string; status?: string };
    };
    const ds = run.data?.defaultDatasetId;
    if (!ds) return [];
    const items = (await apifyFetch(`/datasets/${ds}/items?clean=true&format=json`)) as unknown;
    return Array.isArray(items) ? items : [];
  },

  mapearItem(bruto, termo) {
    const o = bruto as Record<string, unknown>;
    const phoneRaw = pickStr(o, ["phone", "phoneUnformatted", "phoneNumber"]);
    const tipo = tipoDoTelefone(phoneRaw);
    const tel = telefoneDoLead(phoneRaw);
    const site = pickStr(o, ["website", "url"]);
    const siteClasse = siteDoLead(site);
    const nota = pickNum(o, ["totalScore", "rating", "stars"]);
    const avaliacoes = pickInt(o, ["reviewsCount", "reviews"]);
    const segmento = pickStr(o, ["categoryName", "category"]) ?? termo;
    const pontos = pontuarLead({ telefone: phoneRaw, segmento, site, nota, avaliacoes }).pontos;
    return {
      telefone: tel,
      telefone_original: phoneRaw,
      tipo_telefone: tipo,
      fonte_id: pickStr(o, ["placeId", "place_id", "cid"]),
      nome: pickStr(o, ["title", "name"]) ?? "Sem nome",
      segmento,
      endereco: pickStr(o, ["address", "street"]),
      bairro: pickStr(o, ["neighborhood", "district"]),
      cidade: pickStr(o, ["city", "location", "municipality"]),
      site,
      site_classe: siteClasse,
      nota,
      avaliacoes,
      pontuacao: pontos,
    };
  },
};

function pickStr(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickNum(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function pickInt(o: Record<string, unknown>, keys: string[]): number | null {
  const n = pickNum(o, keys);
  return n === null ? null : Math.round(n);
}

export type { InicioDaBusca, ItemDaFonteDeLeads };
