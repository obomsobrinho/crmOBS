import { test, expect, type Page } from "@playwright/test";

// AGENDA PRÓPRIA (docs/plano-agenda.md): a tela de verdade em /design/agenda,
// com a fonte em MEMÓRIA (sem banco). Prova layout, textos e o fluxo da tela;
// o banco (sobreposição recusada, RLS) só depois da migration aplicada.

async function abrir(page: Page, query = "") {
  await page.goto(`/design/agenda${query}`);
  await expect(page.getByRole("heading", { name: "Agenda", level: 1 })).toBeVisible();
}

test.describe("Agenda (preview com dados em memória)", () => {
  test("semana com horários por dia e os bloqueios na lista", async ({ page }) => {
    await abrir(page);
    await expect(page.locator('[data-agenda="dia"]').first()).toBeVisible();
    await expect(page.locator('[data-agenda="linha"][data-situacao="confirmado"]').first()).toBeVisible();
    await expect(page.locator('[data-agenda="bloqueio"]').first()).toContainText("Almoço");
    await expect(page.locator('[data-agenda="estado"]')).toContainText("marca sozinha");
  });

  test("cancelados ficam na outra aba", async ({ page }) => {
    await abrir(page);
    await expect(page.locator('[data-agenda="linha"][data-situacao="cancelado"]')).toHaveCount(0);
    await page.getByRole("tab", { name: "Cancelados" }).click();
    await expect(page.locator('[data-agenda="linha"][data-situacao="cancelado"]')).toHaveCount(1);
  });

  test("marcar pelo time: só horários livres, e o novo aparece na lista", async ({ page }) => {
    await abrir(page);
    const antes = await page.locator('[data-agenda="linha"]').count();
    await page.getByRole("button", { name: "Marcar horário" }).click();
    const dialogo = page.locator('[data-agenda="marcar"]');
    await dialogo.getByLabel("WhatsApp do contato").fill("11 98888-1234");
    await dialogo.getByLabel("Nome do contato").fill("Contato de teste");
    // Amanhã: hoje pode já não ter horário, dependendo da hora em que roda.
    const amanha = await page.evaluate(() => {
      const d = new Date(Date.now() + 86_400_000);
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
    });
    await dialogo.getByLabel("Dia").fill(amanha);
    const horarios = dialogo.locator('[data-agenda="horarios"] button');
    await expect(horarios.first()).toBeVisible();
    // 12:00 é almoço bloqueado e 10:30 já está marcado: nenhum dos dois aparece.
    await expect(dialogo.locator('[data-agenda="horarios"]')).not.toContainText("12:00");
    await expect(dialogo.locator('[data-agenda="horarios"]')).not.toContainText("10:30");
    await horarios.first().click();
    await dialogo.getByRole("button", { name: "Marcar", exact: true }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.locator('[data-agenda="linha"]')).toHaveCount(antes + 1);
  });

  test("cancelar tira da lista de marcados", async ({ page }) => {
    await abrir(page);
    const futuras = page.locator('[data-agenda="linha"][data-situacao="confirmado"]');
    const antes = await futuras.count();
    await futuras.last().getByRole("button", { name: /Ações do horário/ }).click();
    await page.getByRole("menuitem", { name: "Cancelar horário" }).click();
    await page.locator('[data-agenda="cancelar"]').getByRole("button", { name: "Cancelar horário" }).click();
    await expect(futuras).toHaveCount(antes - 1);
  });

  test("lembrete mostra o texto pronto e diz que o envio automático não existe", async ({ page }) => {
    await abrir(page);
    await page.locator('[data-agenda="linha"][data-situacao="confirmado"]').last().getByRole("button", { name: /Ações do horário/ }).click();
    await page.getByRole("menuitem", { name: "Lembrete" }).click();
    await expect(page.locator('[data-agenda="texto-lembrete"]')).toContainText("Passando para lembrar do seu horário");
    await expect(page.locator('[data-agenda="lembrete"]')).toContainText("envio automático ainda não existe");
  });

  test("configurar: o dono vê, o atendente não", async ({ page }) => {
    await abrir(page);
    await page.getByRole("button", { name: "Configurar a agenda" }).click();
    const sheet = page.locator('[data-agenda="configurar"]');
    await expect(sheet.locator('[data-agenda="servico"]')).toHaveCount(3);
    await sheet.getByRole("button", { name: "Adicionar serviço" }).click();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet.getByRole("alert")).toContainText("Todo serviço precisa de nome");
    await abrir(page, "?papel=atendente");
    await expect(page.getByRole("button", { name: "Configurar a agenda" })).toHaveCount(0);
  });

  test("estados: vazio, antes da migration e sem horário de atendimento", async ({ page }) => {
    await abrir(page, "?vazio=1");
    await expect(page.getByText("Nenhum horário neste período")).toBeVisible();
    await page.goto("/design/agenda?indisponivel=1");
    await expect(page.locator('[data-agenda="indisponivel"]')).toContainText("Agenda ainda não disponível");
    await abrir(page, "?semhorario=1");
    await expect(page.locator('[data-agenda="estado"]')).toContainText("falta o horário de atendimento");
  });

  test("nenhum texto com travessão", async ({ page }) => {
    await abrir(page);
    expect(await page.locator("body").innerText()).not.toMatch(/[–—]/);
  });
});
