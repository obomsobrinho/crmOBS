import { test, expect } from "@playwright/test";

// A REGRA DA CASA PARA ÁREA ROLÁVEL, aplicada em 19/09/2026 depois de o dono
// aprovar o tratamento da conversa e pedir "aplica isso em todos os lugares que
// temos scroll, coloque como regra".
//
// A regra e o mecanismo moram em `components/ui/dissolver-rolagem.tsx`. O que
// este arquivo trava é que ela vale em TODA tela, e não só onde alguém lembrou.

/** As telas que têm área rolável, e o que se espera rolar em cada uma. */
const TELAS = [
  { rota: "/design", nome: "atendimento" },
  { rota: "/design/painel", nome: "painel" },
  { rota: "/design/pipeline", nome: "pipeline" },
  { rota: "/design/conhecimento", nome: "base de conhecimento" },
  { rota: "/design/equipe", nome: "equipe" },
  { rota: "/design/playground", nome: "bancada de teste" },
];

// O CELULAR (plano do mobile, fase 6, 23/09/2026): a mesma regra em 375px, com a
// lista de conversas sozinha (`?lista=1`), que no celular é outra tela.
const JANELAS = [
  { largura: 1280, altura: 720, telas: TELAS },
  {
    largura: 375,
    altura: 812,
    telas: [...TELAS, { rota: "/design?lista=1", nome: "lista de conversas" }],
  },
];

test.describe("Regra: toda área rolável dissolve nas bordas", () => {
  for (const { largura, altura, telas } of JANELAS)
  for (const tela of telas) {
    test(`${tela.nome} em ${largura}px: nada rola sem dissolver`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto(tela.rota);
      // Espera a tela assentar: a máscara nasce de uma medida, e medir antes de
      // o layout existir daria falso negativo.
      await expect(page.locator("body")).toBeVisible();
      await page.waitForTimeout(1200);

      const fora = await page.evaluate(() => {
        const rolaveis = [...document.querySelectorAll<HTMLElement>("*")].filter(
          (el) => {
            const c = getComputedStyle(el);
            const rola = /auto|scroll/.test(c.overflowY);
            // Só interessa quem TEM conteúdo escondido: um contêiner com
            // `overflow-y-auto` que cabe inteiro não corta nada.
            return rola && el.scrollHeight - el.clientHeight > 12;
          }
        );
        return rolaveis
          .filter((el) => {
            // Menu e select do Radix têm rolagem própria e altura limitada pela
            // janela; eles não são "área da tela", são flutuantes.
            if (el.closest('[data-slot="dropdown-menu-content"]')) return false;
            if (el.closest('[data-radix-select-viewport]')) return false;
            return !getComputedStyle(el).maskImage.includes("linear-gradient");
          })
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 120));
      });

      expect(fora, `sem dissolução em ${tela.rota}`).toEqual([]);
    });
  }

  test("a área rolável da casa embute a rolagem, e não depende de quem chama", async ({
    page,
  }) => {
    await page.goto("/design");
    // ⚠️ `overflow-y-auto` vem do componente. Uma "área rolável" que não rola é
    // um nome mentindo, e deixar isso para quem chama é o detalhe que alguém
    // esquece e só aparece no dia em que a lista cresce.
    const areas = page.locator('[data-slot="area-rolavel"]');
    const n = await areas.count();
    for (let i = 0; i < n; i++) {
      await expect(areas.nth(i)).toHaveCSS("overflow-y", "auto");
    }
  });
});

test.describe("Regra: a seta diz que tem mais coisa embaixo", () => {
  test("aparece com conteúdo escondido, e leva ao fim quando clicada", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto("/design");
    const viewport = page
      .locator('main [data-slot="scroll-area-viewport"]')
      .first();
    const seta = page.locator('main [data-slot="seta-mais"]');

    // No fim da conversa ela não existe: sinal sem fato é decoração.
    // ⚠️ Espera a conversa ASSENTAR no fim antes de subir (23/09/2026): desde
    // que a conversa gruda no fim enquanto carrega, subir antes disso era correr
    // contra a rolagem inicial, e ela vencia.
    await expect
      .poll(() =>
        viewport.evaluate(
          (el) => el.scrollHeight - el.scrollTop - el.clientHeight
        )
      )
      .toBeLessThan(12);
    await expect(seta).toHaveAttribute("data-visivel", "nao");
    await page.waitForTimeout(500);

    await viewport.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(seta).toHaveAttribute("data-visivel", "sim");

    // ⚠️ E ela FAZ alguma coisa: é o que a separa de um enfeite, e é por isso
    // que ela pode conviver com a dissolução sem furar a regra "um sinal por
    // fato". Clicar leva ao fim.
    await seta.click();
    await expect
      .poll(() =>
        viewport.evaluate(
          (el) => el.scrollHeight - el.scrollTop - el.clientHeight
        )
      )
      .toBeLessThan(12);
    await expect(seta).toHaveAttribute("data-visivel", "nao");
  });

  test("a lista de conversas também tem a dela", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.goto("/design");
    // Conversa e lista são os dois lugares onde ROLAR É A NAVEGAÇÃO. Num bloco
    // curto de formulário, um botão flutuante sobre o conteúdo é mais ruído do
    // que ajuda, e é por isso que a seta não é automática.
    await expect(
      page.locator('aside [data-slot="seta-mais"]').first()
    ).toHaveCount(1);
  });

  test("ela fica fora da ordem de tabulação, mas tem nome", async ({ page }) => {
    await page.goto("/design");
    const seta = page.locator('[data-slot="seta-mais"]').first();
    // Esconder do leitor de tela um botão que o mouse alcança é o pior dos dois
    // mundos; tirar da tabulação é o certo, porque as setas do teclado já rolam.
    await expect(seta).toHaveAttribute("tabindex", "-1");
    await expect(seta).not.toHaveAttribute("aria-hidden", "true");
    expect(await seta.getAttribute("aria-label")).toBeTruthy();
  });
});
