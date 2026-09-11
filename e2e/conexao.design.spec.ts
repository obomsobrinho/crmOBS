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
