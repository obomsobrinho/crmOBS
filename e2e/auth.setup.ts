import { test as setup, expect } from "@playwright/test";

// Faz login como DONO uma vez e salva a sessão em e2e/.auth/dono.json. Os testes
// autenticados reusam esse estado. A senha vem de .env.e2e.local (fora do git);
// nunca fica no código.
const authFile = "e2e/.auth/dono.json";

setup("autenticar como dono", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Defina E2E_EMAIL e E2E_PASSWORD em .env.e2e.local (fora do git) para rodar os testes com login."
    );
  }

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: /Entrar/ }).click();

  // Sai de /login quando a sessão é criada (vai para /inbox ou /connect).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
  await expect(page).not.toHaveURL(/\/login/);

  await page.context().storageState({ path: authFile });
});
