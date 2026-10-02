import { test, expect } from "@playwright/test";

// Pipeline no CELULAR (plano do mobile, fase 3, 23/09/2026). Projeto `mobile`,
// /design/pipeline sem login: o preview move em memória, com a MESMA função do
// arrastar (`moveCard`), então o que se prova aqui é o caminho do toque.

test("um estágio por vez: a faixa escolhe qual coluna aparece", async ({ page }) => {
  await page.goto("/design/pipeline");
  await page.waitForLoadState("networkidle"); // clique antes de hidratar se perde
  const faixa = page.locator('[data-slot="pipeline-faixa"]');
  await expect(faixa).toBeVisible();
  await expect(page.locator('[data-slot="pipeline-coluna"]:visible')).toHaveCount(1);
  const segunda = faixa.getByRole("tab").nth(1);
  const chave = await page
    .locator('[data-slot="pipeline-coluna"]')
    .nth(1)
    .getAttribute("data-stage");
  await segunda.click();
  await expect(segunda).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`[data-slot="pipeline-coluna"][data-stage="${chave}"]`)).toBeVisible();
  // O filtro de estágio do desktop some: a faixa já é o filtro.
  await expect(page.getByRole("combobox", { name: "Filtrar por estágio" })).toBeHidden();
});

test("mover pelo botão do card leva o card para o estágio escolhido", async ({ page }) => {
  await page.goto("/design/pipeline");
  await page.waitForLoadState("networkidle"); // clique antes de hidratar se perde
  const visivel = page.locator('[data-slot="pipeline-coluna"]:visible');
  const card = visivel.locator('[data-slot="pipeline-card"]').first();
  const phone = await card.getAttribute("data-phone");
  await card.locator('[data-slot="pipeline-mover"]').click();

  const folha = page.locator('[data-slot="sheet-content"]');
  await expect(folha).toBeVisible();
  await expect(folha.getByText("a IA não desfaz")).toBeVisible();
  // O estágio atual aparece marcado e não é clicável.
  await expect(folha.locator('[data-slot="mover-estagio"]:disabled')).toHaveCount(1);
  const destino = folha.locator('[data-slot="mover-estagio"]:not(:disabled)').first();
  const nome = (await destino.innerText()).trim();
  await destino.click();
  await expect(folha).toHaveCount(0);

  // O card saiu da coluna visível e está na do destino.
  await expect(visivel.locator(`[data-phone="${phone}"]`)).toHaveCount(0);
  await page.locator('[data-slot="pipeline-faixa"]').getByRole("tab", { name: new RegExp(nome) }).click();
  await expect(
    page.locator(`[data-slot="pipeline-coluna"]:visible [data-phone="${phone}"]`)
  ).toBeVisible();
});

// R-27 (02/10/2026): a folha de baixo desenha a alça UMA vez (no `SheetContent`,
// não em cada tela) e a lista de estágios dentro dela dissolve nas bordas, como
// toda área rolável (antes era um `overflow-y-auto` cru, cortando seco).
test("a folha de mover tem uma alça e a lista de estágios é área rolável da casa", async ({
  page,
}) => {
  await page.goto("/design/pipeline");
  await page.waitForLoadState("networkidle"); // clique antes de hidratar se perde
  const card = page
    .locator('[data-slot="pipeline-coluna"]:visible [data-slot="pipeline-card"]')
    .first();
  await card.locator('[data-slot="pipeline-mover"]').click();
  const folha = page.locator('[data-slot="sheet-content"]');
  await expect(folha).toBeVisible();
  await expect(folha.locator('[data-slot="sheet-alca"]')).toHaveCount(1);
  await expect(
    folha.locator('[data-slot="area-rolavel"]').locator('[data-slot="mover-estagio"]').first()
  ).toBeVisible();
});

test("gerenciar estágios abre em tela cheia", async ({ page }) => {
  await page.goto("/design/pipeline");
  await page.waitForLoadState("networkidle"); // clique antes de hidratar se perde
  const dialogo = page.getByRole("dialog");
  // `toPass`: sob carga o dev server hidrata depois do `networkidle`, e o
  // primeiro toque se perde. Repetir o toque é o que um dedo faria.
  await expect(async () => {
    await page.getByRole("button", { name: "Gerenciar estágios" }).click();
    await expect(dialogo).toBeVisible({ timeout: 1500 });
  }).toPass();
  // `poll`: a medida só vale depois da animação de entrada, que escala o painel.
  await expect
    .poll(async () => {
      const c = await dialogo.boundingBox();
      return [Math.round(c!.x), Math.round(c!.width)];
    })
    .toEqual([0, 375]);
});

// ACHADO DO DONO (27/09/2026): no celular aparece UMA coluna por vez, e ligar
// "Esperando você" escondia cards de OUTRAS colunas, então a tela que ele estava
// vendo não mudava. Ligar o filtro leva à primeira coluna com alguém esperando.
test("Esperando você leva à coluna de quem espera", async ({ page }) => {
  await page.goto("/design/pipeline");
  const botao = page.getByRole("button", { name: /Esperando você/ });
  await expect(botao).toBeVisible();
  await page.waitForTimeout(600);
  await botao.click();
  const visivel = page.locator('[data-slot="pipeline-coluna"]:visible');
  await expect(visivel).toHaveCount(1);
  await expect(visivel.locator('[data-slot="pipeline-card"]').first()).toContainText("Sua vez");
});
