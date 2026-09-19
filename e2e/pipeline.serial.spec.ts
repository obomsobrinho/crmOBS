import { test, expect } from "@playwright/test";

// Pipeline, a parte que ESCREVE no funil do tenant compartilhado. Projeto
// `logado-serial`: um worker só e depois que o `logado` inteiro terminou.
//
// ⚠️ Veio de `pipeline.auth.spec.ts` em 18/09/2026. Ele cria um estágio, confere
// que a coluna apareceu, renomeia, arquiva e confere que sumiu, tudo por
// CONTAGEM DE COLUNAS. Em paralelo com outro teste que mexa em estágio a
// contagem muda embaixo dele, e a falha aparecia em testes diferentes a cada
// execução, parecendo produto instável quando era disputa de tenant.

const COLUNA = '[data-slot="pipeline-coluna"]';

test.describe("Pipeline (escreve estágio)", () => {
  test("dono cria, renomeia e arquiva um estágio", async ({ page }) => {
    const nome = `Teste e2e ${Date.now()}`;
    const renomeado = `${nome} renomeado`;

    await page.goto("/pipeline");
    await page.waitForSelector(COLUNA, { timeout: 20_000 });
    const antes = await page.locator(COLUNA).count();

    await page.getByRole("button", { name: "Gerenciar estágios" }).click();
    await expect(page.getByText("Estágios do pipeline")).toBeVisible();

    // Criar: vira coluna no board, atrás do modal.
    await page.getByLabel("Nome do novo estágio").fill(nome);
    await page.getByRole("button", { name: "Criar" }).click();
    await expect.poll(() => page.locator(COLUNA).count()).toBe(antes + 1);

    // ⚠️ A linha do estágio NÃO se acha por `hasText`. O nome dela mora no
    // `value` de um `<input>`, e `hasText` casa com texto de nó, não com valor de
    // campo. Quem carrega o nome em texto acessível é o `aria-label` do punho de
    // arraste ("Reordenar <nome>. Arraste, ou use as setas...").
    const linhaDe = (n: string) =>
      page.locator("li").filter({
        has: page.locator(`[aria-label^="Reordenar ${n}."]`),
      });

    // Renomear: o campo salva no blur, e não num botão de salvar.
    const linha = linhaDe(nome);
    await linha.getByRole("textbox").fill(renomeado);
    await linha.getByRole("textbox").blur();
    await expect(page.locator(COLUNA, { hasText: renomeado })).toBeVisible();

    // Arquivar: some do board. É o único jeito de tirar um estágio da tela, e é
    // por isso que este teste se limpa arquivando em vez de apagando.
    await linhaDe(renomeado)
      .getByRole("button", { name: "Arquivar estágio" })
      .click();
    await expect.poll(() => page.locator(COLUNA).count()).toBe(antes);
  });

});
