import { test, expect } from "@playwright/test";

// O canal de feedback do beta.
//
// A tela `/design` monta o NavRail SEM sessão, então o envio aqui é simulado
// (o componente só grava quando recebe `clientId`). O que estes testes prendem
// não é a gravação, que é RLS e foi provada por impersonação no banco: é o
// LUGAR do item e o TEXTO da confirmação, que são as duas decisões de produto.

async function abrirFeedback(page: import("@playwright/test").Page) {
  await page.goto("/design");
  // O dropdown do rail é o único que oferece "Ver perfil".
  await page.getByRole("button", { name: /Ver perfil/ }).click();
  await page.getByRole("menuitem", { name: "Enviar feedback" }).click();
  const dialogo = page.locator('[data-slot="feedback-dialog"]');
  await expect(dialogo).toBeVisible();
  return dialogo;
}

test.describe("Canal de feedback do beta", () => {
  test("mora no menu do avatar, e não num botão flutuante", async ({ page }) => {
    await page.goto("/design");

    // ⚠️ Nada de botão flutuante. Ele cobriria conteúdo em TODA tela do produto
    // para servir a uma ação que a pessoa usa poucas vezes no beta inteiro.
    const flutuantes = await page.evaluate(
      () =>
        [...document.querySelectorAll("button, a")].filter((el) => {
          const p = getComputedStyle(el).position;
          return (
            (p === "fixed" || p === "sticky") &&
            /feedback|opini/i.test((el as HTMLElement).innerText)
          );
        }).length
    );
    expect(flutuantes).toBe(0);

    await page.getByRole("button", { name: /Ver perfil/ }).click();
    const menu = page.locator('[data-slot="dropdown-menu-content"]');
    await expect(
      menu.getByRole("menuitem", { name: "Enviar feedback" })
    ).toBeVisible();
  });

  test("abre um diálogo da camada base, com caixa de texto e envio", async ({
    page,
  }) => {
    const dialogo = await abrirFeedback(page);

    await expect(
      dialogo.getByRole("textbox", { name: "Seu relato" })
    ).toBeVisible();
    // Vazio não envia: relato em branco é ruído que ninguém consegue ler depois.
    await expect(dialogo.getByRole("button", { name: "Enviar" })).toBeDisabled();

    await dialogo
      .getByRole("textbox", { name: "Seu relato" })
      .fill("o botao de enviar some quando eu rolo a lista");
    await expect(dialogo.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  test("a confirmação agradece e NÃO promete resposta", async ({ page }) => {
    const dialogo = await abrirFeedback(page);
    await dialogo
      .getByRole("textbox", { name: "Seu relato" })
      .fill("um relato qualquer");
    await dialogo.getByRole("button", { name: "Enviar" }).click();

    await expect(dialogo.getByText("Recebido, obrigado.")).toBeVisible();

    // ⚠️ É UMA PESSOA SÓ atendendo dez empresas. "Vamos te responder" é promessa
    // que o dono não consegue cumprir, e promessa quebrada custa mais do que o
    // relato vale.
    const texto = await dialogo.innerText();
    for (const proibido of [
      /respondemos/i,
      /vamos responder/i,
      /entraremos em contato/i,
      /retorn(o|amos|aremos)/i,
      /em breve/i,
      /nossa equipe/i,
    ]) {
      expect(texto, `confirmação não pode dizer ${proibido}`).not.toMatch(
        proibido
      );
    }
  });

  test("não usa travessão em texto visível", async ({ page }) => {
    const dialogo = await abrirFeedback(page);
    const texto = await dialogo.innerText();
    expect(texto).not.toContain("—");
    expect(texto).not.toContain("–");
  });
});
