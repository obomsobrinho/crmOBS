import { test, expect } from "@playwright/test";

// Tela do agente depois da consolidação. Roda sem login em /design/agente.
//
// A tela tinha QUATRO cartões empilhados (publicar, notificações do grupo,
// horário no modo avançado, formulário), todos falando da mesma coisa. Virou um.
// Estes testes travam as decisões dessa consolidação, não o pixel.

test.describe("Tela do agente (/design/agente)", () => {
  test("o prompt gerado fica atrás de um botão, não na tela", async ({ page }) => {
    await page.goto("/design/agente");

    // Fechado por padrão: o prompt é o texto que a IA usa, não é o que o cliente
    // veio fazer aqui, e 9 KB dele ocupavam metade da tela.
    await expect(page.getByText("### IDENTIDADE")).toHaveCount(0);

    await page.getByRole("button", { name: "Ver prompt" }).click();
    await expect(
      page.getByRole("heading", { name: "Prompt gerado" })
    ).toBeVisible();
    await expect(page.getByText("### IDENTIDADE")).toBeVisible();
    // O custo aparece junto do texto: é o que evita colar o catálogo inteiro.
    await expect(page.getByText(/caracteres · ~/)).toBeVisible();

    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(page.getByText("### IDENTIDADE")).toHaveCount(0);
  });

  test("salvar fica no fim do formulário, não no cabeçalho", async ({ page }) => {
    await page.goto("/design/agente");
    const salvar = page.getByRole("button", { name: "Salvar" });
    await expect(salvar).toHaveCount(1);

    // Prova de posição, e não de aparência: o Salvar tem que vir DEPOIS da
    // última seção do formulário na ordem do documento.
    const depois = await page.evaluate(() => {
      const botoes = [...document.querySelectorAll("button")];
      const alvo = botoes.find((b) => b.textContent?.trim() === "Salvar");
      const secoes = [...document.querySelectorAll("h2, h3")];
      const ultima = secoes[secoes.length - 1];
      if (!alvo || !ultima) return null;
      // 4 = DOCUMENT_POSITION_FOLLOWING
      return (ultima.compareDocumentPosition(alvo) & 4) !== 0;
    });
    expect(depois).toBe(true);
  });

  test("o grupo de avisos mora dentro dos objetivos", async ({ page }) => {
    await page.goto("/design/agente");
    // Objetivos moram na terceira aba desde 28/08/2026.
    await page.getByRole("tab", { name: "O que ele pode fazer" }).click();
    // O mock tem "Agendar" marcado, que é o único objetivo que usa o grupo.
    await expect(page.getByText("Grupo de WhatsApp para avisar")).toBeVisible();
    await expect(page.getByPlaceholder("120363000000000000@g.us")).toBeVisible();
    // E não existe mais um cartão próprio com Salvar separado para isso.
    await expect(page.getByText("Notificações no WhatsApp")).toHaveCount(0);
  });

  test("a chave de ligar substituiu o cartão de publicar", async ({ page }) => {
    await page.goto("/design/agente");
    await expect(
      page.getByRole("switch", { name: "Desativar agente" })
    ).toBeVisible();
    await expect(page.getByText("Agente ativo")).toBeVisible();
    // Vocabulário: nada de "publicado" nem de "pausado" nesta tela. Pausada é a
    // IA de uma conversa quando um humano assume, e é outra coisa.
    await expect(page.getByText("Agente publicado")).toHaveCount(0);
    await expect(page.getByText("Agente pausado")).toHaveCount(0);
  });

  test("a bancada de teste abre nesta tela, sem sair dela", async ({ page }) => {
    await page.goto("/design/agente");

    // Configurar e testar são a mesma atividade. Estavam em duas telas, e testar
    // exigia SALVAR antes, que é publicar: o dono mexia no agente que está
    // atendendo cliente de verdade só para experimentar.
    await page.getByRole("button", { name: "Testar o agente" }).click();
    const painel = page.locator('[data-slot="sheet-content"]');
    await expect(painel).toBeVisible();
    await expect(painel.getByText(/mesmo sem salvar/)).toBeVisible();
    // Conversa de um lado, diagnóstico do outro.
    await expect(
      painel.getByPlaceholder("Escreva como um cliente escreveria...")
    ).toBeVisible();
    await expect(painel.getByText("Classificação", { exact: true })).toBeVisible();
    await expect(painel.getByText("Handoff", { exact: true })).toBeVisible();

    // E o formulário continua atrás, na mesma rota: o ciclo é editar, testar,
    // voltar, editar, sem navegação no meio.
    await painel.getByRole("button", { name: "Fechar" }).click();
    await expect(painel).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
  });

  test("não usa travessão em texto visível", async ({ page }) => {
    await page.goto("/design/agente");
    const texto = await page.locator("body").innerText();
    expect(texto).not.toContain("—");
    expect(texto).not.toContain("–");
  });
});

test.describe("Modo avançado: rabo da base (/design/agente)", () => {
  test("as quatro seções finais são fixas e ficam fora da caixa de edição", async ({
    page,
  }) => {
    await page.goto("/design/agente");
    await page.getByRole("button", { name: "Escrever o prompt à mão" }).click();

    await expect(page.getByText("Fixo, sempre no fim do seu prompt")).toBeVisible();
    // As quatro que garantem o comportamento. Aparecem no bloco fixo, não na
    // textarea: quem está no avançado edita o resto, não o contrato.
    const fixo = page.locator("pre").first();
    await expect(fixo).toContainText("### PRECEDÊNCIA");
    await expect(fixo).toContainText("### QUANDO CHAMAR UM HUMANO");
    await expect(fixo).toContainText("### ANTI-MANIPULAÇÃO");
    await expect(fixo).toContainText("### OUTPUT");

    // O texto editável NÃO deve trazer o rabo, senão apareceria duas vezes e o
    // save o removeria de volta, dando impressão de perda.
    const caixa = await page.locator("textarea").last().inputValue();
    expect(caixa).not.toContain("### OUTPUT");
    expect(caixa).not.toContain("### PRECEDÊNCIA");
  });

  test("prompt curto avisa que não vai ser cacheado; prompt cheio não avisa", async ({
    page,
  }) => {
    await page.goto("/design/agente");
    // O mock do guiado compila ~10 KB, bem acima do mínimo cacheável, então o
    // aviso NÃO pode aparecer aqui: avisar sempre treina a pessoa a ignorar.
    await expect(page.getByText(/O prompt tem cerca de/)).toHaveCount(0);

    await page.getByRole("button", { name: "Escrever o prompt à mão" }).click();
    await page.locator("textarea").last().fill("Atenda bem e seja simpática.");

    // Agora avisa, e diz o número: é custo, não estética. Sem cache, a persona
    // inteira paga preço cheio de entrada em TODA mensagem.
    await expect(page.getByText(/O prompt tem cerca de/)).toBeVisible();
    await expect(page.getByText(/2\.048 que a OpenAI pede/)).toBeVisible();
  });

  test("o preview mostra o texto do cliente MAIS o rabo", async ({ page }) => {
    await page.goto("/design/agente");
    await page.getByRole("button", { name: "Escrever o prompt à mão" }).click();
    await page.getByRole("button", { name: "Ver prompt" }).click();
    // Escopado ao painel: "### IDENTIDADE" também aparece na textarea, e o que
    // interessa aqui é o que o n8n vai ler de verdade. Se o preview mostrasse só
    // o texto do cliente, estaria escondendo metade do prompt.
    const painel = page.locator('[data-slot="sheet-content"]');
    await expect(painel).toContainText("### IDENTIDADE");
    await expect(painel).toContainText("Pausar NÃO encerra a conversa");
  });
});
