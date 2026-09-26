import { test, expect } from "@playwright/test";

// O aviso de WhatsApp caído no layout REAL, com login (tenant de teste, a OBS
// desde 17/09/2026).
//
// A queda não dá para forçar na instância de verdade, então o teste intercepta
// a resposta de `GET /api/clients/[id]/whatsapp-status` no browser e devolve o
// estado que quer. O que fica provado é o encaixe: o layout renderiza o
// componente, ele consulta a rota certa depois do carregamento, e o estado
// devolvido vira o aviso. O texto de cada estado é provado em
// `conexao.design.spec.ts`.
test.describe("Aviso de WhatsApp caído no app", () => {
  test("estado close mostra o aviso em cima da página", async ({ page }) => {
    await page.route("**/api/clients/*/whatsapp-status", (route) =>
      route.fulfill({ json: { state: "close" } })
    );
    await page.goto("/inbox");
    const banner = page.locator('[data-slot="whatsapp-banner"][data-estado="close"]');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText("WhatsApp desconectado");
    await expect(banner.getByRole("link", { name: "Reconectar" })).toHaveAttribute(
      "href",
      "/connect"
    );
  });

  test("estado open não mostra nada", async ({ page }) => {
    // Espera-se a REQUISIÇÃO, e não um tempo fixo, para a ausência ser uma
    // afirmação sobre o resultado e não sobre a velocidade da máquina.
    await page.route("**/api/clients/*/whatsapp-status", (route) =>
      route.fulfill({ json: { state: "open" } })
    );
    const consulta = page.waitForResponse("**/api/clients/*/whatsapp-status");
    await page.goto("/inbox");
    await consulta;
    await expect(page.locator('[data-slot="whatsapp-banner"]')).toHaveCount(0);
  });
});
