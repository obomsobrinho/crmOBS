import { test, expect } from "@playwright/test";

// Onboarding guiado e transparência da conexão. Roda sem login nas rotas
// /design (liberadas pelo proxy em dev).

test.describe("Trilho de onboarding (/design/onboarding)", () => {
  test("mostra progresso e o próximo passo", async ({ page }) => {
    await page.goto("/design/onboarding");
    await expect(page.getByText("Configurar sua conta")).toBeVisible();
    // Mock: conectado e configurado, falta testar e publicar.
    await expect(page.getByText("2 de 4")).toBeVisible();
    await expect(page.getByText(/Próximo: testar a conversa/)).toBeVisible();
  });

  test("expande a lista com os 4 passos", async ({ page }) => {
    await page.goto("/design/onboarding");
    await page.getByRole("button", { name: "Ver todos os passos" }).click();
    for (const passo of [
      "Conectar o WhatsApp",
      "Configurar o agente",
      "Testar a conversa",
      "Publicar o agente",
    ]) {
      await expect(page.getByText(passo, { exact: true })).toBeVisible();
    }
  });

  test("publicar fica travado enquanto falta passo, e diz o que falta", async ({
    page,
  }) => {
    await page.goto("/design/onboarding");
    await expect(page.getByText("Agente pausado")).toBeVisible();
    // A IA não responde ninguém, mas a mensagem do cliente não se perde.
    await expect(page.getByText(/ficam no inbox/)).toBeVisible();
    await expect(
      page.getByText(/Antes de publicar, falta: testar a conversa na bancada/)
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publicar agente" })
    ).toBeDisabled();
  });
});

test.describe("Modo leitura de conta bloqueada (/design/bloqueio)", () => {
  test("mostra o inbox, avisa o que parou e tira a caixa de texto", async ({
    page,
  }) => {
    await page.goto("/design/bloqueio");
    await expect(page.getByText(/Modo leitura/)).toBeVisible();
    // O que para: IA, envio e as outras telas. O que continua: ver as mensagens.
    await expect(page.getByText(/o agente de IA não responde/)).toBeVisible();
    await expect(
      page.getByText(/mensagens continuam chegando e você acompanha as conversas/)
    ).toBeVisible();
    await expect(
      page.getByText(/Envio pausado enquanto a conta não está em dia/)
    ).toBeVisible();
    // Sem campo de digitação: melhor tirar do que deixar escrever e dar erro.
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });
});

test.describe("Aviso de risco da conexão (/design/connect)", () => {
  test("explica o QR, o risco e o número dedicado", async ({ page }) => {
    await page.goto("/design/connect");
    await expect(page.getByText(/Não é a API Oficial da Meta/)).toBeVisible();
    await expect(page.getByText(/Use um número dedicado ao atendimento/)).toBeVisible();
    await expect(page.getByText(/Existe risco de bloqueio/)).toBeVisible();
    // Honestidade obrigatória: não prometemos reverter bloqueio.
    await expect(
      page.getByText(/não temos como impedir o bloqueio nem como reverter/)
    ).toBeVisible();
  });

  test("tem a cláusula de contingência", async ({ page }) => {
    await page.goto("/design/connect");
    await page
      .getByRole("button", { name: /Se o número cair, o que acontece/ })
      .click();
    await expect(page.getByText(/Nada se perde aqui/)).toBeVisible();
    await expect(page.getByText(/Você conecta outro número/)).toBeVisible();
    await expect(page.getByText(/01\/10\/2026/)).toBeVisible();
  });

  test("não usa argumento proibido de marketing", async ({ page }) => {
    await page.goto("/design/connect");
    const texto = (await page.locator("body").innerText()).toLowerCase();
    // Os Termos da Meta tratam alegação pública de marketing como evidência.
    expect(texto).not.toContain("não pague a api");
    expect(texto).not.toContain("proteção contra banimento");
    expect(texto).not.toContain("anti-ban");
  });
});
