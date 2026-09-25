import { test, expect } from "@playwright/test";

// Onboarding guiado e transparência da conexão. Roda sem login nas rotas
// /design (liberadas pelo proxy em dev).

test.describe("Aviso de montagem (/design/onboarding)", () => {
  // ⚠️ A BARRA DE QUATRO PASSOS NÃO EXISTE MAIS (28/08/2026). Ela foi absorvida
  // pelo assistente de `/montagem`, que tem preview próprio em `/design/montagem`.
  // O que ficou em toda página do app é uma linha com a porta de volta.
  test("a barra de quatro passos virou uma linha, sem contador", async ({
    page,
  }) => {
    await page.goto("/design/onboarding");

    await expect(page.getByText("Seu agente ainda não está no ar")).toBeVisible();
    await expect(
      page.getByText(/Ninguém recebe resposta automática até você ativar/)
    ).toBeVisible();
    // A porta de volta, que é a única razão de a linha existir.
    await expect(
      page.getByRole("link", { name: /Continuar a montagem/ })
    ).toHaveAttribute("href", "/montagem");

    // O CONTADOR SUMIU DAQUI. Existe um só na conta, e ele mora dentro do
    // assistente: dois contadores davam "passo 2 de 3" dentro de "passo 2 de 4".
    await expect(page.getByText("Configurar sua conta")).toHaveCount(0);
    await expect(page.getByText(/\d de 4/)).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Ver todos os passos" })
    ).toHaveCount(0);
  });

  test("ativar fica travado enquanto falta passo, e diz o que falta", async ({
    page,
  }) => {
    await page.goto("/design/onboarding");
    // O cartão inteiro de publicação virou uma chave mais uma linha. E o rótulo
    // deixou de ser "pausado": pausada é a IA de UMA conversa quando um humano
    // assume, e repetir a palavra nos dois lugares confundia os dois estados.
    await expect(page.getByText("Desativado")).toBeVisible();
    // ⚠️ "testar a conversa" SAIU da lista de pendências (decisão do dono,
    // 28/08/2026): testar é oferecido no passo 4 do assistente, mas não barra
    // mais a ativação. Sobraram conectar e configurar.
    await expect(
      page.getByText(/Antes de ativar o agente, falta: configurar o agente/)
    ).toBeVisible();
    await expect(page.getByText(/testar a conversa na bancada/)).toHaveCount(0);
    // A chave não é o gate (o gate é a rota, que devolve 409), mas ela não deve
    // convidar ao clique enquanto falta passo.
    await expect(
      page.getByRole("switch", { name: "Ativar agente" })
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
    await page.waitForLoadState("networkidle");
    // Desde 24/09/2026 o aviso é UMA linha (pedido do dono: o alarme de
    // bloqueio logo de cara era má primeira impressão). O número dedicado fica à
    // vista; o risco de bloqueio, a um toque em "Entenda os riscos".
    await page.getByRole("button", { name: /Entenda os riscos/ }).click();
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
    await page.waitForLoadState("networkidle");
    // A contingência mora atrás de "Entenda os riscos" desde 24/09/2026.
    await page.getByRole("button", { name: /Entenda os riscos/ }).click();
    await expect(page.getByText(/nada se perde aqui/i)).toBeVisible();
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
