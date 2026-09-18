import { test, expect } from "@playwright/test";
import {
  botaoParaAvancado,
  botaoParaGuiado,
  modoDoAgente,
} from "./modo-agente";

// Testes com login (sessão de DONO reusada de auth.setup.ts). Cobrem o acesso
// do dono; o espelho deles, o que o atendente NÃO pode, vive em
// `atendente.att.spec.ts` (projeto `atendente`, sessão própria desde
// 17/09/2026), porque com a sessão do dono cada uma daquelas asserções provaria
// o contrário do que afirma.
test.describe("Acesso do dono", () => {
  test("vê o item Agente e abre o construtor", async ({ page }) => {
    await page.goto("/inbox");
    await expect(page.getByRole("link", { name: "Agente" })).toBeVisible();
    await page.goto("/agente");
    // Sem assumir o modo do tenant (a espera pela hidratação mora no helper).
    // Se abriu no avançado, prova aquela superfície e volta pelo botão: a troca
    // é estado local do formulário, nada é salvo, e a persona não é tocada.
    if ((await modoDoAgente(page)) === "avancado") {
      await expect(page.getByText("Prompt escrito à mão")).toBeVisible();
      await botaoParaGuiado(page).click();
    }
    // Três abas de verdade desde 28/08/2026. O par guiado/avançado deixou de ser
    // aba: as abas são as SEÇÕES do formulário, e o avançado é outro formulário.
    await expect(page.getByRole("tab", { name: "Quem atende" })).toBeVisible();
    await expect(botaoParaAvancado(page)).toBeVisible();
  });

  test("Equipe lista o próprio usuário", async ({ page }) => {
    await page.goto("/equipe");
    await expect(page.getByRole("heading", { name: "Equipe" })).toBeVisible();
    await expect(page.getByText(process.env.E2E_EMAIL ?? "")).toBeVisible();
  });
});
