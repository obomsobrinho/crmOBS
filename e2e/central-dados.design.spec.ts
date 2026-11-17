import { expect, test } from "@playwright/test";

// A CENTRAL NO PADRÃO DE DADOS (passo 5 de docs/plano-dados-e-estado.md): o estado de cada
// lista da central vive na URL (nuqs), então recarregar, voltar e um link compartilhado
// abrem a mesma visão. Previews `/design/clientes` e `/design/clientes/detalhe`, sem banco.

test.describe("Central: estado na URL", () => {
  test("lista: busca e situação ficam na URL; recarregar e voltar do detalhe mantêm", async ({ page }) => {
    await page.goto("/design/clientes");
    const itens = page.locator('[data-slot="central-cliente"]');
    await expect(itens).toHaveCount(10);

    await page.locator('[data-slot="central-filtro"]').click();
    await page.getByRole("menuitem", { name: "Ativos", exact: true }).click();
    await page.getByLabel("Buscar clientes").fill("zé");
    await expect(page).toHaveURL(/[?&]situacao=active/);
    await expect(page).toHaveURL(/[?&]q=z/);
    await expect(itens).toHaveCount(1);
    await expect(itens).toContainText("Barbearia do Zé");

    // Recarregar: a mesma visão (um link compartilhado é isto).
    await page.reload();
    await expect(page.getByLabel("Buscar clientes")).toHaveValue("zé");
    await expect(page.locator('[data-slot="central-filtro-contagem"]')).toHaveText("1");
    await expect(itens).toHaveCount(1);
    await expect(itens).toContainText("Barbearia do Zé");

    // Abrir o cliente e voltar: a busca e o filtro continuam.
    await itens.first().click();
    await expect(page.locator('[data-slot="central-detalhe-nome"]')).toHaveText("Barbearia do Zé", { timeout: 30_000 });
    await page.goBack();
    await expect(page.getByLabel("Buscar clientes")).toHaveValue("zé");
    await expect(itens).toHaveCount(1);
    await expect(itens).toContainText("Barbearia do Zé");
  });

  test("detalhe: a aba e os filtros das abas ficam na URL; recarregar e voltar mantêm", async ({ page }) => {
    await page.goto("/design/clientes");
    await page.locator('[data-slot="central-cliente"]').first().click();
    await expect(page.locator('[data-slot="central-detalhe"]')).toBeVisible({ timeout: 30_000 });
    const detalhe = page.url();

    // Uso de IA, chip "Mês".
    await page.locator('[data-slot="central-aba-uso-gatilho"]').click();
    await expect(page).toHaveURL(/[?&]aba=uso/);
    const uso = page.locator('[data-slot="central-aba-uso"]');
    await uso.getByRole("tab", { name: "Mês", exact: true }).click();
    await expect(page).toHaveURL(/[?&]uso=mes/);

    // Atendimento, chip "Dia".
    await page.locator('[data-slot="central-aba-atendimento-gatilho"]').click();
    await expect(page).toHaveURL(/[?&]aba=atendimento/);
    const atendimento = page.locator('[data-slot="central-aba-atendimento"]');
    await atendimento.getByRole("tab", { name: "Dia", exact: true }).click();
    await expect(page).toHaveURL(/[?&]atendimento=dia/);

    // Recarregar: abre no Atendimento, com o Dia, e o Uso guardou o Mês.
    await page.reload();
    await expect(page.locator('[data-slot="central-aba-atendimento-gatilho"]')).toHaveAttribute("data-state", "active");
    await expect(atendimento.getByRole("tab", { name: "Dia", exact: true })).toHaveAttribute("data-state", "active");
    await page.locator('[data-slot="central-aba-uso-gatilho"]').click();
    await expect(uso.getByRole("tab", { name: "Mês", exact: true })).toHaveAttribute("data-state", "active");

    // Trocar de aba substitui a entrada: voltar sai do cliente para a lista, e avançar
    // devolve o cliente na aba e nos filtros em que ele estava.
    await page.goBack();
    await expect(page.locator('[data-slot="central-lista"]')).toBeVisible({ timeout: 30_000 });
    await page.goForward();
    await expect(page.locator('[data-slot="central-aba-uso-gatilho"]')).toHaveAttribute("data-state", "active", { timeout: 30_000 });
    await expect(uso.getByRole("tab", { name: "Mês", exact: true })).toHaveAttribute("data-state", "active");
    expect(page.url().split("?")[0]).toBe(detalhe.split("?")[0]);
  });
});
