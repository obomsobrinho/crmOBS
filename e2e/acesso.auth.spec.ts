import { test, expect } from "@playwright/test";

// Testes com login (sessão de DONO reusada de auth.setup.ts). Cobrem o acesso
// do dono; os testes do atendente (não vê Agente, 403 na API) dependem de um 2o
// usuário semeado, ainda por fazer.
test.describe("Acesso do dono", () => {
  test("vê o item Agente e abre o construtor", async ({ page }) => {
    await page.goto("/inbox");
    await expect(page.getByRole("link", { name: "Agente" })).toBeVisible();
    await page.goto("/agente");
    await expect(page.getByRole("button", { name: "Guiado" })).toBeVisible();
  });

  test("Equipe lista o próprio usuário", async ({ page }) => {
    await page.goto("/equipe");
    await expect(page.getByRole("heading", { name: "Equipe" })).toBeVisible();
    await expect(page.getByText(process.env.E2E_EMAIL ?? "")).toBeVisible();
  });
});
