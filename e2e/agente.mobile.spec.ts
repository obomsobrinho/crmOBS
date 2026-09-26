import { test, expect } from "@playwright/test";

// Agente no CELULAR (plano do mobile, fase 4, 23/09/2026). Projeto `mobile`,
// /design/agente sem login.

test.beforeEach(async ({ page }) => {
  await page.goto("/design/agente");
  await page.waitForLoadState("networkidle");
});

test("cabeçalho com voltar e chave; o resto mora nos três pontos", async ({ page }) => {
  await expect(page.getByRole("link", { name: "Voltar" })).toBeVisible();
  // Os botões do desktop não aparecem soltos no celular.
  await expect(page.getByRole("button", { name: "Ver prompt" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Testar o agente" })).toBeHidden();
  const mais = page.locator('[data-slot="agente-mais"]');
  await expect(async () => {
    await mais.click();
    await expect(page.getByRole("menu")).toBeVisible({ timeout: 1500 });
  }).toPass();
  const menu = page.getByRole("menu");
  for (const nome of [/Testar o agente/, /Ver prompt/, /Escrever o prompt|Voltar ao formulário/])
    await expect(menu.getByRole("menuitem", { name: nome })).toBeVisible();
  await menu.getByRole("menuitem", { name: /Ver prompt/ }).click();
  await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible();
});

test("a barra de salvar fica presa embaixo e as abas presas em cima", async ({ page }) => {
  const salvar = page.getByRole("button", { name: /^Salvar$/ });
  await expect(salvar).toBeInViewport();
  const aba = page.getByRole("tab", { name: "Quem atende" });
  // Rola o cartão até o fim: as abas continuam na tela.
  await page.locator('[data-slot="card"]').last().evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(aba).toBeInViewport();
  await expect(salvar).toBeInViewport();
});

test("a bancada separa conversa e diagnóstico em abas", async ({ page }) => {
  await expect(async () => {
    await page.locator('[data-slot="agente-mais"]').click();
    await expect(page.getByRole("menu")).toBeVisible({ timeout: 1500 });
  }).toPass();
  await page.getByRole("menuitem", { name: /Testar o agente/ }).click();
  const bancada = page.getByRole("tablist", { name: "Bancada" });
  await expect(bancada).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Mensagem de teste" })).toBeVisible();
  await bancada.getByRole("tab", { name: "Diagnóstico" }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem de teste" })).toBeHidden();
});
