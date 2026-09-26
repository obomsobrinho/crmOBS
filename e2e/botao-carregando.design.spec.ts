import { test, expect } from "@playwright/test";

// Botão CARREGANDO (26/09/2026, pedido do dono: "botão salvando bloqueado é
// horrível"). A ação que a pessoa acabou de pedir não pode desbotar como se
// tivesse sido recusada: ela ganha um spinner, mantém a cor cheia e segue
// travada contra clique duplo. Provado na tela de login, segurando a resposta do
// Supabase, porque é a tela pública onde a espera é real.

test("carregando: spinner, cor cheia, travado e anunciado", async ({ page }) => {
  await page.route("**/auth/v1/token**", async (rota) => {
    await new Promise((r) => setTimeout(r, 2_000));
    await rota.abort();
  });
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail", { exact: true }).fill("teste@exemplo.com");
  await page.getByLabel("Senha", { exact: true }).fill("qualquer-coisa");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  const botao = page.getByRole("button", { name: /Entrando/ });
  await expect(botao).toHaveAttribute("aria-busy", "true");
  await expect(botao).toBeDisabled();
  await expect(botao.locator("[data-spinner]")).toBeVisible();
  // A cor cheia é o ponto: desabilitado por falta de dado desbota (0.5),
  // carregando não.
  expect(await botao.evaluate((b) => getComputedStyle(b).opacity)).toBe("1");
});
