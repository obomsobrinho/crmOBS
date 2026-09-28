import { test, expect } from "@playwright/test";

// O PEDIDO DE AJUDA MORA NA CAIXA DE ESCRITA (27/09/2026, desenho aprovado pelo
// dono): com pedido aberto, a caixa vira o pedido, com a fila ("1 de 2"), e a
// conversa não tem âmbar. Fechado, o pedido vira uma linha de histórico na
// conversa. Prévia `/design?handoff=...`, sem banco.

test("aberto: a caixa vira o pedido, abre em orientar, com a fila e o Resolvido", async ({ page }) => {
  await page.goto("/design?handoff=aberto");
  const caixa = page.locator('[data-slot="pedido-caixa"]');
  await expect(caixa).toContainText("A IA pediu sua ajuda");
  // O mais antigo primeiro.
  await expect(caixa).toContainText("valor do plano anual");
  await expect(caixa.locator('[data-slot="pedido-posicao"]')).toContainText("1 de 2");
  await expect(caixa.getByRole("textbox", { name: "Orientação para a IA" })).toBeVisible();
  await expect(caixa.locator('[data-slot="composer-modo"]')).toContainText("Orientar a IA");
  await expect(caixa.getByRole("button", { name: "Resolvido" })).toBeVisible();
  await expect(caixa.getByRole("button", { name: "Enviar orientação" })).toHaveAttribute(
    "data-variant",
    "warn"
  );
  // A conversa não tem cartão aberto, e a faixa do topo não resolve nada.
  await expect(page.locator('[data-slot="handoff-cartao"]')).toHaveCount(0);
  await expect(
    page.locator('[data-slot="conversa-entendimento"]').getByRole("button", { name: /Resolvido|Ver pedido/ })
  ).toHaveCount(0);
});

test("o seletor troca para Responder sem perder o pedido, e não oferece nota", async ({
  page,
}) => {
  await page.goto("/design?handoff=aberto");
  await page.waitForTimeout(600);
  const caixa = page.locator('[data-slot="pedido-caixa"]');
  await caixa.locator('[data-slot="composer-modo"]').click();
  await expect(page.getByRole("menuitem", { name: /Nota interna/ })).toHaveCount(0);
  await page.getByRole("menuitem", { name: /Responder/ }).click();
  // Uma visão só: o pedido continua em cima, e o Resolvido ao lado.
  await expect(caixa).toContainText("valor do plano anual");
  await expect(caixa.locator('[data-slot="composer-modo"]')).toContainText("Responder");
  await expect(caixa.getByRole("textbox", { name: "Escreva uma mensagem" })).toBeVisible();
  await expect(caixa.getByRole("button", { name: "Resolvido" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Voltar ao pedido|Eu respondo/ })).toHaveCount(0);
});

test("resolvido: vira linha de histórico, e a caixa volta ao normal", async ({ page }) => {
  await page.goto("/design?handoff=resolvido");
  const linhas = page.locator('[data-slot="handoff-cartao"][data-estado="fechado"]');
  await expect(linhas).toHaveCount(2);
  await expect(linhas.first()).toContainText("resolvido com a sua orientação");
  await expect(linhas.first()).toContainText("Orientação:");
  await expect(linhas.last()).toContainText("resolvido pelo time");
  await expect(page.locator('[data-slot="pedido-caixa"]')).toHaveCount(0);
});
