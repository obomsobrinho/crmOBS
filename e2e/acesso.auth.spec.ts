import { test, expect } from "@playwright/test";

// Testes com login (sessão de DONO reusada de auth.setup.ts). Cobrem o acesso
// do dono; os testes do atendente (não vê Agente, 403 na API) dependem de um 2o
// usuário semeado, ainda por fazer.
test.describe("Acesso do dono", () => {
  test("vê o item Agente e abre o construtor", async ({ page }) => {
    await page.goto("/inbox");
    await expect(page.getByRole("link", { name: "Agente" })).toBeVisible();
    await page.goto("/agente");
    // Três abas de verdade desde 28/08/2026. O par guiado/avançado deixou de ser
    // aba: as abas são as SEÇÕES do formulário, e o avançado é outro formulário.
    await expect(page.getByRole("tab", { name: "Quem atende" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Escrever o prompt à mão" })
    ).toBeVisible();
  });

  test("Equipe lista o próprio usuário", async ({ page }) => {
    await page.goto("/equipe");
    await expect(page.getByRole("heading", { name: "Equipe" })).toBeVisible();
    await expect(page.getByText(process.env.E2E_EMAIL ?? "")).toBeVisible();
  });
});
