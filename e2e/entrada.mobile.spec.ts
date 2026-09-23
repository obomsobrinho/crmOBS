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

test("no QR, o aviso de celular vem ANTES do código", async ({ page }) => {
  await page.goto("/design/montagem?passo=conectar");
  await page.waitForLoadState("networkidle");
  const aviso = page.locator('[data-slot="aviso-celular"]');
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText("Está neste celular?");
  const qr = await page.getByText("Clique em Conectar para gerar o QR.").boundingBox();
  const a = await aviso.boundingBox();
  expect(a!.y).toBeLessThan(qr!.y);
});
