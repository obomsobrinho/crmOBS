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

test("no celular a conexão é pelo QR, com o caminho do computador escrito", async ({ page }) => {
  // ⚠️ REESCRITO EM 17/10/2026. O código de pareamento (padrão no celular desde
  // 24/09) foi desligado: o WhatsApp recusa o código da Evolution 2.3.7
  // (docs/adr/2026-10-17-pairing-code-off-qr-only.md). O celular mostra o QR (um
  // chip em outro aparelho lê daqui) e diz para abrir no computador.
  await page.goto("/design/montagem?passo=conectar");
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
