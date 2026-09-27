import { test, expect } from "@playwright/test";

// FAVICON (27/09/2026). É o mesmo `favicon.ico` do site da OBS, por decisão do
// dono; a versão com um ícone por tema do navegador saiu. Ver o comentário do
// `metadata` em `app/layout.tsx`.

test("a aba usa o favicon da OBS, e o iPhone tem ícone próprio", async ({ page, request }) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="icon"][href^="/favicon.ico"]')).toHaveCount(1);
  // Sem os ícones por tema, que saíram.
  await expect(page.locator('link[rel="icon"][media]')).toHaveCount(0);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);

  const ico = await request.get("/favicon.ico");
  expect(ico.status()).toBe(200);
  // O favicon.ico da OBS tem 12.634 bytes; o padrão do create-next-app tinha
  // 25.931. Tamanho diferente é sinal de que alguém trocou o arquivo.
  expect((await ico.body()).length).toBe(12634);
});
