import { test, expect, type Page } from "@playwright/test";
import { servico, tenantDeTeste } from "./semente";

// A LISTA DE CONVERSAS CONTRA O BANCO DE VERDADE (refeito em 01/10/2026,
// docs/plano-carregamento.md, fase 1): paginada de 10 em 10, busca no servidor
// com debounce, realtime linha a linha e aba escondida parada.
//
// Testes que afirmam AUSÊNCIA ("abrir não busca", "aba escondida não busca"),
// por isso no projeto `logado-serial`, com um worker só.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE, e a lição vale para todo teste futuro de "isto
// NÃO deve acontecer": a asserção "abrir o inbox provoca ZERO buscas" já
// recebeu 5 no dia em que a suíte do pipeline passou a escrever em
// `conversations` no MESMO tenant. Afirmar ausência num tenant compartilhado com
// escritores concorrentes é afirmar algo que o produto nunca prometeu.
//
// O teste conta REQUISIÇÃO às funções do banco (`inbox_pagina`,
// `inbox_contagens`), e não pixel, porque o defeito que ele trava é a busca a
// mais (ou a menos).
//
// SEMENTE: 25 conversas com número impossível (DDD 00), todas de hoje, apagadas
// no fim.

const PREFIXO = "55000000020";
const fone = (n: number) => `${PREFIXO}${String(n).padStart(2, "0")}@s.whatsapp.net`;
const NOME = (n: number) => `Conversa paginada ${String(n).padStart(2, "0")}`;
let clientId = "";

async function apagar() {
  const svc = servico();
  await svc.from("conversations").delete().like("phone", `${PREFIXO}%`);
  await svc.from("dados_cliente").delete().like("telefone", `${PREFIXO}%`);
}

test.beforeAll(async () => {
  clientId = (await tenantDeTeste(servico())).clientId;
  await apagar();
  const svc = servico();
  const agora = Date.now();
  const { error: e1 } = await svc.from("dados_cliente").insert(
    Array.from({ length: 25 }, (_, i) => ({
      client_id: clientId,
      telefone: fone(i + 1),
      display_name: NOME(i + 1),
      atendimento_ia: "ativa",
    }))
  );
  if (e1) throw e1;
  // Minutos atrás, para todas caírem em "Hoje" e em ordem conhecida (01 é a
  // mais recente).
  const { error: e2 } = await svc.from("conversations").insert(
    Array.from({ length: 25 }, (_, i) => ({
      client_id: clientId,
      phone: fone(i + 1),
      last_message_at: new Date(agora - (i + 1) * 60_000).toISOString(),
      last_message_preview: `mensagem ${i + 1}`,
      last_message_from: "in",
    }))
  );
  if (e2) throw e2;
});

test.afterAll(apagar);

function contar(page: Page) {
  const c = { pagina: 0, linha: 0, contagens: 0 };
  page.on("request", (r) => {
    if (r.method() !== "POST") return;
    if (r.url().includes("/rest/v1/rpc/inbox_pagina")) {
      const corpo = r.postDataJSON() as { p_telefone?: string | null };
      if (corpo?.p_telefone) c.linha++;
      else c.pagina++;
    }
    if (r.url().includes("/rest/v1/rpc/inbox_contagens")) c.contagens++;
  });
  return c;
}

const itens = (page: Page) =>
  page.locator('[data-slot="inbox-item"]', { hasText: "Conversa paginada" });

async function abrir(page: Page) {
  await page.goto("/inbox");
  await expect(itens(page).first()).toBeVisible({ timeout: 30_000 });
  // O realtime precisa estar assinado para os testes de evento.
  await page.waitForTimeout(3_000);
}

test("abrir a lista não busca nada; ela chega do servidor com 10", async ({ page }) => {
  const c = contar(page);
  await abrir(page);
  expect(c.pagina + c.linha + c.contagens, "o servidor acabou de entregar a lista").toBe(0);
  await expect(page.locator('[data-slot="inbox-item"]')).toHaveCount(10);
  await expect(itens(page).first()).toContainText(NOME(1));
});

test("rolar até o fim traz de 10 em 10, sem repetir nem pular", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  const c = contar(page);
  await abrir(page);
  const lista = page.locator("aside [data-radix-scroll-area-viewport]").first();
  // Rola até não haver mais página (o marcador do fim some).
  for (let i = 0; i < 6 && (await page.locator('[data-slot="inbox-mais"]').count()) > 0; i++) {
    const antes = await page.locator('[data-slot="inbox-item"]').count();
    await lista.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect
      .poll(async () => (await page.locator('[data-slot="inbox-mais"]').count()) === 0 ||
        (await page.locator('[data-slot="inbox-item"]').count()) > antes, { timeout: 15_000 })
      .toBe(true);
  }
  const nomes = await itens(page).locator("span.truncate.text-corpo").allInnerTexts();
  expect(nomes).toEqual(Array.from({ length: 25 }, (_, i) => NOME(i + 1)));
  const total = await page.locator('[data-slot="inbox-item"]').count();
  // Uma busca a cada 10, e nenhuma repetida.
  expect(c.pagina).toBe(Math.ceil(total / 10) - 1);
});

test("mensagem nova atualiza SÓ a linha dela, que sobe para o topo", async ({ page }) => {
  const c = contar(page);
  await abrir(page);
  await servico()
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), last_message_preview: "acabou de chegar" })
    .eq("client_id", clientId)
    .eq("phone", fone(9));
  await expect(itens(page).first()).toContainText(NOME(9), { timeout: 15_000 });
  await expect(itens(page).first()).toContainText("acabou de chegar");
  await page.waitForTimeout(1_500);
  expect(c.linha, "busca a linha que mudou").toBeGreaterThanOrEqual(1);
  expect(c.pagina, "nunca recarrega a lista inteira por um evento").toBe(0);
});

test("aba escondida não busca; ao voltar, revalida uma vez", async ({ page }) => {
  const c = contar(page);
  await abrir(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await servico()
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), last_message_preview: "chegou com a aba escondida" })
    .eq("client_id", clientId)
    .eq("phone", fone(12));
  await page.waitForTimeout(4_000);
  expect(c.pagina + c.linha + c.contagens, "aba escondida não busca nada").toBe(0);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(itens(page).first()).toContainText("chegou com a aba escondida", { timeout: 15_000 });
  expect(c.pagina).toBe(1);
});

test("voltar o foco revalida (rede de segurança do realtime), no máximo uma vez a cada 10s", async ({ page }) => {
  const c = contar(page);
  await abrir(page);
  await page.waitForTimeout(8_000); // passa a janela de 10s desde a abertura
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => c.pagina, { timeout: 10_000 }).toBe(1);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(2_000);
  expect(c.pagina, "foco e visibilitychange juntos não duplicam").toBe(1);
});

test("a busca vai ao servidor só depois de parar de digitar, e ignora a janela", async ({ page }) => {
  const c = contar(page);
  await abrir(page);
  await page.getByLabel("Buscar conversas e mensagens").pressSequentially("paginada 23", { delay: 40 });
  await expect(itens(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(itens(page).first()).toContainText(NOME(23));
  expect(c.pagina, "uma busca, não uma por letra").toBe(1);
});
