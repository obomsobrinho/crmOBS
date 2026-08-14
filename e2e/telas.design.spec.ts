import { test, expect } from "@playwright/test";

// Testes de fumaça das telas /design (sem login, sem banco). Garantem que a UT
// renderiza e os elementos-chave da Fase 1 existem.

test.describe("Equipe (/design/equipe)", () => {
  test("mostra convite, membros e papéis", async ({ page }) => {
    await page.goto("/design/equipe");
    await expect(page.getByRole("heading", { name: "Equipe" })).toBeVisible();
    await expect(page.getByText("Convidar por e-mail")).toBeVisible();
    await expect(page.getByText("ana.dona@oticavision.com")).toBeVisible();
    await expect(page.getByText("carlos.silva@oticavision.com")).toBeVisible();
    // Badge de papel (span do membro, não a <option> escondida do select).
    await expect(
      page.locator("span").filter({ hasText: /^Dono$/ }).first()
    ).toBeVisible();
    await expect(
      page.locator("span").filter({ hasText: /^Atendente$/ }).first()
    ).toBeVisible();
  });
});

test.describe("Inbox (/design)", () => {
  test("mostra atribuição, tags, notas e filtros", async ({ page }) => {
    await page.goto("/design");
    await expect(page.getByText("Atendimento", { exact: true })).toBeVisible();
    await expect(page.getByText("Tags", { exact: true })).toBeVisible();
    await expect(page.getByText("Notas internas")).toBeVisible();
    await expect(page.getByRole("button", { name: /Não lidas/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Precisa de você/ })).toBeVisible();
  });

  test("busca por nome filtra a lista", async ({ page }) => {
    await page.goto("/design");
    await expect(page.getByRole("link", { name: /Franck/ })).toBeVisible();
    await page.getByPlaceholder("Buscar nome ou mensagem").fill("franck");
    await expect(page.getByRole("link", { name: /Franck/ })).toBeVisible();
    // "Olá, vim pelo qr code!" é de outra conversa; deve sumir no filtro.
    await expect(page.getByText("Olá, vim pelo qr code!")).toHaveCount(0);
  });

  test("editar contato abre o formulário", async ({ page }) => {
    await page.goto("/design");
    await page.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByText("Nome de exibição")).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
  });
});

test.describe("Agente (/design/agente)", () => {
  test("renderiza o construtor guiado/avançado", async ({ page }) => {
    await page.goto("/design/agente");
    await expect(page.getByRole("button", { name: "Guiado" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Avançado" })).toBeVisible();
  });
});

test.describe("Playground (/design/playground)", () => {
  test("mostra conversa, os 3 painéis e o diagnóstico do turno", async ({
    page,
  }) => {
    await page.goto("/design/playground");
    await expect(page.getByRole("heading", { name: "Playground" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resetar" })).toBeVisible();
    // Painéis do diagnóstico.
    await expect(page.getByText("Handoff", { exact: true })).toBeVisible();
    await expect(page.getByText("Classificação", { exact: true })).toBeVisible();
    await expect(page.getByText("Resumo", { exact: true })).toBeVisible();
    // A conversa de exemplo termina em handoff aberto: a IA não manda bolha
    // (handoff silencioso), aparece o aviso central e o painel de handoff.
    await expect(
      page.getByText("A IA abriu handoff", { exact: true })
    ).toBeVisible();
    await expect(page.getByText(/não respondeu\. Oriente/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Orientar e responder" })
    ).toBeVisible();
    await expect(page.getByText("Aguardando atendimento")).toBeVisible();
    // Trecho recuperado do RAG aparece no painel de classificação.
    await expect(page.getByText(/Encaixes de urgência/)).toBeVisible();
    // O campo de mensagem existe (fala direto com a IA).
    await expect(
      page.getByPlaceholder("Escreva como um cliente escreveria...")
    ).toBeVisible();
  });
});

test.describe("Assinatura (/design/assinatura)", () => {
  test("conta bloqueada explica o estado sem prometer botão que não existe", async ({
    page,
  }) => {
    await page.goto("/design/assinatura");
    // O mock é o pior caso, que é o que o gate do servidor produz.
    await expect(
      page.getByRole("heading", { name: "Acesso pausado" })
    ).toBeVisible();
    await expect(page.getByText(/teste gratuito terminou/)).toBeVisible();
    await expect(
      page.getByText(/atendimento automático e o envio de mensagens estão parados/)
    ).toBeVisible();
    // O que o dono precisa conferir: estado, plano, atendentes e a conta.
    await expect(page.getByText("Plano", { exact: true })).toBeVisible();
    await expect(page.getByText("nenhum plano escolhido")).toBeVisible();
    await expect(page.getByText("Atendentes", { exact: true })).toBeVisible();
    // O dono não conta como atendente: 3 membros no mock viram 2 atendentes.
    await expect(page.getByText("2 além do dono")).toBeVisible();
    await expect(page.getByText("Teste termina em")).toBeVisible();
    // Sempre dá para sair (a tela é um beco sem saída se não tiver isso).
    await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
  });

  test("é caixa e não vitrine: preço, documento e pagamento, sem propaganda", async ({
    page,
  }) => {
    await page.goto("/design/assinatura");
    // Três linhas secas de plano, com preço e quantos atendentes.
    for (const p of ["Essencial", "Profissional", "Avançado"]) {
      await expect(page.getByText(p, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("R$ 197")).toBeVisible();
    await expect(page.getByText("R$ 597")).toBeVisible();
    // Documento é exigência do gateway para Pix e boleto, e a tela diz isso.
    await expect(page.getByLabel("CPF ou CNPJ de quem paga")).toBeVisible();
    await expect(page.getByText(/Exigido para emitir Pix e boleto/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ir para o pagamento" })
    ).toBeVisible();
    // Sem vitrine: nada de chamariz de marketing dentro do sistema.
    const texto = (await page.locator("body").innerText()).toLowerCase();
    expect(texto).not.toContain("mais popular");
    expect(texto).not.toContain("recomendado");
    expect(texto).not.toContain("melhor custo");
  });
});
