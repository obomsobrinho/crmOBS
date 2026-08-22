import { test, expect } from "@playwright/test";

// Resumo de valor percebido. Roda sem login em /design/valor (liberado pelo
// proxy em dev), com mock nos dois estados: com e sem horário configurado.

test.describe("Valor percebido (/design/valor)", () => {
  test("mostra as frases com o número em destaque", async ({ page }) => {
    await page.goto("/design/valor");
    await expect(
      page.getByRole("heading", { name: "O que a IA fez por você" }).first()
    ).toBeVisible();
    // O número mais forte do item: trabalho que humano nenhum teria feito.
    await expect(page.getByText("213", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/mensagens respondidas fora do horário de atendimento/).first()
    ).toBeVisible();
    // Período aparece dentro da frase, não só no título: ela vai virar material
    // de venda fora do produto, então precisa se sustentar sozinha.
    await expect(page.getByText(/em julho de 2026/).first()).toBeVisible();
    // Pico mostra quando ele estaria perdendo cliente.
    await expect(page.getByText("17h", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/pico de mensagens é domingo/).first()).toBeVisible();
  });

  test("sem horário configurado, omite o número em vez de estimar", async ({
    page,
  }) => {
    await page.goto("/design/valor");
    await expect(page.getByText("Falta o horário de atendimento")).toBeVisible();
    await expect(page.getByText(/Nós não estimamos esse dado/)).toBeVisible();
    // A regra que não se negocia: inventar número quebra a confiança, que é o
    // eixo de competição do produto. Só a seção com horário tem o 213.
    await expect(page.getByText("213", { exact: true })).toHaveCount(1);
    // Os números que não dependem de horário continuam nas duas seções.
    await expect(page.getByText("47", { exact: true })).toHaveCount(2);
  });

  test("não usa travessão em texto visível", async ({ page }) => {
    await page.goto("/design/valor");
    const texto = await page.locator("body").innerText();
    expect(texto).not.toContain("—");
    expect(texto).not.toContain("–");
  });
});

test.describe("Antídoto do cancelamento (/design/cancelamento)", () => {
  test("mostra o acumulado antes de confirmar o cancelamento", async ({ page }) => {
    await page.goto("/design/cancelamento");
    await page.getByRole("button", { name: "Cancelar assinatura" }).click();

    // O acumulado aparece ANTES do campo de motivo: é o único momento em que a
    // pessoa para para olhar o que a ferramenta fez por ela.
    await expect(page.getByText("O que a IA já fez nesta conta")).toBeVisible();
    await expect(page.getByText("1876", { exact: true })).toBeVisible();
    await expect(page.getByText(/desde o início/).first()).toBeVisible();
    await expect(page.getByLabel(/O que motivou/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirmar cancelamento" })
    ).toBeVisible();
  });

  test("cancelar não fica preso atrás do acumulado", async ({ page }) => {
    await page.goto("/design/cancelamento");
    await page.getByRole("button", { name: "Cancelar assinatura" }).click();
    // Motivo é opcional e confirmar não depende dele: segurar quem já decidiu
    // sair só gera reclamação.
    await expect(
      page.getByRole("button", { name: "Confirmar cancelamento" })
    ).toBeEnabled();
    await expect(page.getByRole("button", { name: "Voltar" })).toBeVisible();
  });
});
