import { test, expect } from "@playwright/test";

// Conversas no CELULAR (plano do mobile, fase 1, 23/09/2026). Projeto `mobile`,
// telas /design sem login: `/design?lista=1` é o /inbox (só a lista) e
// `/design` é o /inbox/[id] (só a conversa).
//
// ⚠️ A navegação de verdade (tocar na lista abre a conversa) exige login, porque
// o link leva a /inbox/[id]. Aqui se prova o arranjo de cada tela e que os
// controles do cabeçalho chamam o que deviam.

test("em /inbox só a lista aparece, com a barra de abas", async ({ page }) => {
  await page.goto("/design?lista=1");
  await expect(page.getByRole("heading", { name: "Conversas" })).toBeVisible();
  await expect(page.locator("[data-inbox-vazio]")).toBeHidden();
  await expect(page.locator('[data-slot="barra-abas"]')).toBeVisible();
  // Os chips não reenvolvem: ficam numa faixa só, que rola para o lado.
  const tops = await page
    .locator('[data-slot="inbox-chip"]')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

test("com a conversa aberta a lista some e o voltar leva a /inbox", async ({ page }) => {
  await page.goto("/design");
  await expect(page.getByRole("heading", { name: "Conversas" })).toBeHidden();
  await expect(page.locator('[data-slot="barra-abas"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="conversa-voltar"]')).toHaveAttribute("href", "/inbox");
  // A linha de estado substitui o telefone embaixo do nome.
  await expect(page.locator('[data-slot="conversa-estado"]')).toHaveText(/Você está atendendo/);
  await expect(page.locator('[data-slot="conversa-telefone"]')).toBeHidden();
  // A caixa de escrita cabe na tela, presa embaixo.
  const campo = page.getByRole("textbox", { name: "Escreva uma mensagem" });
  await expect(campo).toBeInViewport();
});

test("os três pontos trazem quem atende, a IA e os dados do contato", async ({ page }) => {
  await page.goto("/design");
  await page.locator('[data-slot="conversa-mais"]').click();
  const menu = page.getByRole("menu");
  await expect(menu.getByText("Quem atende")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /IA nesta conversa/ })).toBeVisible();
  await menu.getByRole("menuitem", { name: /Dados do contato/ }).click();
  const folha = page.locator('[data-slot="sheet-content"]');
  await expect(folha).toBeVisible();
  await expect(folha.getByText("Mensagens")).toBeVisible();
});

test("a pílula do modo troca o destino e a frase de contexto", async ({ page }) => {
  await page.goto("/design");
  const contexto = page.locator('[data-slot="composer-contexto"]');
  await expect(contexto).toHaveText(/Vai para o WhatsApp do cliente/);
  await page.locator('[data-slot="composer-modo"]').click();
  await page.getByRole("menuitem", { name: /Nota interna/ }).click();
  await expect(contexto).toHaveText("Só o time vê. O cliente não recebe.");
  await expect(page.locator('[data-slot="composer-modo"]')).toHaveText(/Nota interna/);
  // As abas do desktop ficam escondidas, não duplicadas.
  await expect(page.getByRole("tab", { name: /Nota interna/ })).toBeHidden();
});
