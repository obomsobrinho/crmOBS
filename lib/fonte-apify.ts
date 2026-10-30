import "server-only";
import { ACTOR_APIFY, entradaApify, itemDoApify, leituraDoStatus, webhooksDaExecucao } from "./apify-campos";
import type { FonteDeLeads } from "./fonte-de-leads";

// A FONTE DE LEADS DE HOJE: o actor `compass/crawler-google-places` no Apify
// (docs/plano-campanhas.md, seção 6). Só a chamada HTTP mora aqui; os campos e a
// tradução são puros (`lib/apify-campos.ts`). `APIFY_TOKEN` é do servidor, vai no
// header (nunca na URL, que aparece em log) e nunca ao navegador.

const API = "https://api.apify.com/v2";
const ACTOR_NA_URL = ACTOR_APIFY.replace("/", "~");

async function apify(caminho: string, init: RequestInit = {}): Promise<unknown> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN ausente");
  const res = await fetch(`${API}${caminho}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return res.json();
}

function dadosDe(r: unknown): Record<string, unknown> {
  const d = r !== null && typeof r === "object" ? (r as { data?: unknown }).data : null;
  return d !== null && typeof d === "object" ? (d as Record<string, unknown>) : {};
}

export const fonteApify: FonteDeLeads = {
  id: ACTOR_APIFY,

  async iniciar(opcoes, webhook) {
    const q = new URLSearchParams({ webhooks: webhooksDaExecucao(webhook.url, webhook.segredo) });
    const r = dadosDe(
      await apify(`/acts/${ACTOR_NA_URL}/runs?${q}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entradaApify(opcoes)),
      }),
    );
    if (typeof r.id !== "string") throw new Error("Apify sem id da execução");
    return { fonte: ACTOR_APIFY, execucaoId: r.id };
  },

  async lerExecucao(execucaoId) {
    const run = dadosDe(await apify(`/actor-runs/${encodeURIComponent(execucaoId)}`));
    const status = typeof run.status === "string" ? run.status : null;
    const leitura = leituraDoStatus(status);
    if (leitura) return leitura;
    const ds = typeof run.defaultDatasetId === "string" ? run.defaultDatasetId : null;
    if (!ds) return { situacao: "pronta", itens: [] };
    const itens = await apify(`/datasets/${encodeURIComponent(ds)}/items?clean=true&format=json`);
    return { situacao: "pronta", itens: Array.isArray(itens) ? itens : [] };
  },

  mapearItem: itemDoApify,
};
