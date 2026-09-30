import { test, expect } from "@playwright/test";

// Pedidos no CELULAR (29/09/2026). É onde o link do aviso abre, então é o
// caminho mais comum de todos: a pessoa toca no aviso no WhatsApp.

test("Pedidos está na barra de baixo, e a ficha aberta cabe na tela", async ({ page }) => {
  await page.goto("/design/pedidos?abrir=1");
  const barra = page.locator('[data-slot="barra-abas"]');
  await expect(barra.getByRole("link", { name: /Pedidos/ })).toHaveAttribute("aria-current", "page");
  await expect(barra.getByRole("link", { name: /Pipeline/ })).toHaveCount(0);

  const detalhe = page.locator('[data-slot="pedido-detalhe"][data-pedido="1"]');
  await expect(detalhe).toBeVisible();
  // Sem rolagem lateral da página.
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largura).toBeLessThanOrEqual(375);
  // No celular é uma tela por vez: com a ficha aberta a lista some, e o
  // "Pedidos" do topo volta para ela.
  await expect(page.locator('[data-slot="pedidos-lista"]')).toBeHidden();
  await detalhe.getByRole("button", { name: "Pedidos" }).click();
  await expect(page.locator('[data-slot="pedidos-lista"]')).toBeVisible();
});
