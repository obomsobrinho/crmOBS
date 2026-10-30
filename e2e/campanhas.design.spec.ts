import { test, expect } from "@playwright/test";

// CAMPANHAS na tela (docs/plano-campanhas.md), no preview com dados de mentira
// (`/design/campanhas`, a fonte em memória com a MESMA interface da página de
// verdade): páginas numeradas, busca e marcação, a busca nova que termina sozinha,
// o assistente que trava sem {empresa} e o pausar do detalhe. E as travas sem
// login: as rotas da central dão 404, o webhook e o cron recusam sem segredo, a
// página manda para o login. Prova layout e comportamento da tela, nunca o banco.

const ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

test.describe("Campanhas sem login", () => {
  test("as rotas /api/admin/campanhas respondem 404 a quem não é admin, sem revelar nada", async ({ request }) => {
    for (const r of [
      "/api/admin/campanhas",
      "/api/admin/campanhas/totais",
      "/api/admin/campanhas/conexoes",
      "/api/admin/campanhas/buscas",
      `/api/admin/campanhas/buscas/${ID}`,
      "/api/admin/campanhas/leads",
      "/api/admin/campanhas/resumo",
      "/api/admin/campanhas/resultados",
      "/api/admin/campanhas/previa",
      `/api/admin/campanhas/${ID}`,
      `/api/admin/campanhas/${ID}/leads`,
    ]) {
      expect((await request.get(r, { maxRedirects: 0 })).status(), r).toBe(404);
    }
    expect((await request.post("/api/admin/campanhas/buscas", { data: {}, maxRedirects: 0 })).status()).toBe(404);
    expect((await request.put(`/api/admin/campanhas/${ID}/acao`, { data: { acao: "iniciar" }, maxRedirects: 0 })).status()).toBe(404);
    expect((await request.put(`/api/admin/campanhas/leads/${ID}`, { data: { marcacao: "bom" }, maxRedirects: 0 })).status()).toBe(404);
  });

  test("o webhook da fonte e o cron recusam sem o segredo", async ({ request }) => {
    expect((await request.post(`/api/prospeccao/apify?busca=${ID}`, { data: {} })).status()).toBe(401);
    expect(
      (await request.post(`/api/prospeccao/apify?busca=${ID}`, { data: {}, headers: { "x-apify-secret": "chute" } })).status(),
    ).toBe(401);
    expect((await request.get("/api/prospeccao/cron")).status()).toBe(401);
    expect((await request.get("/api/prospeccao/cron", { headers: { authorization: "Bearer chute" } })).status()).toBe(401);
  });

  test("a página /campanhas sem sessão vai para o login", async ({ request }) => {
    const r = await request.get("/campanhas", { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    expect(r.headers().location).toContain("/login");
  });
});

test.describe("Campanhas no preview", () => {
  test("Leads: páginas numeradas de 10, a outra página e a busca pelo nome no servidor da fonte", async ({ page }) => {
    await page.goto("/design/campanhas?tela=leads");
    const buscas = page.locator('[data-slot="buscas-rodape"] [data-slot="paginacao-texto"]');
    await expect(buscas).toHaveText("Mostrando 1 a 10 de 14");
    await expect(page.locator('[data-slot="busca-linha"]')).toHaveCount(10);
    await page.locator('[data-slot="buscas-rodape"] [data-slot="paginacao-proxima"]').click();
    await expect(buscas).toHaveText("Mostrando 11 a 14 de 14");
    await expect(page.locator('[data-slot="busca-linha"]')).toHaveCount(4);

    await page.locator('[data-slot="leads-ver-todos"]').click();
    const leads = page.locator('[data-slot="leads-rodape"] [data-slot="paginacao-texto"]');
    await expect(leads).toContainText("Mostrando 1 a 10 de");
    await page.getByRole("textbox", { name: "Buscar lead pelo nome ou telefone" }).fill("Bella Pele");
    await expect(page.locator('[data-slot="lead-linha"]')).toHaveCount(1);
    await expect(leads).toHaveText("Mostrando 1 a 1 de 1");
  });

  test("marcar como bom muda só a linha, e desmarcar volta", async ({ page }) => {
    await page.goto("/design/campanhas?tela=busca");
    const linha = page.locator('[data-slot="lead-linha"]').first();
    const bom = linha.locator('[data-slot="lead-marcar-bom"]');
    const antes = await bom.getAttribute("aria-pressed");
    await bom.click();
    await expect(bom).toHaveAttribute("aria-pressed", antes === "true" ? "false" : "true");
    await bom.click();
    await expect(bom).toHaveAttribute("aria-pressed", antes ?? "false");
  });

  test("Nova busca entra como Buscando e fica Pronta sozinha (a tabela relê a linha que roda)", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/design/campanhas?tela=leads");
    await page.locator('[data-slot="leads-nova-busca"]').click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("textbox", { name: "Segmento" }).fill("pet shop");
    await dialogo.getByRole("textbox", { name: "Segmento" }).press("Enter");
    await dialogo.getByRole("textbox", { name: "Cidade" }).fill("Mutum");
    await dialogo.getByRole("combobox", { name: "Estado" }).click();
    await page.getByRole("option", { name: "MG" }).click();
    await dialogo.getByRole("button", { name: "Buscar", exact: true }).click();
    const nova = page.locator('[data-slot="busca-linha"]', { hasText: "pet shop" });
    await expect(nova).toContainText("Buscando");
    await expect(nova).toContainText("Pronta", { timeout: 30_000 });
  });

  test("o assistente trava a mensagem sem {empresa} e põe a linha de saída na prévia", async ({ page }) => {
    await page.goto("/design/campanhas?tela=campanhas");
    await page.locator('[data-slot="campanhas-nova"]').click();
    await page.getByRole("textbox", { name: "Nome da campanha" }).fill("Teste do assistente");
    await page.locator('[data-slot="assistente-continuar"]').click();
    await expect(page.locator('[data-secao="quem"]')).toContainText(/\d+ leads?, \d+ dias?/);
    await page.locator('[data-slot="assistente-continuar"]').click();
    const variante = page.getByRole("textbox", { name: "Texto da variante 1" });
    await expect(page.getByText("Se não quiser receber mais mensagens, é só responder SAIR.").first()).toBeVisible();
    await variante.fill("Oi, tudo bem? Posso te mostrar uma coisa?");
    await expect(page.getByText("Falta {empresa} no texto.")).toBeVisible();
    await expect(page.locator('[data-slot="assistente-continuar"]')).toBeDisabled();
    await variante.fill("Oi, vi a {empresa} no Google.");
    await expect(page.locator('[data-slot="assistente-continuar"]')).toBeEnabled();
    await expect(page.locator('[data-slot="assistente-salvo"]')).toContainText("Salvo");
  });

  test("o detalhe pausa e retoma", async ({ page }) => {
    await page.goto("/design/campanhas?tela=campanha");
    const botao = page.locator('[data-slot="campanha-pausar"]');
    await expect(botao).toHaveText(/Pausar/);
    await botao.click();
    await expect(botao).toHaveText(/Retomar/);
    await botao.click();
    await expect(botao).toHaveText(/Pausar/);
    await expect(page.locator('[data-slot="campanha-leads-rodape"] [data-slot="paginacao-texto"]')).toContainText("Mostrando 1 a 10 de");
  });

  test("cenário vazio: os estados vazios dizem o próximo passo", async ({ page }) => {
    await page.goto("/design/campanhas?cenario=vazio&tela=leads");
    await expect(page.getByText("Nenhuma busca ainda")).toBeVisible();
    await page.locator('[data-slot="campanhas-aba-campanhas"]').click();
    await expect(page.getByText("Nenhuma campanha ainda")).toBeVisible();
  });
});
