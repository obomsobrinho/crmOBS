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
    // Os filtros viraram CHIPS em 18/09/2026, no lugar do menu suspenso: o menu
    // escondia a contagem, e dava para ter três conversas esperando por você sem
    // nada na tela dizendo isso. "Precisa de você" virou "Esperando", o mesmo
    // nome do grupo da lista.
    await expect(page.getByRole("button", { name: /Todas/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Esperando/ })
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
  test("renderiza as três abas mais a saída para o modo avançado", async ({
    page,
  }) => {
    await page.goto("/design/agente");
    // As abas agora são as três SEÇÕES do formulário, e trocam conteúdo de
    // verdade. O par guiado/avançado deixou de ser aba em 28/08/2026: as três
    // abas são recortes do MESMO formulário e o avançado é outro formulário, e
    // misturar os dois sentidos numa faixa só fazia "prompt à mão" parecer mais
    // uma seção da configuração guiada.
    await expect(page.getByRole("tab", { name: "Quem atende" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "O que ele sabe" })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "O que ele pode fazer" })
    ).toBeVisible();

    await expect(page.getByRole("tab", { name: "Guiado" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Avançado" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Escrever o prompt à mão" })
    ).toBeVisible();
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

// Desenho do atendimento aplicado em 18/09/2026 (pasta "Formulário enviado,
// aguardando respostas"), dentro da estrutura de cartões que já existia: o dono
// pediu para manter cartão de conversas, cartão de chat e cartão de detalhes.
test.describe("Lista de conversas redesenhada", () => {
  test("a lista vem agrupada por estado, com contagem", async ({ page }) => {
    await page.goto("/design");
    const grupos = page.locator('[data-slot="inbox-grupo"]');
    await expect(grupos.first()).toBeVisible();
    // A ordem é a da urgência, e é ela que responde "por onde eu começo?" sem
    // ninguém filtrar nada.
    const textos = (await grupos.allInnerTexts()).join(" | ");
    expect(textos).toMatch(/Esperando você|Assumidas pelo time|A IA está atendendo/);
  });

  test("o filtro mostra o número junto do rótulo", async ({ page }) => {
    await page.goto("/design");
    const chips = page.locator('[data-slot="inbox-chip"]');
    await expect(chips.first()).toBeVisible();
    // O menu suspenso antigo escondia a contagem atrás de um clique: dava para
    // ter conversas esperando por você sem nada na tela dizendo isso.
    for (const c of await chips.all()) await expect(c).toContainText(/\d+/);
  });

  test("filtrar desliga o agrupamento", async ({ page }) => {
    await page.goto("/design");
    const chip = page.locator('[data-slot="inbox-chip"]').filter({ hasText: /Esperando/ });
    await expect(chip).toBeVisible();
    await page.waitForTimeout(400);
    await chip.click();
    // Com a lista recortada, um cabeçalho repetindo o nome do filtro é ruído: a
    // lista inteira já é daquele grupo.
    await expect(page.locator('[data-slot="inbox-grupo"]')).toHaveCount(0);
  });
});

test.describe("Conversa redesenhada", () => {
  test("o entendimento da IA é a primeira linha da conversa", async ({ page }) => {
    await page.goto("/design");
    const faixa = page.locator('[data-slot="conversa-entendimento"]');
    await expect(faixa).toBeVisible();
    await expect(faixa).toContainText(/O cliente quer/i);
    // ⚠️ Uma vez só na tela. Antes o mesmo texto morava na coluna da direita;
    // ter os dois é a mesma frase duas vezes, e a de cima é a que se lê primeiro.
    await expect(page.getByText("Entendimento", { exact: true })).toHaveCount(0);
  });

  test("os modos do composer dizem PARA ONDE o texto vai", async ({ page }) => {
    await page.goto("/design");
    // Eram abas sublinhadas. Viraram botões porque trocar de modo aqui não troca
    // a vista do mesmo conteúdo: troca o destino, que é o erro caro desta tela
    // (mandar para o cliente o que era nota).
    await expect(page.getByRole("tab", { name: /Responder ao cliente/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Nota interna/ })).toBeVisible();
    await expect(page.getByText("vai para o WhatsApp do cliente")).toBeVisible();
    await page.getByRole("tab", { name: /Nota interna/ }).click();
    await expect(page.getByText("fica só entre vocês")).toBeVisible();
  });
});
