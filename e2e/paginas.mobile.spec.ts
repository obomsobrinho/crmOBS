import { test, expect } from "@playwright/test";

// Painel, Equipe e Assinatura no CELULAR (plano do mobile, fase 2, 23/09/2026).
// Projeto `mobile`, telas /design sem login. Perfil exige login e fica de fora.

test("painel em uma coluna: 'precisa de você' logo depois da manchete", async ({ page }) => {
  await page.goto("/design/painel");
  await page.waitForLoadState("networkidle");
  const manchete = await page.getByText("O que a IA fez por você", { exact: false }).first().boundingBox();
  const fila = await page.getByText("Precisa de você", { exact: false }).first().boundingBox();
  const operacao = await page.getByRole("heading", { name: "A operação" }).boundingBox();
  expect(fila!.y).toBeGreaterThan(manchete!.y);
  expect(fila!.y).toBeLessThan(operacao!.y);
  // Os cartões da operação ficam em 2x2 e nada vaza pela borda.
  const cartoes = page.locator('[data-slot="stat"].painel-cartao');
  const xs = await cartoes.evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().right)),
  );
  for (const x of xs) expect(x).toBeLessThanOrEqual(375);
});

test("equipe: remover mora no menu da linha e abre a confirmação", async ({ page }) => {
  await page.goto("/design/equipe");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: /^Remover / })).toHaveCount(0);
  await page.getByRole("button", { name: /Ações para/ }).first().click();
  await page.getByRole("menuitem", { name: "Remover do time" }).click();
  await expect(page.getByRole("heading", { name: "Remover do time?" })).toBeVisible();
});

test("assinatura: o botão de pagar fica preso embaixo da tela", async ({ page }) => {
  await page.goto("/design/assinatura");
  await page.waitForLoadState("networkidle");
  const botao = page.getByRole("button", { name: /Ir para o pagamento|Trocar para este plano/ });
  await expect(botao).toBeInViewport();
  const caixa = await botao.boundingBox();
  expect(caixa!.y + caixa!.height).toBeLessThanOrEqual(812);
  expect(caixa!.y + caixa!.height).toBeGreaterThan(812 - 80);
});
