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
  test("sete colunas, hoje destacado, contador, cartões, bloqueio e a linha do agora", async ({ page }) => {
    await abrir(page);
    await expect(page.locator('[data-agenda="cabecalho-dia"]')).toHaveCount(7);
    await expect(page.locator('[data-agenda="cabecalho-dia"][data-hoje="sim"]')).toHaveCount(1);
    await expect(page.locator('[data-agenda="contador"]').first()).toBeVisible();
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
    await d.getByLabel("WhatsApp do contato").fill("11 98888-1234");
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
    await expect(page.locator('[data-agenda="horario-atendimento"]')).toContainText("09:00 às 18:00");
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
