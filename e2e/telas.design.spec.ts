import { test, expect } from "@playwright/test";

// Testes de fumaça das telas /design (sem login, sem banco). Garantem que a UT
// renderiza e os elementos-chave da Fase 1 existem.

test.describe("Equipe (/design/equipe)", () => {
  test("mostra convite, membros e papéis", async ({ page }) => {
    await page.goto("/design/equipe");
    await expect(page.getByRole("heading", { name: "Equipe" })).toBeVisible();
    await expect(page.getByText("Convidar por e-mail")).toBeVisible();
    await expect(page.getByText("ana.dona@oticavision.com")).toBeVisible();
    await expect(page.getByText("carlos.silva@oticavision.com")).toBeVisible();
    // Badge de papel (span do membro, não a <option> escondida do select).
    await expect(
      page.locator("span").filter({ hasText: /^Dono$/ }).first()
    ).toBeVisible();
    await expect(
      page.locator("span").filter({ hasText: /^Atendente$/ }).first()
    ).toBeVisible();
  });
});

test.describe("Inbox (/design)", () => {
  test("mostra atribuição, tags, notas, respostas rápidas e filtros", async ({
    page,
  }) => {
    await page.goto("/design");
    await expect(page.getByText("Atendimento", { exact: true })).toBeVisible();
    await expect(page.getByText("Tags", { exact: true })).toBeVisible();
    await expect(page.getByText("Notas internas")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Respostas rápidas" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Não lidas/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Precisa de você/ })).toBeVisible();
  });

  test("busca por nome filtra a lista", async ({ page }) => {
    await page.goto("/design");
    await expect(page.getByRole("link", { name: /Franck/ })).toBeVisible();
    await page.getByPlaceholder("Buscar nome ou mensagem").fill("franck");
    await expect(page.getByRole("link", { name: /Franck/ })).toBeVisible();
    // "Olá, vim pelo qr code!" é de outra conversa; deve sumir no filtro.
    await expect(page.getByText("Olá, vim pelo qr code!")).toHaveCount(0);
  });

  test("editar contato abre o formulário", async ({ page }) => {
    await page.goto("/design");
    await page.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByText("Nome de exibição")).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
  });
});

test.describe("Agente (/design/agente)", () => {
  test("renderiza o construtor guiado/avançado", async ({ page }) => {
    await page.goto("/design/agente");
    await expect(page.getByRole("button", { name: "Guiado" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Avançado" })).toBeVisible();
  });
});
