import { test, expect, type Page } from "@playwright/test";

// /admin e a faixa do teto de IA, no preview com dados FALSOS (P1 item 6).
// Prova desenho, texto e a conta da tela; o banco é o custo-ia.serial e o 404
// para quem não é admin é o atendente.att.

const DASH = new RegExp("[\\u2013\\u2014]");

function empresa(page: Page, nome: string) {
  return page.locator('[data-slot="admin-empresa"]', { hasText: nome });
}

test.describe("Admin: Empresas (/design/admin)", () => {
  test("10 por vez, e o resto chega ao rolar", async ({ page }) => {
    await page.goto("/design/admin");
    await expect(page.getByRole("heading", { name: "Empresas" })).toBeVisible();
    const itens = page.locator('[data-slot="admin-empresa"]');
    await expect(itens).toHaveCount(10);
    await page.locator('[data-slot="admin-mais"]').scrollIntoViewIfNeeded();
    await expect(itens).toHaveCount(14);
    await expect(page.locator('[data-slot="admin-mais"]')).toHaveCount(0);
  });

  test("estado e barra: ativa, perto do limite, parada e desligada", async ({ page }) => {
    await page.goto("/design/admin");
    const ze = empresa(page, "Barbearia do Zé");
    await expect(ze).toHaveAttribute("data-estado", "ativa");
    await expect(ze.locator('[data-slot="medidor"]')).toHaveAttribute("data-consumo", "normal");

    const sorriso = empresa(page, "Clínica Sorriso");
    await expect(sorriso).toHaveAttribute("data-estado", "aviso");
    await expect(sorriso.locator('[data-slot="admin-estado"]')).toHaveText("Perto do limite");
    await expect(sorriso.locator('[data-slot="admin-percentual"]')).toHaveText("85%");
    await expect(sorriso.locator('[data-slot="medidor"]')).toHaveAttribute("data-consumo", "aviso");

    const maria = empresa(page, "Dra Maria Jullia");
    await expect(maria).toHaveAttribute("data-estado", "parada");
    await expect(maria.locator('[data-slot="admin-estado"]')).toHaveText("Parada no limite");
    await expect(maria.locator('[data-slot="admin-limite"]')).toHaveText("5 mi");
    // A barra para em 100% mesmo com o uso passando do teto.
    const larg = await maria.locator('[data-medidor-cheio]').evaluate((el) => (el as HTMLElement).style.width);
    expect(larg).toBe("100%");

    // Loja e Pizzaria vêm depois das 10 primeiras (ordem de nome): rola.
    await page.locator('[data-slot="admin-mais"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-slot="admin-empresa"]')).toHaveCount(14);
    await expect(empresa(page, "Loja Teste")).toHaveAttribute("data-estado", "desligada");
    await expect(empresa(page, "Pizzaria Bella")).toHaveAttribute("data-estado", "desligada");
    await expect(ze.locator('[data-slot="admin-limite"]')).toHaveText("Padrão (10 mi)");
  });

  test("custo estimado em dólar pela tabela", async ({ page }) => {
    await page.goto("/design/admin");
    // (1.200.000 * 0,75 + 1.200.000 * 0,075 + 42.000 * 4,5) / 1e6 = 1,179
    const custo = await empresa(page, "Barbearia do Zé").locator('[data-slot="admin-custo"]').innerText();
    expect(custo.replace(/\s/g, " ")).toContain("US$ 1,18");
  });

  test("busca por nome, sem acento e sem caixa", async ({ page }) => {
    await page.goto("/design/admin");
    await page.getByLabel("Buscar empresas").fill("clinica");
    await expect(page.locator('[data-slot="admin-empresa"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="admin-empresa"]')).toContainText("Clínica Sorriso");
    await page.getByLabel("Buscar empresas").fill("nada disso");
    await expect(page.locator('[data-slot="admin-vazio"]')).toContainText("Nenhuma empresa para");
  });

  test("subir o limite tira a empresa da parada na mesma linha", async ({ page }) => {
    await page.goto("/design/admin");
    const maria = empresa(page, "Dra Maria Jullia");
    await maria.locator('[data-slot="admin-editar-limite"]').click();
    const dialogo = page.locator('[data-slot="admin-limite-dialogo"]');
    await expect(dialogo).toBeVisible();
    const campo = dialogo.locator('[data-campo="limite"]');
    await expect(campo).toHaveValue("5");
    await expect(dialogo.locator('[data-slot="admin-limite-tokens"]')).toHaveText("5.000.000 tokens");
    await campo.fill("0.5");
    await expect(dialogo.locator('[data-slot="admin-limite-tokens"]')).toHaveText("500.000 tokens");
    await campo.fill("0");
    await dialogo.locator('[data-slot="admin-limite-salvar"]').click();
    await expect(dialogo.locator('[data-slot="admin-limite-erro"]')).toBeVisible();
    await campo.fill("20");
    await dialogo.locator('[data-slot="admin-limite-salvar"]').click();
    await expect(dialogo).toHaveCount(0);
    await expect(maria).toHaveAttribute("data-estado", "ativa");
    await expect(maria.locator('[data-slot="admin-limite"]')).toHaveText("20 mi");
  });

  test("sem empresas, o vazio explica", async ({ page }) => {
    await page.goto("/design/admin?cenario=vazia");
    await expect(page.locator('[data-slot="admin-vazio"]')).toContainText("Nenhuma empresa ainda");
  });

  test("nenhum travessão na tela", async ({ page }) => {
    await page.goto("/design/admin");
    expect(DASH.test(await page.locator("body").innerText())).toBe(false);
  });
});

test.describe("Faixa do teto de IA e o nome Contatos", () => {
  test("a faixa aparece com a IA parada e some sem ela", async ({ page }) => {
    await page.goto("/design/clientes?ia=parada");
    const faixa = page.locator("[data-limite-ia]");
    await expect(faixa).toBeVisible();
    await expect(faixa).toContainText("Limite de IA do mês atingido");
    await expect(faixa).toContainText("o time segue atendendo");
    expect(DASH.test(await faixa.innerText())).toBe(false);
    await page.goto("/design/clientes");
    await expect(page.locator("[data-limite-ia]")).toHaveCount(0);
  });

  test("o menu e a tela chamam os contatos de Contatos", async ({ page }) => {
    await page.goto("/design/clientes");
    await expect(page.getByRole("heading", { name: "Contatos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contatos" }).first()).toBeVisible();
    await expect(page.locator('[data-slot="clientes-novo"]')).toHaveText("Novo contato");
    await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Clientes" })).toHaveCount(0);
  });
});
