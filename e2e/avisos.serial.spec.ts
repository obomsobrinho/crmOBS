import fs from "node:fs";
import { test, expect } from "@playwright/test";
import {
  FONE_TESTE,
  NOME_TESTE,
  segredoDoAgente,
  semearConversa,
  servico,
  tenantDeTeste,
} from "./semente";

// AVISOS NO WHATSAPP, contra o banco de verdade (29/09/2026).
//
// ⚠️ NADA AQUI MANDA WHATSAPP. O "Mandar teste" (`notify-target/teste`) e o
// aviso de pedido de ajuda de verdade são o teste do dono com o chip. O que se
// prova aqui: as recusas da rota (todas voltam 400 ANTES de gravar), a lista de
// grupos (só leitura na Evolution) e a regra do número de avisos.
//
// ⚠️ SERIAL porque o último teste TROCA o destino de avisos do tenant de teste
// por alguns segundos (para o número impossível da conversa de teste) e
// devolve o original no fim, mesmo se falhar. Nesse intervalo, um aviso de
// reunião que o n8n mandasse iria para um número que não existe.

let clientId = "";

test.beforeAll(async () => {
  clientId = (await tenantDeTeste(servico())).clientId;
});

function lerEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    for (const linha of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // sem .env.local: o teste que precisa pula
  }
  return env;
}

/** Número conectado na instância, pela Evolution (só leitura), ou null. */
async function numeroDoAgente(instancia: string): Promise<string | null> {
  const env = lerEnvLocal();
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY) return null;
  try {
    const res = await fetch(
      `${env.EVOLUTION_API_URL}/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`,
      { headers: { apikey: env.EVOLUTION_API_KEY }, signal: AbortSignal.timeout(10_000) }
    );
    const data = (await res.json()) as { ownerJid?: string }[];
    const jid = data?.[0]?.ownerJid;
    return jid ? jid.split("@")[0].split(":")[0] : null;
  } catch {
    return null;
  }
}

test("a rota recusa destino inválido, e nenhuma recusa grava", async ({ page }) => {
  const svc = servico();
  const { data: antes } = await svc
    .from("clients")
    .select("notify_group_jid")
    .eq("id", clientId)
    .single();
  const url = `/api/clients/${clientId}/notify-target`;

  const grupoDigitado = await page.request.put(url, { data: { grupo: "time do escritório" } });
  expect(grupoDigitado.status()).toBe(400);
  const curto = await page.request.put(url, { data: { numero: "1234" } });
  expect(curto.status()).toBe(400);
  const osDois = await page.request.put(url, {
    data: { numero: "11 91234-5678", grupo: "120363000000000001@g.us" },
  });
  expect(osDois.status()).toBe(400);

  const { data: depois } = await svc
    .from("clients")
    .select("notify_group_jid")
    .eq("id", clientId)
    .single();
  expect(depois?.notify_group_jid).toBe(antes?.notify_group_jid);
});

test("o número do próprio agente é recusado", async ({ page }) => {
  const svc = servico();
  const { data: t } = await svc
    .from("clients")
    .select("evolution_instance, notify_group_jid")
    .eq("id", clientId)
    .single();
  const instancia = t?.evolution_instance as string | null;
  test.skip(!instancia, "tenant de teste sem instância");
  const dono = await numeroDoAgente(instancia!);
  test.skip(!dono, "a Evolution não disse qual é o número conectado");

  const res = await page.request.put(`/api/clients/${clientId}/notify-target`, {
    data: { numero: dono },
  });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(/número do próprio agente/);
  const { data: depois } = await svc
    .from("clients")
    .select("notify_group_jid")
    .eq("id", clientId)
    .single();
  expect(depois?.notify_group_jid).toBe(t?.notify_group_jid);
});

test("a lista de grupos vem do WhatsApp, com nome", async ({ page }) => {
  const res = await page.request.get(`/api/clients/${clientId}/notify-target`);
  // 409 = tenant sem instância; 502 = Evolution fora. Os dois são respostas
  // honestas que a tela sabe mostrar, mas não provam a lista.
  test.skip(res.status() !== 200, `a lista não veio (${res.status()})`);
  const { grupos } = (await res.json()) as { grupos: { jid: string; nome: string }[] };
  expect(Array.isArray(grupos)).toBe(true);
  for (const g of grupos) {
    expect(g.jid).toMatch(/@g\.us$/);
    expect(g.nome.length).toBeGreaterThan(0);
  }
});

test("o número de avisos nunca é atendido e some da lista de conversas", async ({
  page,
  request,
}) => {
  const svc = servico();
  await semearConversa(svc, clientId);
  const { data: t } = await svc
    .from("clients")
    .select("notify_group_jid")
    .eq("id", clientId)
    .single();
  const original = (t?.notify_group_jid as string | null) ?? null;

  try {
    // O destino passa a ser a própria conversa de teste.
    await svc
      .from("clients")
      .update({ notify_group_jid: `${FONE_TESTE}@s.whatsapp.net` })
      .eq("id", clientId);

    // 1. O cérebro fica mudo ANTES do modelo (nada de token, nada de pedido).
    const res = await request.post("/api/agent", {
      headers: { "x-lookup-secret": segredoDoAgente() },
      data: { client_id: clientId, phone: FONE_TESTE, message: "Oi, preciso falar com alguém" },
      timeout: 60_000,
    });
    expect(res.status(), await res.text()).toBe(200);
    const corpo = (await res.json()) as {
      output: { messages: string[]; action: string };
      diagnostics: { numeroDeAvisos?: boolean };
    };
    expect(corpo.diagnostics.numeroDeAvisos).toBe(true);
    expect(corpo.output.messages).toEqual([]);
    expect(corpo.output.action).toBe("none");

    // 2. E a conversa não aparece na lista, nem em "Tudo".
    await page.goto("/inbox");
    await page
      .locator('[data-slot="inbox-periodo-opcao"]', { hasText: "Tudo" })
      .click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(NOME_TESTE)).toHaveCount(0);
  } finally {
    await svc.from("clients").update({ notify_group_jid: original }).eq("id", clientId);
  }

  // Devolvido: a conversa volta a aparecer (prova que o sumiço era a regra).
  await page.goto("/inbox");
  await page.locator('[data-slot="inbox-periodo-opcao"]', { hasText: "Tudo" }).click();
  await expect(page.getByText(NOME_TESTE).first()).toBeVisible({ timeout: 15_000 });
});
