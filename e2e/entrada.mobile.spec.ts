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

test("no celular a conexão abre pelo número, com o QR como alternativa", async ({ page }) => {
  // ⚠️ REESCRITO EM 24/09/2026. Era o cartão "Está neste celular?", que só
  // dizia que o QR precisava de outro aparelho. Agora o celular conecta pelo
  // número (código de pareamento da Evolution), e o QR vira o link de troca.
  await page.goto("/design/montagem?passo=conectar");
  await page.waitForLoadState("networkidle");
  const campo = page.getByRole("textbox", { name: "Número do WhatsApp" });
  await expect(campo).toBeVisible();
  await expect(campo).toHaveAttribute("inputmode", "tel");
  await expect(page.getByRole("button", { name: "Gerar código" })).toBeDisabled();
  await page.locator('[data-slot="trocar-modo-conexao"]').click();
  await expect(page.getByText("Clique em Conectar para gerar o QR.")).toBeVisible();
});
