import { test, expect, type Page } from "@playwright/test";

// AGENDA PRÓPRIA (docs/plano-agenda.md, revisão do dono de 28/10/2026): a tela
// de verdade em /design/agenda (grade semanal) e /design/agenda/configuracoes,
// com a fonte em MEMÓRIA (sem banco). Prova layout, textos e o fluxo da tela;
// o banco (sobreposição recusada, RLS, etapa do funil) só com a migration.

async function abrir(page: Page, query = "") {
  await page.goto(`/design/agenda${query}`);
  await expect(page.getByRole("heading", { name: "Agenda", level: 1 })).toBeVisible();
}

test.describe("Agenda: grade semanal (dados em memória)", () => {
  test("sete colunas, hoje destacado, sem contador, cartões e bloqueio; a grade enche a altura", async ({ page }) => {
    await abrir(page);
    await expect(page.locator('[data-agenda="cabecalho-dia"]')).toHaveCount(7);
    await expect(page.locator('[data-agenda="cabecalho-dia"][data-hoje="sim"]')).toHaveCount(1);
    await expect(page.locator('[data-agenda="contador"]')).toHaveCount(0);
    // A grade ocupa a altura toda: nada sobra embaixo da última hora.
    const area = await page.locator('[data-agenda="grade"]').boundingBox();
    const coluna = await page.locator('[data-agenda="coluna"]').first().boundingBox();
    expect(coluna!.height).toBeGreaterThanOrEqual(area!.height - 2);
    await expect(page.locator('[data-agenda="cartao"]').first()).toBeVisible();
    await expect(page.locator('[data-agenda="bloqueio"]').first()).toContainText("Almoço");
    // Cancelado não aparece na grade.
    await expect(page.locator('[data-agenda="cartao"]', { hasText: "Rafael Souza" })).toHaveCount(0);
  });

  test("minicalendário: a semana exibida em destaque, clicar leva a grade para outra semana", async ({ page }) => {
    await abrir(page);
    const exibida = page.locator('[data-agenda="mini-semana"][data-exibida="sim"]');
    await expect(exibida).toHaveCount(1);
    const antes = await exibida.first().textContent();
    await page.getByRole("button", { name: "Próxima semana" }).click();
    await expect(exibida.first()).not.toHaveText(antes ?? "");
    await expect(page.locator('[data-agenda="cabecalho-dia"][data-hoje="sim"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Hoje" }).click();
    await expect(page.locator('[data-agenda="cabecalho-dia"][data-hoje="sim"]')).toHaveCount(1);
  });

  test("clique no horário abre o detalhe com contato, serviço, do que se trata e as ações", async ({ page }) => {
    await abrir(page);
    await page.locator('[data-agenda="cartao"]', { hasText: "Juliana Prado" }).click();
    const detalhe = page.locator('[data-agenda="detalhe"]');
    await expect(detalhe).toContainText("Juliana Prado");
    await expect(detalhe).toContainText("Exame de vista");
    await expect(detalhe).toContainText("multifocais");
    await expect(detalhe).toContainText("(11)");
    await expect(detalhe.getByRole("button", { name: "Remarcar" })).toBeVisible();
    await detalhe.getByRole("button", { name: "Cancelar" }).click();
    await page.locator('[data-agenda="cancelar"]').getByRole("button", { name: "Cancelar horário" }).click();
    await expect(page.locator('[data-agenda="cartao"]', { hasText: "Juliana Prado" })).toHaveCount(0);
  });

  test("marcar pelo time: só livres; fora do expediente aparece quando pedido", async ({ page }) => {
    await abrir(page);
    await page.getByRole("button", { name: "Marcar horário" }).click();
    const d = page.locator('[data-agenda="marcar"]');
    // Contato existente pela busca (no app, no servidor, com limite).
    await d.getByLabel("Buscar contato").fill("jul");
    await d.locator('[data-agenda="resultados-contato"]').getByRole("button", { name: /Juliana Prado/ }).click();
    await expect(d.locator('[data-agenda="contato-escolhido"]')).toContainText("Juliana Prado");
    const amanha = await page.evaluate(() =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + 86_400_000))
    );
    await d.getByLabel("Dia").fill(amanha);
    const horarios = d.locator('[data-agenda="horarios"]');
    await expect(horarios.locator("button").first()).toBeVisible();
    await expect(horarios).not.toContainText("12:00");
    const dentro = await horarios.locator("button").count();
    await d.getByText("Mostrar horários fora do expediente").click();
    await expect.poll(() => horarios.locator("button").count()).toBeGreaterThan(dentro);
    await horarios.locator("button").first().click();
    await d.getByRole("button", { name: "Marcar", exact: true }).click();
    await expect(d).toBeHidden();
  });

  test("atendente não vê a engrenagem; estados vazio e antes da migration", async ({ page }) => {
    await abrir(page, "?papel=atendente");
    await expect(page.getByRole("link", { name: "Configurações da agenda" })).toHaveCount(0);
    await abrir(page, "?vazio=1");
    await expect(page.locator('[data-agenda="cartao"]')).toHaveCount(0);
    await page.goto("/design/agenda?indisponivel=1");
    await expect(page.locator('[data-agenda="indisponivel"]')).toContainText("Agenda ainda não disponível");
  });

  test("nenhum texto com travessão", async ({ page }) => {
    await abrir(page);
    expect(await page.locator("body").innerText()).not.toMatch(/[–—]/);
  });
});

test.describe("Agenda: configurações", () => {
  test("ativa abre a configuração; desligada esconde e o menu perde o item", async ({ page }) => {
    await page.goto("/design/agenda/configuracoes");
    await expect(page.locator('[data-agenda="config-aberta"]')).toBeVisible();
    await expect(page.locator('[data-agenda="horario-agenda"]')).toBeVisible();
    await page.getByLabel("Agenda ativa").click();
    await expect(page.locator('[data-agenda="config-aberta"]')).toHaveCount(0);
    await expect(page.locator('[data-agenda="desligada"]')).toContainText("some do menu");
    await page.goto("/design/agenda/configuracoes?desligada=1");
    await expect(page.locator('[data-slot="rail-itens"]').getByRole("link", { name: "Agenda" })).toHaveCount(0);
  });

  test("intervalo mostra a nota; início tem as 3 opções; antecedência explica", async ({ page }) => {
    await page.goto("/design/agenda/configuracoes");
    await expect(page.locator('[data-agenda="nota-intervalo"]')).toHaveCount(0);
    await page.getByLabel("Intervalo entre horários").click();
    await page.getByRole("option", { name: "10 min" }).click();
    await expect(page.locator('[data-agenda="nota-intervalo"]')).toContainText("O intervalo de 10 min entre horários já entra na conta.");
    await page.getByLabel("Os horários começam").click();
    await expect(page.getByRole("option")).toHaveCount(3);
    await expect(page.getByRole("option", { name: /Logo após o anterior/ })).toContainText("8h, 8h40, 9h20");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-agenda="texto-antecedencia"]')).toContainText("pelo menos 2h de antecedência");
  });

  test("serviço sem nome não salva; com um serviço a mais salva", async ({ page }) => {
    await page.goto("/design/agenda/configuracoes");
    await page.getByRole("button", { name: "Adicionar serviço" }).click();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator('[data-agenda="configuracoes"]').getByRole("alert")).toContainText("Todo serviço precisa de nome");
    await page.getByLabel("Nome do serviço 4").fill("Retorno");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator('[data-agenda="configuracoes"]').getByRole("status")).toContainText("Salvo");
  });
});

test.describe("Agenda: marcar com contato novo e campos", () => {
  test("sem achar na busca, segue como contato novo com o telefone já preenchido", async ({ page }) => {
    await page.goto("/design/agenda");
    await page.getByRole("button", { name: "Marcar horário" }).click();
    const d = page.locator('[data-agenda="marcar"]');
    await d.getByLabel("Buscar contato").fill("11 92020");
    await expect(d.locator('[data-agenda="resultados-contato"]')).toContainText("Nenhum contato encontrado");
    await d.getByRole("button", { name: "Contato novo" }).click();
    await expect(d.getByLabel("WhatsApp do contato")).toHaveValue("11 92020");
  });

  test("serviço e data com a mesma altura e largura", async ({ page }) => {
    await page.goto("/design/agenda");
    await page.getByRole("button", { name: "Marcar horário" }).click();
    const d = page.locator('[data-agenda="marcar"]');
    const s = (await d.getByLabel("Serviço").boundingBox())!;
    const t = (await d.getByLabel("Dia").boundingBox())!;
    expect(Math.abs(s.height - t.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.width - t.width)).toBeLessThanOrEqual(1);
  });
});

test.describe("Agenda: dias e horários próprios", () => {
  test("editáveis, com o botão de copiar o horário de atendimento", async ({ page }) => {
    await page.goto("/design/agenda/configuracoes");
    const bloco = page.locator('[data-agenda="horario-agenda"]');
    await expect(bloco).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar o horário de atendimento" })).toBeVisible();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator('[data-agenda="configuracoes"]').getByRole("status")).toContainText("Salvo");
  });

  test("sem horário de atendimento, não há o que copiar", async ({ page }) => {
    await page.goto("/design/agenda/configuracoes?semhorario=1");
    await expect(page.getByRole("button", { name: "Copiar o horário de atendimento" })).toHaveCount(0);
    await expect(page.locator('[data-agenda="configuracoes"]')).toContainText("ainda não tem horário de atendimento para copiar");
  });
});

test("o botão de copiar o horário de atendimento vem antes da lista de dias", async ({ page }) => {
  await page.goto("/design/agenda/configuracoes");
  const botao = (await page.getByRole("button", { name: "Copiar o horário de atendimento" }).boundingBox())!;
  const dias = (await page.locator('[data-agenda="horario-agenda"]').boundingBox())!;
  expect(botao.y).toBeLessThan(dias.y);
});

test("a grade mostra a faixa do horário da agenda (9h às 18h no preview) e linhas só entre as horas", async ({ page }) => {
  await page.goto("/design/agenda");
  const rotulos = page.locator('[data-agenda="grade"] > div > div').first().locator("span");
  await expect(rotulos.first()).toHaveText("9h");
  await expect(rotulos.last()).toHaveText("18h");
  // 9 horas = 8 linhas internas por coluna; nenhuma no topo nem no fim.
  await expect(page.locator('[data-agenda="coluna"]').first().locator("div.h-px")).toHaveCount(8);
});

test.describe("Agenda: decisões finais na grade e nas configurações", () => {
  test("clique num horário vazio abre o Marcar horário com o dia preenchido", async ({ page }) => {
    await page.goto("/design/agenda");
    const coluna = page.locator('[data-agenda="coluna"]').nth(4);
    const dia = await coluna.getAttribute("data-dia");
    await coluna.locator('[data-agenda="vazio"]').click({ position: { x: 10, y: 5 } });
    const d = page.locator('[data-agenda="marcar"]');
    await expect(d).toBeVisible();
    await expect(d.getByLabel("Dia")).toHaveValue(dia!);
  });

  test("bloquear dias inteiros mostra o bloqueio em cada dia do período", async ({ page }) => {
    await page.goto("/design/agenda");
    await page.getByRole("button", { name: "Bloquear" }).click();
    const d = page.locator('[data-agenda="bloquear"]');
    await d.getByText("Dias inteiros").click();
    const dias = page.locator('[data-agenda="coluna"]');
    const de = await dias.nth(5).getAttribute("data-dia");
    const ate = await dias.nth(6).getAttribute("data-dia");
    await d.getByLabel("Do dia").fill(de!);
    await d.getByLabel("Até o dia").fill(ate!);
    await d.getByLabel("Motivo").fill("Recesso");
    await d.getByRole("button", { name: "Bloquear", exact: true }).click();
    await expect(dias.nth(5).locator('[data-agenda="bloqueio"]', { hasText: "Recesso" })).toBeVisible();
    await expect(dias.nth(6).locator('[data-agenda="bloqueio"]', { hasText: "Recesso" })).toBeVisible();
  });

  test("configurações listam os feriados com a opção de atender", async ({ page }) => {
    await page.goto("/design/agenda/configuracoes");
    await expect(page.locator('[data-agenda="feriado-item"]').first()).toBeVisible();
    await expect(page.locator('[data-agenda="feriados"]')).toContainText("Finados");
  });
});

test("a ficha do contato mostra os agendamentos dele (futuro, cancelado e passado), do mais recente para o mais antigo", async ({ page }) => {
  await page.goto("/design/contatos?sel=1");
  const bloco = page.locator('[data-slot="painel-agendamentos"]');
  await expect(bloco).toBeVisible();
  const itens = bloco.locator('[data-slot="agendamento-do-contato"]');
  await expect(itens).toHaveCount(3);
  await expect(itens.nth(0)).toContainText("Marcado");
  await expect(itens.nth(1)).toContainText("Cancelado");
  await expect(itens.nth(2)).toContainText("Realizado");
});

test("horário confirmado pelo contato aparece no cartão e no detalhe", async ({ page }) => {
  await page.goto("/design/agenda");
  const cartao = page.locator('[data-agenda="cartao"]', { hasText: "Juliana Prado" });
  await expect(cartao.locator('[data-agenda="cartao-confirmado"]')).toBeVisible();
  await cartao.click();
  await expect(page.locator('[data-agenda="detalhe-presenca"]')).toContainText("Confirmada pelo contato");
});

test("montagem: o mesmo item Agenda no passo 2, sem pergunta, e marcado pede só os serviços", async ({ page }) => {
  await page.goto("/design/montagem?passo=sabe");
  const item = page.locator('[data-agenda="item-agenda"]');
  await expect(item).toContainText("Para quem atende com horário marcado. Ative para a IA marcar, remarcar e cancelar horários pela conversa.");
  await expect(page.getByText("trabalha com horário marcado?")).toHaveCount(0);
  // Desmarcado: nada abre, e o Continuar segue sem agenda.
  await expect(item.locator('[data-agenda="montagem-servicos"]')).toHaveCount(0);
  await item.getByLabel("Agenda ativa").click();
  const servicos = item.locator('[data-agenda="montagem-servicos"]');
  await expect(servicos).toBeVisible();
  // Só os serviços: nada de horário, intervalo ou antecedência na montagem.
  await expect(item.getByText("Intervalo entre horários")).toHaveCount(0);
  await expect(item.getByText("Antecedência mínima")).toHaveCount(0);
  // Marcada sem serviço: recusa ali mesmo, no passo 2.
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.locator('[data-agenda="montagem-erro"]')).toHaveText("Cadastre pelo menos um serviço para ligar a agenda.");
  await servicos.getByRole("button", { name: "Adicionar serviço" }).click();
  await servicos.getByLabel("Nome do serviço 1").fill("Avaliação");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.locator('[data-slot="montagem-bancada"]')).toBeVisible();
});

test("configurações: serviço com erro fica vermelho, com a mensagem no bloco, e a tela rola até ele", async ({ page }) => {
  await page.goto("/design/agenda/configuracoes");
  await page.getByRole("button", { name: "Adicionar serviço" }).click();
  // Serviço novo sem nome: salvar recusa.
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  const bloco = page.locator('[data-agenda="bloco-servicos"]');
  await expect(bloco.locator('[data-agenda="servicos"]')).toHaveAttribute("data-erro", "");
  await expect(bloco).toContainText("Todo serviço precisa de nome");
  const ultimo = bloco.getByRole("textbox", { name: /Nome do serviço/ }).last();
  await expect(ultimo).toHaveAttribute("aria-invalid", "true");
  await expect(bloco).toBeInViewport();
  // Corrigiu: o vermelho sai.
  await ultimo.fill("Retorno");
  await expect(bloco.locator('[data-agenda="servicos"]')).not.toHaveAttribute("data-erro", "");
});
