import { test, expect, type Page } from "@playwright/test";

// A casca do app no CELULAR (plano do mobile, fase 0, 23/09/2026). Roda no
// projeto `mobile` (375x812, toque), sobre as telas /design, sem login.
//
// O que se prova aqui é a ESTRUTURA: o trilho some, a barra de abas aparece
// embaixo e a folha "Mais" leva ao resto. Cada tela tem o próprio spec depois.

const barra = (page: Page) => page.locator('[data-slot="barra-abas"]');

test("o trilho some e a barra de abas aparece embaixo", async ({ page }) => {
  await page.goto("/design/painel");
  await expect(barra(page)).toBeVisible();
  // O trilho do desktop continua no DOM (é o mesmo componente), mas escondido.
  await expect(page.getByRole("link", { name: "Equipe" })).toBeHidden();

  const caixa = await barra(page).boundingBox();
  const vh = page.viewportSize()!.height;
  expect(Math.round(caixa!.y + caixa!.height)).toBeGreaterThanOrEqual(vh - 1);

  // Quatro alvos, nenhum abaixo de 44px de altura (toque).
  const alvos = barra(page).locator(":scope > a, :scope > button");
  await expect(alvos).toHaveCount(4);
  for (const h of await alvos.evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().height)
  ))
    expect(h).toBeGreaterThanOrEqual(44);
  await expect(barra(page).getByRole("link", { name: /Painel/ })).toHaveAttribute(
    "aria-current",
    "page"
  );
});

test("a folha Mais leva a Equipe, Perfil, tema, feedback e sair", async ({ page }) => {
  await page.goto("/design/painel");
  await barra(page).getByRole("button", { name: /Mais/ }).click();
  const folha = page.locator('[data-slot="sheet-content"]');
  await expect(folha).toBeVisible();
  for (const nome of ["Equipe", "Perfil"])
    await expect(folha.getByRole("link", { name: nome })).toBeVisible();
  await expect(folha.getByRole("button", { name: "Enviar feedback" })).toBeVisible();
  await expect(folha.getByRole("button", { name: "Sair" })).toBeVisible();
  // "Em breve" continua sem ação.
  await expect(folha.getByText("Agenda")).toBeVisible();

  // A folha sobe da borda de baixo, não da direita.
  const f = await folha.boundingBox();
  const vh = page.viewportSize()!.height;
  expect(Math.round(f!.y + f!.height)).toBeGreaterThanOrEqual(vh - 1);
  expect(Math.round(f!.x)).toBe(0);

  // O tema é uma chave, e ela troca o tema de verdade.
  const antes = await page.evaluate(() => document.documentElement.dataset.theme);
  await folha.getByRole("switch", { name: /Tema escuro/ }).click();
  const depois = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(depois).not.toBe(antes);
});

test("dentro do Agente a barra de abas some", async ({ page }) => {
  // Tela de trabalho: a barra de salvar mora onde a barra de abas moraria.
  await page.goto("/design/agente");
  await expect(barra(page)).toHaveCount(0);
});
