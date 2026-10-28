import { test, expect } from "@playwright/test";

// PROTÓTIPO DA AGENDA (docs/plano-agenda.md). Só as telas falsas de /design:
// nada aqui fala com o Google. Quando a Agenda for construída, a conta de
// horário livre ganha specs puras em lib/agenda.ts e estes testes passam a
// olhar a tela de verdade.

test.describe("Protótipo da Agenda", () => {
  test("lista os horários por dia, com o cancelado fora de Próximos", async ({ page }) => {
    await page.goto("/design/agenda");
    await expect(page.getByRole("heading", { name: "Agenda", level: 1 })).toBeVisible();
    await expect(page.locator('[data-agenda="dia"]').first()).toBeVisible();
    await expect(page.locator('[data-agenda="linha"][data-situacao="cancelado"]')).toHaveCount(0);
    await page.getByRole("tab", { name: "Cancelados" }).click();
    await expect(page.locator('[data-agenda="linha"][data-situacao="cancelado"]')).toHaveCount(1);
  });

  test("enviar lembrete marca a linha como lembrada", async ({ page }) => {
    await page.goto("/design/agenda");
    const linha = page.locator('[data-agenda="linha"][data-situacao="confirmado"]').last();
    await expect(linha.locator('[data-agenda="lembrete-enviado"]')).toHaveCount(0);
    await linha.getByRole("button", { name: /Ações do horário/ }).click();
    await page.getByRole("menuitem", { name: "Enviar lembrete" }).click();
    await expect(page.getByRole("dialog")).toContainText("Passando para lembrar");
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(linha.locator('[data-agenda="lembrete-enviado"]')).toBeVisible();
  });

  test("estados vazio e desconectada", async ({ page }) => {
    await page.goto("/design/agenda?vazio=1");
    await expect(page.getByText("Nenhum horário marcado")).toBeVisible();
    await page.goto("/design/agenda?desconectada=1");
    await expect(page.locator('[data-agenda="desconectada"]')).toContainText("A Google Agenda desconectou");
  });

  test("configurar: a prévia muda com as regras e some sem conexão", async ({ page }) => {
    await page.goto("/design/agenda/configurar");
    const frase = page.locator('[data-agenda="frase"]');
    await expect(frase).toContainText("Qual fica melhor");
    const antes = await page.locator('[data-agenda="previa-dia"] span').count();
    await page.getByRole("button", { name: "30 min" }).click();
    const depois = await page.locator('[data-agenda="previa-dia"] span').count();
    expect(depois).toBeLessThanOrEqual(antes);
    await page.getByRole("button", { name: "Desconectar" }).click();
    await expect(page.getByRole("button", { name: "Conectar Google Agenda" })).toBeVisible();
    await expect(frase).toHaveCount(0);
  });

  test("nenhum texto fixo com travessão", async ({ page }) => {
    for (const rota of ["/design/agenda", "/design/agenda/configurar"]) {
      await page.goto(rota);
      const texto = await page.locator("body").innerText();
      expect(texto).not.toMatch(/[–—]/);
    }
  });
});
