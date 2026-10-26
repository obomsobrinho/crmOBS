import { test, expect } from "@playwright/test";

// Entrada, montagem e conexão no CELULAR (plano do mobile, fase 5, 23/09/2026).

test("login sem moldura de cartão e com campos de 44px", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const form = page.locator("form");
  const borda = await form.evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(borda).toBe("0px");
  for (const nome of ["E-mail", "Senha"]) {
    const caixa = await page.getByLabel(nome, { exact: true }).boundingBox();
    expect(caixa!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
});

test("na tela de conexão o celular vê o QR, com o caminho do computador escrito", async ({ page }) => {
  // ⚠️ REESCRITO EM 17/10/2026. O código de pareamento (padrão no celular desde
  // 24/09) foi desligado: o WhatsApp recusa o código da Evolution 2.3.7
  // (docs/adr/2026-10-17-pairing-code-off-qr-only.md). O celular mostra o QR (um
  // chip em outro aparelho lê daqui) e diz para abrir no computador.
  // Desde 23/10/2026 isto vale para a tela `/connect`; a montagem para antes.
  await page.goto("/design/connect?tela=1");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("textbox", { name: "Número do WhatsApp" })).toHaveCount(0);
  await expect(page.locator('[data-slot="trocar-modo-conexao"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="conectar-pelo-computador"]')).toContainText(
    "abra esta página no computador"
  );
  // O botão diz o que faz (26/09/2026, dono): era "Conectar WhatsApp" e só
  // gerava o QR.
  await expect(page.getByRole("button", { name: "Gerar QR code" })).toBeVisible();
});

test("na montagem o passo 4 no celular é uma parada: Continue no computador", async ({ page }) => {
  // 23/10/2026 (dono): era um aviso no meio da tela, depois de a pessoa ter
  // investido tudo. Agora é uma parada clara, com o porquê e o link para levar.
  await page.goto("/design/montagem?passo=conectar");
  await page.waitForLoadState("networkidle");
  const parada = page.locator('[data-slot="montagem-parada-computador"]');
  await expect(parada.getByRole("heading", { name: "Continue no computador" })).toBeVisible();
  await expect(parada).toContainText("O QR code precisa aparecer numa tela para o celular da empresa ler");
  await expect(parada).toContainText("a montagem continua deste passo");
  await expect(parada.locator('[data-slot="parada-link"]')).toHaveText(/\/montagem$/);
  // Copiar sempre; compartilhar só onde o navegador tem `navigator.share`.
  const temShare = await page.evaluate(() => typeof navigator.share === "function");
  await expect(parada.getByRole("button", { name: "Copiar o link" })).toBeVisible();
  await expect(parada.getByRole("button", { name: "Compartilhar o link" })).toHaveCount(temShare ? 1 : 0);
  // O QR não aparece antes de a pessoa pedir.
  await expect(page.getByRole("button", { name: "Gerar QR code" })).toHaveCount(0);
  await expect(page.locator('[data-slot="passos-conexao"]')).toHaveCount(0);

  // Quem tem o WhatsApp da empresa em outro aparelho lê daqui mesmo, sem o
  // aviso de abrir no computador (ele acabou de dizer que não precisa).
  await parada.locator('[data-slot="parada-mostrar-qr"]').click();
  await expect(parada).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Gerar QR code" })).toBeVisible();
  await expect(page.locator('[data-slot="conectar-pelo-computador"]')).toHaveCount(0);
  // Conectar continua não ligando o agente.
  await expect(page.getByRole("button", { name: "Continuar", exact: true })).toBeDisabled();
});

test("no celular a abertura já diz que o fim é no computador", async ({ page }) => {
  await page.goto("/design/montagem");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-slot="abertura-computador"]')).toContainText(
    "Você está no celular: dá para fazer os três primeiros passos aqui e terminar no computador."
  );
});

test("a revisão antes de ativar cabe no celular, uma linha por item", async ({ page }) => {
  await page.goto("/design/montagem?passo=avisos&avisos=1");
  await page.waitForLoadState("networkidle");
  const item = page.locator('[data-slot="revisao-item"][data-item="regras"]');
  // Uma linha por item (26/10/2026): o botão fica na mesma linha do título.
  await expect(item.getByRole("button", { name: "Adicionar" })).toBeVisible();
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(sobra).toBeLessThanOrEqual(0);
  // O painel sobe como folha de baixo no celular.
  await item.getByRole("button", { name: "Adicionar" }).click();
  const painel = page.locator('[data-slot="sheet-content"]');
  await expect(painel).toBeVisible();
  await expect(painel.locator('[data-slot="sheet-alca"]')).toHaveCount(1);
});
