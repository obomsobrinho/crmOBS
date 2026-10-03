import { test, expect } from "@playwright/test";

// Aviso de WhatsApp caído, os quatro estados com `estadoForcado` (sem login, sem
// Evolution). Queda real não dá para forçar na Loja Teste; o que se prova aqui é
// que cada estado renderiza o texto e o link certos, e que `open` não renderiza.
test.describe("Aviso de WhatsApp caído (/design/conexao)", () => {
  test("close, connecting e unknown renderizam; open não", async ({ page }) => {
    await page.goto("/design/conexao");
    await expect(
      page.getByRole("heading", { name: "Aviso de WhatsApp caído" })
    ).toBeVisible();

    await expect(page.locator('[data-slot="whatsapp-banner"]')).toHaveCount(3);

    const close = page.locator('[data-slot="whatsapp-banner"][data-estado="close"]');
    await expect(close).toContainText("WhatsApp desconectado");
    await expect(close).toContainText("o agente não responde");
    await expect(close.getByRole("link", { name: "Reconectar" })).toHaveAttribute(
      "href",
      "/connect"
    );

    const connecting = page.locator(
      '[data-slot="whatsapp-banner"][data-estado="connecting"]'
    );
    await expect(connecting).toContainText("WhatsApp reconectando");
    await expect(connecting.getByRole("link", { name: "Ver conexão" })).toHaveAttribute(
      "href",
      "/connect"
    );

    const unknown = page.locator('[data-slot="whatsapp-banner"][data-estado="unknown"]');
    await expect(unknown).toContainText("Não foi possível verificar a conexão");

    // `open` é a ausência: a seção existe, o aviso não.
    const open = page.locator('[data-preview-estado="open"]');
    await expect(open).toBeVisible();
    await expect(open.locator('[data-slot="whatsapp-banner"]')).toHaveCount(0);
  });

  test("texto sem travessão e sem linguagem de segmento", async ({ page }) => {
    await page.goto("/design/conexao");
    const textos = await page.locator('[data-slot="whatsapp-banner"]').allInnerTexts();
    const junto = textos.join("\n");
    expect(junto.length).toBeGreaterThan(0);
    expect(junto).not.toMatch(/[—–]/);
    // Público misto: nenhum texto fixo pode assumir consulta, paciente ou
    // agendamento (regra do CLAUDE.md).
    expect(junto).not.toMatch(/consulta|paciente|agendamento/i);
  });
});

// Desconectar e trocar de número (03/10/2026), com `estadoForcado` e `preview`:
// sem login e SEM Evolution. O que se prova é o diálogo (que diz a consequência),
// a confirmação e o que a tela faz depois. A rota em si nunca é chamada aqui.
test.describe("Desconectar e trocar número (/design/conexao)", () => {
  test("aberto mostra as duas ações; caído só o caminho de volta", async ({ page }) => {
    await page.goto("/design/conexao");
    const aberto = page.locator('[data-preview-conexao="open"] [data-slot="conexao-agente"]');
    await expect(aberto).toContainText("Conectado");
    await expect(aberto.getByRole("button", { name: "Trocar número" })).toBeVisible();
    await expect(aberto.getByRole("button", { name: "Desconectar" })).toBeVisible();

    const caido = page.locator('[data-preview-conexao="close"] [data-slot="conexao-agente"]');
    await expect(caido).toContainText("Desconectado");
    await expect(caido.getByRole("link", { name: "Conectar" })).toHaveAttribute(
      "href",
      "/connect"
    );
    await expect(caido.getByRole("button")).toHaveCount(0);
  });

  test("o diálogo diz a consequência, cancelar não muda nada", async ({ page }) => {
    await page.goto("/design/conexao");
    const aberto = page.locator('[data-preview-conexao="open"] [data-slot="conexao-agente"]');
    await aberto.getByRole("button", { name: "Trocar número" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Trocar o número do WhatsApp?");
    await expect(dialogo).toContainText("o agente fica Desativado");
    await expect(dialogo).toContainText("continuam aqui, como histórico");
    await expect(dialogo).toContainText("destino dos avisos");
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(aberto).toContainText("Conectado");
  });

  test("desconectar confirma e o bloco passa a mostrar o caminho de volta", async ({ page }) => {
    await page.goto("/design/conexao");
    const aberto = page.locator('[data-preview-conexao="open"] [data-slot="conexao-agente"]');
    await aberto.getByRole("button", { name: "Desconectar" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Desconectar o WhatsApp?");
    await dialogo.getByRole("button", { name: "Desconectar" }).click();
    await expect(aberto).toContainText("Desconectado");
    await expect(aberto.getByRole("link", { name: "Conectar" })).toBeVisible();
  });

  test("textos sem travessão", async ({ page }) => {
    await page.goto("/design/conexao");
    await page
      .locator('[data-preview-conexao="open"]')
      .getByRole("button", { name: "Trocar número" })
      .click();
    const junto = (await page.locator("body").innerText()) + (await page.getByRole("dialog").innerText());
    expect(junto).not.toMatch(/[—–]/);
  });

  test("a tela do Agente mostra a conexão", async ({ page }) => {
    await page.goto("/design/agente");
    const bloco = page.locator('[data-slot="conexao-agente"]');
    await expect(bloco).toContainText("Conectado");
    await expect(bloco.getByRole("button", { name: "Desconectar" })).toBeVisible();
  });

  // A rota é só do dono e exige sessão: sem login nunca chega na Evolution.
  test("a rota de desconectar recusa quem não tem sessão", async ({ request }) => {
    const res = await request.post(
      "/api/clients/00000000-0000-0000-0000-000000000000/disconnect-whatsapp"
    );
    expect(res.status()).toBe(401);
  });
});
