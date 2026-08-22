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
    // A seção "Atendimento" saiu do painel de contexto na migração de UI: quem
    // atende virou um chip no cabeçalho da conversa, e ter os dois era a mesma
    // decisão em dois lugares. O que ficou é o chip, que abre o seletor.
    await expect(
      page.getByRole("button", { name: /Você|Ninguém assumiu ainda/ }).first()
    ).toBeVisible();
    await expect(page.getByText("Tags", { exact: true })).toBeVisible();
    // "Notas internas" virou só "Notas" no painel, e escrever nota passou a ser
    // uma aba do campo de escrita, em vez de um formulário próprio.
    await expect(page.getByText("Notas", { exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Nota interna/ })).toBeVisible();
    // Os filtros viraram um seletor só: três moram no menu e "Precisa de você"
    // ganhou botão próprio, porque é o corte que faz alguém largar o que está
    // fazendo. "Não lidas" deixou de existir e virou "Sem resposta", no menu.
    await expect(page.getByRole("button", { name: /Todas/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Precisa de você" })
    ).toBeVisible();
  });

  test("busca por nome filtra a lista", async ({ page }) => {
    await page.goto("/design");
    await expect(page.getByRole("link", { name: /Franck/ })).toBeVisible();
    await page.getByPlaceholder("Buscar nome ou mensagem").fill("franck");
    await expect(page.getByRole("link", { name: /Franck/ })).toBeVisible();
    // "Olá, vim pelo qr code!" é de outra conversa; deve sumir no filtro.
    await expect(page.getByText("Olá, vim pelo qr code!")).toHaveCount(0);
  });

  test("contato é editado no lugar, sem passo de abrir formulário", async ({
    page,
  }) => {
    await page.goto("/design");
    // A migração tirou o botão "Editar" que trocava a lista por um formulário
    // com Cancelar e Salvar: eram três cliques para corrigir uma letra. Agora
    // cada linha é o próprio campo e grava ao perder o foco.
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await expect(
      page.getByPlaceholder("Como você chama este contato")
    ).toBeVisible();
    // Sem Cancelar e Salvar: gravar ao perder o foco é o que tirou os cliques.
    await expect(page.getByRole("button", { name: "Salvar" })).toHaveCount(0);
  });
});

test.describe("Agente (/design/agente)", () => {
  test("renderiza o construtor guiado/avançado", async ({ page }) => {
    await page.goto("/design/agente");
    // O seletor de modo virou Tabs do Radix na migração, então o papel ARIA é
    // `tab` dentro de um `tablist`, e não `button` como era antes.
    await expect(page.getByRole("tab", { name: "Guiado" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Avançado" })).toBeVisible();
  });
});

test.describe("Bancada de teste (/design/playground)", () => {
  // A bancada deixou de ser tela e virou painel lateral dentro do /agente. O
  // preview abre o painel já aberto, então o que se testa aqui é o painel.
  test("mostra conversa, os 3 painéis e o diagnóstico do turno", async ({
    page,
  }) => {
    await page.goto("/design/playground");
    const painel = page.locator('[data-slot="sheet-content"]');
    await expect(painel).toBeVisible();
    await expect(
      painel.getByRole("heading", { name: "Testar o agente" })
    ).toBeVisible();
    // A promessa que faz o painel existir: testa o que está na tela, sem salvar.
    await expect(painel.getByText(/mesmo sem salvar/)).toBeVisible();
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
