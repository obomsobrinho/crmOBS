import { test, expect } from "@playwright/test";

// Conversas no padrão novo de dados (passo 4 de docs/plano-dados-e-estado.md), no
// preview com a fonte de mentira: o recorte da lista (período, chip e busca) fica na
// URL, sobrevive ao recarregar, e abrir uma conversa leva o recorte junto.

test.describe("Conversas: o recorte da lista na URL (preview)", () => {
  test("período e chip vão para a URL e voltam depois de recarregar", async ({ page }) => {
    await page.goto("/design?lista=1");
    const periodo = page.locator('[data-slot="inbox-periodo"]');
    await expect(periodo).toBeVisible();

    await page.locator('[data-slot="inbox-periodo-opcao"]', { hasText: "Tudo" }).click();
    await expect(page).toHaveURL(/periodo=tudo/);

    const chips = page.locator('[data-slot="inbox-chip"]');
    const segundo = chips.nth(1);
    const rotulo = (await segundo.innerText()).trim();
    await segundo.click();
    await expect(page).toHaveURL(/filtro=/);

    await page.reload();
    await expect(page).toHaveURL(/periodo=tudo/);
    await expect(page).toHaveURL(/filtro=/);
    await expect(page.locator('[data-slot="inbox-chip"][data-ativo="sim"]')).toContainText(rotulo.replace(/\s*\d+$/, ""));
  });

  test("a busca vai para a URL e o link da conversa leva o recorte junto", async ({ page }) => {
    await page.goto("/design?lista=1");
    await page.getByPlaceholder(/Buscar/).first().fill("fr");
    await expect(page).toHaveURL(/q=fr/);
    const item = page.locator('[data-slot="inbox-item"]').first();
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute("href", /\?.*q=fr/);
  });
});
