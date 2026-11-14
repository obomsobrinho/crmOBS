import { test, expect } from "@playwright/test";

// Campanhas no padrão novo de dados (passo 2 de docs/plano-dados-e-estado.md), no
// preview com a fonte de mentira: a tela na URL (o refresh não volta para a lista
// geral) e o apagar otimista (a queixa "apaga um lead, apaga outro e responde Este
// lead já saiu da lista").

test.describe("Campanhas: dados, URL e escrita otimista (preview)", () => {
  test("a aba e a lista aberta ficam na URL: recarregar mantém onde a pessoa estava", async ({ page }) => {
    await page.goto("/design/campanhas");
    await page.getByRole("tab", { name: /Leads/ }).first().click();
    await expect(page).toHaveURL(/aba=leads/);
    await page.reload();
    await expect(page.locator('[data-slot="leads-buscas"]')).toBeVisible();

    const linha = page.locator('[data-slot="busca-linha"]:not([disabled])').first();
    const id = await linha.getAttribute("data-busca");
    await linha.click();
    await expect(page).toHaveURL(new RegExp(`lista=${id}`));
    await expect(page.locator('[data-slot="busca-mapa"]')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`lista=${id}`));
    await expect(page.locator('[data-slot="busca-mapa"]')).toBeVisible();

    // O voltar do navegador volta para as listas, não para fora de Campanhas.
    await page.goBack();
    await expect(page.locator('[data-slot="leads-buscas"]')).toBeVisible();
  });

  test("três leads tirados em seguida: cada um some no clique, nada de 'já saiu da lista', e o total acompanha", async ({ page }) => {
    await page.goto("/design/campanhas?tela=busca");
    const rodape = page.locator('[data-slot="leads-rodape"] [data-slot="paginacao-texto"]');
    await expect(rodape).toContainText("de ");
    const totalAntes = Number((await rodape.innerText()).match(/de (\d+)/)?.[1]);
    const dialogo = page.locator('[data-slot="lead-remover-dialogo"]');
    for (let i = 0; i < 3; i++) {
      const livre = page.locator('[data-slot="lead-linha"]').filter({ hasText: "Nenhuma" }).first();
      const id = await livre.getAttribute("data-lead");
      await livre.locator('[data-slot="lead-remover"]').click();
      await dialogo.locator('[data-slot="central-acao-confirmar"]').click();
      // Some antes de qualquer releitura, e o diálogo já fechou.
      await expect(page.locator(`[data-lead="${id}"]`)).toHaveCount(0);
      await expect(dialogo).toHaveCount(0);
    }
    await expect(page.getByText("Este lead já saiu da lista.")).toHaveCount(0);
    await expect(page.locator('[data-slot="aviso-global"]')).toHaveCount(0);
    await expect(rodape).toContainText(`de ${totalAntes - 3}`);
  });
});
