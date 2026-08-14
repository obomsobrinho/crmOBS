import { test, expect } from "@playwright/test";

// Telas públicas (sem login): cadastro self-service, login e recuperação de
// senha. Roda no projeto `sem-login` pelo sufixo do arquivo.
//
// Nenhum teste aqui dispara e-mail de verdade nem cria conta: o caminho que cria
// dados é o POST /api/signup, verificado à parte por script.

test.describe("Cadastro (/cadastro)", () => {
  test("pede empresa e e-mail, e não pede senha", async ({ page }) => {
    await page.goto("/cadastro");
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
    await expect(page.getByLabel("Nome da empresa")).toBeVisible();
    await expect(page.getByLabel("Seu e-mail")).toBeVisible();
    // A senha NUNCA passa pelo nosso servidor: o formulário não tem campo dela.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(
      page.getByText(/Você escolhe sua senha pelo link/)
    ).toBeVisible();
  });

  test("leva de volta para o login", async ({ page }) => {
    await page.goto("/cadastro");
    await page.getByRole("link", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  });
});

test.describe("Login (/login)", () => {
  test("oferece criar conta e recuperar senha", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("link", { name: "Esqueci minha senha" })
    ).toBeVisible();
    await page.getByRole("link", { name: "Criar conta" }).click();
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
  });
});

test.describe("Recuperar senha (/recuperar-senha)", () => {
  test("responde igual para qualquer e-mail (não vira verificador de contas)", async ({
    page,
  }) => {
    await page.goto("/recuperar-senha");
    await expect(
      page.getByRole("heading", { name: "Recuperar senha" })
    ).toBeVisible();
    // Endereço inexistente de propósito: nenhum e-mail é enviado.
    await page.getByLabel("E-mail").fill("ninguem-aqui-e2e@deskcrm-teste.local");
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(page.getByRole("heading", { name: "Link enviado" })).toBeVisible();
    await expect(page.getByText(/Se existir uma conta com esse e-mail/)).toBeVisible();
  });
});
