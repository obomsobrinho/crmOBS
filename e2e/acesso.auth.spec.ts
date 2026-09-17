import { test, expect } from "@playwright/test";

// Testes com login (sessão de DONO reusada de auth.setup.ts). Cobrem o acesso
// do dono; os testes do atendente (não vê Agente, 403 na API) usam
// E2E_ATTENDANT_EMAIL, que passou a existir em 17/09/2026 e ainda não tem specs.
test.describe("Acesso do dono", () => {
  test("vê o item Agente e abre o construtor", async ({ page }) => {
    await page.goto("/inbox");
    await expect(page.getByRole("link", { name: "Agente" })).toBeVisible();
    await page.goto("/agente");
    // ⚠️ O tenant de teste pode estar em QUALQUER um dos dois modos, e a tela é
    // outra em cada um: o guiado mostra as três abas, o avançado mostra um campo
    // de texto só. Este teste travava a forma guiada e quebrou no dia em que o
    // tenant de teste virou a OBS, que escreve o prompt à mão. Em vez de assumir
    // um modo, prova as DUAS superfícies, trocando pelo botão. A troca é estado
    // local do formulário: nada é salvo, e a persona do tenant não é tocada.
    // ⚠️ Esperar o interruptor de modo ANTES de decidir qual caminho seguir. A
    // tela é client component e demora a hidratar; um `isVisible()` cru responde
    // "não" para um botão que aparece dois segundos depois.
    const paraGuiado = page.getByRole("button", {
      name: "Voltar ao formulário guiado",
    });
    const paraAvancado = page.getByRole("button", {
      name: "Escrever o prompt à mão",
    });
    await expect(paraGuiado.or(paraAvancado)).toBeVisible();
    if (await paraGuiado.isVisible()) {
      await expect(page.getByText("Prompt escrito à mão")).toBeVisible();
      await paraGuiado.click();
    }
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
