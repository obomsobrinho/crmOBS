import { test as setup, expect, type Page } from "@playwright/test";

// Faz login uma vez por PAPEL e salva a sessão em e2e/.auth/. Os testes
// autenticados reusam esse estado. As senhas vêm de .env.e2e.local (fora do
// git); nunca ficam no código.
//
// São dois arquivos desde 17/09/2026: o dono e o atendente. O atendente existe
// para provar o que a sessão do dono NÃO consegue provar (que a tela do agente
// e a gestão do funil são dono-only). Escrever essas asserções com a sessão do
// dono provaria o contrário do que elas afirmam.
const ARQUIVO_DONO = "e2e/.auth/dono.json";
const ARQUIVO_ATENDENTE = "e2e/.auth/atendente.json";

async function entrar(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: /Entrar/ }).click();

  // Sai de /login quando a sessão é criada (vai para /inbox ou /connect).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
  await expect(page).not.toHaveURL(/\/login/);
}

setup("autenticar como dono", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Defina E2E_EMAIL e E2E_PASSWORD em .env.e2e.local (fora do git) para rodar os testes com login."
    );
  }
  await entrar(page, email, password);
  await page.context().storageState({ path: ARQUIVO_DONO });
});

setup("autenticar como atendente", async ({ page }) => {
  const email = process.env.E2E_ATTENDANT_EMAIL;
  const password = process.env.E2E_ATTENDANT_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Defina E2E_ATTENDANT_EMAIL e E2E_ATTENDANT_PASSWORD em .env.e2e.local para rodar os testes de permissão do atendente."
    );
  }
  await entrar(page, email, password);
  await page.context().storageState({ path: ARQUIVO_ATENDENTE });
});
