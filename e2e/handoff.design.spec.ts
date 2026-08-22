import { test, expect } from "@playwright/test";

// Handoff sem pausa. Roda sem login nas telas /design (liberadas pelo proxy em
// dev).
//
// O que estes testes travam é uma REGRA, não um layout: "a IA pediu ajuda" e
// "alguém assumiu" são estados diferentes. Antes eram o mesmo (o handoff pausava
// a IA), e o efeito em produção foi a fila de "Precisa de você" virar depósito
// enquanto a IA ficava desligada para sempre nos contatos que já tinham passado
// por um handoff.

test.describe("Handoff na lista de conversas (/design)", () => {
  test("mostra o tempo de espera do handoff em aberto", async ({ page }) => {
    await page.goto("/design");
    // O mock tem um handoff aberto há 6 horas. A espera vem do PRIMEIRO handoff
    // em aberto, que é a espera de verdade da pessoa.
    await expect(page.getByText("6h", { exact: true })).toBeVisible();
    await expect(page.getByText(/esperando você/)).toBeVisible();
  });

  test("IA pausada NÃO conta como precisa de você", async ({ page }) => {
    await page.goto("/design");
    // Um só: a conversa com handoff aberto. A do Franck está com a IA pausada
    // (alguém assumiu), e por isso não entra na fila.
    const urgente = page.getByRole("button", { name: "Precisa de você" });
    await expect(urgente).toContainText("1");
    await urgente.click();
    await expect(page.getByRole("link", { name: /Franck/ })).toHaveCount(0);
    await expect(page.getByText(/esperando você/)).toBeVisible();
  });

  test("aviso de handoff é um campo do construtor", async ({ page }) => {
    await page.goto("/design/agente");
    await expect(
      page.getByText("O que avisar ao passar para o time")
    ).toBeVisible();
    // O texto é BASE, não frase pronta: se fosse frase pronta, a mesma linha se
    // repetiria a cada handoff da mesma conversa (foi o que aconteceu em
    // produção, dois handoffs em 26 segundos com a mesma promessa).
    await expect(page.getByText(/base da frase, não a frase pronta/)).toBeVisible();
  });

  test("o prompt compilado manda a IA seguir atendendo depois de pausar", async ({
    page,
  }) => {
    await page.goto("/design/agente");
    // O prompt saiu da coluna fixa e foi para um drawer: não é o que o cliente
    // veio fazer nesta tela. Então tem que abrir para conferir a regra.
    await page.getByRole("button", { name: "Ver prompt" }).click();
    await expect(page.getByText(/Pausar NÃO encerra a conversa/)).toBeVisible();
  });

  test("não usa travessão em texto visível", async ({ page }) => {
    await page.goto("/design/agente");
    const texto = await page.locator("body").innerText();
    expect(texto).not.toContain("—");
    expect(texto).not.toContain("–");
  });
});
