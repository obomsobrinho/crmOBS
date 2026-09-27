import { test, expect } from "@playwright/test";

// FAVICON (27/09/2026, pedido do dono: a aba mostrava o triângulo padrão do
// Next). A marca tem as letras em espaço negativo, então existe uma versão por
// tema do navegador: letras escuras no claro, brancas no escuro. Ver o comentário
// do `metadata.icons` em `app/layout.tsx`.

test("a aba usa a marca, uma versão por tema, e o iPhone tem ícone de fundo branco", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  const claro = page.locator('link[rel="icon"][media="(prefers-color-scheme: light)"]');
  const escuro = page.locator('link[rel="icon"][media="(prefers-color-scheme: dark)"]');
  await expect(claro).toHaveAttribute("href", "/marca/obs-mark-light.png");
  await expect(escuro).toHaveAttribute("href", "/marca/obs-mark-dark.png");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/apple-icon.png"
  );

  for (const url of ["/marca/obs-mark-light.png", "/marca/obs-mark-dark.png", "/apple-icon.png"]) {
    expect((await request.get(url)).status(), url).toBe(200);
  }
  // O favicon.ico padrão do create-next-app tem 25.931 bytes. Se ele voltar, é
  // porque alguém sobrescreveu o nosso.
  const ico = await request.get("/favicon.ico");
  expect(ico.status()).toBe(200);
  expect((await ico.body()).length).not.toBe(25931);
});
