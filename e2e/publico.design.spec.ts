import { test, expect } from "@playwright/test";

// Telas públicas (sem login): cadastro self-service, login e recuperação de
// senha. Roda no projeto `sem-login` pelo sufixo do arquivo.
//
// Nenhum teste aqui dispara e-mail de verdade nem cria conta: o caminho que cria
// dados é o POST /api/signup, verificado à parte por script.

test.describe("Cadastro (/cadastro)", () => {
  test("pede empresa e e-mail, e não pede senha", async ({ page }) => {
    await page.goto("/cadastro");
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
    await expect(page.getByLabel("Nome da empresa")).toBeVisible();
    await expect(page.getByLabel("Seu e-mail")).toBeVisible();
    // A senha NUNCA passa pelo nosso servidor: o formulário não tem campo dela.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(
      page.getByText(/Você escolhe sua senha pelo link/)
    ).toBeVisible();
  });

  test("leva de volta para o login", async ({ page }) => {
    await page.goto("/cadastro");
    await page.getByRole("link", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  });
});

test.describe("Login (/login)", () => {
  test("oferece criar conta e recuperar senha", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("link", { name: "Esqueci minha senha" })
    ).toBeVisible();
    await page.getByRole("link", { name: "Criar conta" }).click();
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
  });

  test("o painel de marca diz só o combinado e não entra na ordem do teclado", async ({ page }) => {
    await page.goto("/login");
    const painel = page.locator('[data-slot="painel-marca"]');
    await expect(
      painel.getByRole("heading", { name: "A central inteligente do seu WhatsApp." })
    ).toBeVisible();
    await expect(painel).toContainText("Atende, qualifica e organiza cada cliente até a venda.");
    // Vocabulário que o dono tirou da tela (voz da marca).
    await expect(painel).not.toContainText(/24 horas|CRM|agente de IA/i);
    // O celular é ilustração: nada nele é focável nem chega ao leitor de tela.
    const celular = page.locator('[data-slot="celular-conversa"]');
    await expect(celular).toHaveAttribute("aria-hidden", "true");
    await expect(celular.locator("a, button, input")).toHaveCount(0);
  });

  test("a animação tem fim e não mexe no layout da conversa", async ({ page }) => {
    await page.goto("/login");
    const medida = await page.evaluate(() => {
      const animacoes = document.getAnimations();
      return {
        total: animacoes.length,
        fim: Math.max(...animacoes.map((a) => Number(a.effect?.getComputedTiming().endTime))),
        propriedades: [
          ...new Set(
            animacoes.flatMap((a) =>
              (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k))
            ),
          ),
        ],
      };
    });
    expect(medida.total).toBeGreaterThan(0);
    // Sem `infinite`, senão endTime seria Infinity: para em menos de 8s.
    expect(medida.fim).toBeLessThan(8_000);
    for (const p of medida.propriedades) {
      expect(["offset", "computedOffset", "easing", "composite", "opacity", "transform"]).toContain(p);
    }
  });

  test("com movimento reduzido mostra a conversa completa parada", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    const celular = page.locator('[data-slot="celular-conversa"]');
    await expect(celular).toContainText("Boa noite! Vocês têm horário amanhã?");
    await expect(celular).toContainText("Pronto, marcado para amanhã às 14h.");
    await expect(page.locator('[data-slot="celular-selo"]')).toHaveCSS("opacity", "1");
    await expect(celular.locator(".celular-balao").last()).toHaveCSS("opacity", "1");
    await expect(celular.locator(".celular-digitando").first()).toHaveCSS("opacity", "0");
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

test.describe("Recuperar senha (/recuperar-senha)", () => {
  test("responde igual para qualquer e-mail (não vira verificador de contas)", async ({
    page,
  }) => {
    await page.goto("/recuperar-senha");
    await expect(
      page.getByRole("heading", { name: "Recuperar senha" })
    ).toBeVisible();
    // Endereço inexistente de propósito: nenhum e-mail é enviado.
    await page.getByLabel("E-mail").fill("ninguem-aqui-e2e@deskcrm-teste.local");
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(page.getByRole("heading", { name: "Link enviado" })).toBeVisible();
    await expect(page.getByText(/Se existir uma conta com esse e-mail/)).toBeVisible();
  });
});
