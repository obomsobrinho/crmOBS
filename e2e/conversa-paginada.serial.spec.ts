import { test, expect, type Page } from "@playwright/test";
import { servico, tenantDeTeste } from "./semente";

// CONVERSA ABERTA PAGINADA (01/10/2026, docs/plano-carregamento.md, fase 4).
//
// Abre com as 30 mensagens mais recentes; rolar para cima busca as 30
// anteriores sem a mensagem que a pessoa lia sair do lugar; mensagem nova entra
// pela linha do realtime, sem baixar a conversa de novo.
//
// SEMENTE: uma conversa de 70 mensagens com número impossível (DDD 00), só de
// entrada, minuto a minuto, apagada no fim. Nada vai ao WhatsApp.

const FONE = "5500000000501@s.whatsapp.net";
const msg = (n: number) => `Mensagem paginada número ${String(n).padStart(2, "0")}`;
let clientId = "";

async function apagar() {
  const svc = servico();
  await svc.from("chat_messages").delete().eq("phone", FONE);
  await svc.from("conversations").delete().eq("phone", FONE);
  await svc.from("dados_cliente").delete().eq("telefone", FONE);
}

test.beforeAll(async () => {
  clientId = (await tenantDeTeste(servico())).clientId;
  await apagar();
  const svc = servico();
  await svc.from("dados_cliente").insert({
    client_id: clientId,
    telefone: FONE,
    display_name: "Conversa longa (e2e)",
    atendimento_ia: "ativa",
  });
  const base = Date.now() - 2 * 3_600_000;
  const { error } = await svc.from("chat_messages").insert(
    Array.from({ length: 70 }, (_, i) => ({
      client_id: clientId,
      phone: FONE,
      nomewpp: "Conversa longa (e2e)",
      user_message: msg(i + 1),
      created_at: new Date(base + i * 60_000).toISOString(),
    }))
  );
  if (error) throw error;
});

test.afterAll(apagar);

const baloes = (page: Page) => page.locator("main").getByText(/Mensagem paginada número \d\d/);

test("abre com as 30 mais recentes e busca as anteriores ao subir, sem pular", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(`/inbox/${encodeURIComponent(FONE)}`);
  await expect(page.locator("main").getByText(msg(70))).toBeVisible({ timeout: 30_000 });
  await expect(baloes(page)).toHaveCount(30);
  await expect(page.locator("main").getByText(msg(40))).toHaveCount(0);
  // A página precisa estar hidratada: rolar antes disso é desfeito pela rolagem
  // inicial até a última mensagem.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_500);

  const area = page.locator("main [data-radix-scroll-area-viewport]").first();
  // Sobe até o topo: vem a página anterior (11 a 40)...
  await area.evaluate((el) => el.scrollTo({ top: 0 }));
  await expect(baloes(page)).toHaveCount(60, { timeout: 15_000 });
  // ...e a mensagem que estava no topo (41) continua à vista: a tela não pulou
  // para o começo da página nova.
  await expect(page.locator("main").getByText(msg(41))).toBeInViewport();

  await area.evaluate((el) => el.scrollTo({ top: 0 }));
  await expect(baloes(page)).toHaveCount(70, { timeout: 15_000 });
  await expect(page.locator('[data-slot="conversa-antigas"]')).toHaveCount(0);
});

test("mensagem nova entra pela linha, sem baixar a conversa de novo", async ({ page }) => {
  let buscas = 0;
  page.on("request", (r) => {
    if (r.method() === "GET" && r.url().includes("/rest/v1/chat_messages")) buscas++;
  });
  await page.goto(`/inbox/${encodeURIComponent(FONE)}`);
  await expect(page.locator("main").getByText(msg(70))).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4_000); // realtime assinado
  buscas = 0;
  await servico().from("chat_messages").insert({
    client_id: clientId,
    phone: FONE,
    nomewpp: "Conversa longa (e2e)",
    user_message: "Chegou agora pelo realtime",
  });
  await expect(page.locator("main").getByText("Chegou agora pelo realtime")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1_500);
  expect(buscas, "a mensagem nova não baixa a conversa de novo").toBe(0);
});
