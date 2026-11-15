import { test, expect } from "@playwright/test";

// AGENDA COM A SESSÃO DE VERDADE (passo 3b de docs/plano-dados-e-estado.md): a página
// não lê nada no servidor, a abertura vem do navegador pelo cache, e a semana exibida
// fica na URL (refresh mantém). Só leitura: navega entre semanas, não marca nada.
test("a agenda abre pelo navegador e a semana fica na URL", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto("/agenda");
  // Conta de teste sem agenda ligada vai para as configurações (dono): aí não há grade.
  await page.waitForURL(/\/agenda/, { timeout: 30_000 });
  test.skip(page.url().includes("/configuracoes"), "agenda desligada no tenant de teste");
  await expect(page.locator('[data-agenda="tela"], [data-agenda="indisponivel"]').first()).toBeVisible({ timeout: 30_000 });
  test.skip((await page.locator('[data-agenda="tela"]').count()) === 0, "agenda indisponível (tabelas ausentes)");
  await page.getByRole("button", { name: "Próxima semana" }).click();
  await expect(page).toHaveURL(/semana=\d{4}-\d{2}-\d{2}/);
  await page.reload();
  await expect(page.locator('[data-agenda="tela"]')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/semana=/);
  await expect(page.getByRole("button", { name: "Hoje" })).toBeEnabled();
  expect(erros).toEqual([]);
});
