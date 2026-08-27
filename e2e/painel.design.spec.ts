import { test, expect } from "@playwright/test";

// Redesenho do painel (26/08/2026). Roda sem login, em /design/painel, que agora
// renderiza a tela INTEIRA (antes mostrava só os 4 cartões, sem a manchete, então
// revisar o painel pelo /design era revisar meia tela).

/** Troca o tema pelo mesmo caminho da tela: cookie mais recarga. */
async function tema(
  page: import("@playwright/test").Page,
  valor: "light" | "dark"
) {
  await page.context().addCookies([
    { name: "theme", value: valor, url: "http://localhost" },
  ]);
  await page.goto("/design/painel");
}

test.describe("Painel: hierarquia de numeral", () => {
  test("três degraus de número, e a manchete é o maior", async ({ page }) => {
    await page.goto("/design/painel");

    // O defeito que isto conserta: os dez números da tela usavam o MESMO
    // `text-display` (24px), e a manchete só se distinguia por cor de fundo.
    const tamanhos = await page.evaluate(() => {
      const px = (e: Element) =>
        Math.round(parseFloat(getComputedStyle(e).fontSize));
      const vals = [...document.querySelectorAll('[data-slot="stat-valor"]')];
      const manchete = document
        .querySelector('[data-slot="stat"]')!
        .querySelector('[data-slot="stat-valor"]')!;
      return {
        distintos: [...new Set(vals.map(px))].sort((a, b) => a - b),
        manchete: px(manchete),
        maior: Math.max(...vals.map(px)),
      };
    });

    expect(tamanhos.distintos).toEqual([18, 24, 32]);
    // A manchete é o primeiro cartão da tela E o maior numeral.
    expect(tamanhos.manchete).toBe(32);
    expect(tamanhos.manchete).toBe(tamanhos.maior);
  });

  test("todo cartão diz de qual período é o número", async ({ page }) => {
    await page.goto("/design/painel");

    // O defeito real que isto mata: a tela mostrava "Leads qualificados 9"
    // (7 dias) ao lado de "19 leads qualificados em julho" (mês), com o período
    // escrito só no título da seção.
    const legendas = await page.evaluate(() =>
      [...document.querySelectorAll('[data-slot="stat"]')].map((s) =>
        (s.querySelector('[data-slot="stat-legenda"]')?.textContent ?? "").trim()
      )
    );

    expect(legendas.length).toBeGreaterThanOrEqual(4);
    expect(legendas.filter((l) => l === "")).toEqual([]);
  });
});

test.describe("Painel: cartões flutuando sobre o canvas", () => {
  for (const modo of ["dark", "light"] as const) {
    test(`no ${modo} o cartão fica ACIMA do fundo da página`, async ({ page }) => {
      await tema(page, modo);

      // No claro isto só funciona porque o painel deixou de ser um cartão
      // branco: `--s-bloco` claro é #f3f3f6, exatamente igual ao `--canvas`, e um
      // cartão `bloco` sobre o canvas ficaria invisível.
      const cores = await page.evaluate(() => {
        const g = (e: Element) => getComputedStyle(e).backgroundColor;
        return {
          canvas: getComputedStyle(document.body).backgroundColor,
          cartoes: [
            ...new Set([...document.querySelectorAll('[data-slot="stat"]')].map(g)),
          ],
        };
      });

      expect(cores.cartoes.length).toBeGreaterThan(0);
      expect(cores.cartoes).not.toContain(cores.canvas);
    });
  }
});

test.describe("Painel: selo de variação", () => {
  test("resposta mais rápida é BOA notícia, mesmo o número tendo caído", async ({
    page,
  }) => {
    await page.goto("/design/painel");

    // É o erro clássico que a direção declarada em lib/delta.ts evita: o padrão
    // de qualquer dashboard é "subiu, verde", e no tempo de resposta menos é
    // melhor. O mock cai de 21s para 8s.
    const selo = page.getByText(/mais rápido/);
    await expect(selo).toBeVisible();

    const classe = await selo.evaluate(
      (el) => (el.closest('[data-slot="badge"]') ?? el).className
    );
    expect(classe).toContain("human"); // verde = estado bom
  });

  test("base pequena sai em valor absoluto, não em porcentagem", async ({
    page,
  }) => {
    await page.goto("/design/painel");
    // Leads: 6 na semana anterior (abaixo do piso de 10) e 9 agora. "+50%" seria
    // verdade aritmética e mentira de leitura, então sai "+3".
    await expect(page.getByText("+3", { exact: true })).toBeVisible();
  });

  test("o cartão de espera não tem selo", async ({ page }) => {
    await page.goto("/design/painel");
    // É foto de AGORA, não período: comparar "agora" com "agora da semana
    // passada" não significa nada.
    const cartao = page
      .locator('[data-slot="stat"]')
      .filter({ hasText: "Esperando você" });
    await expect(cartao).toHaveCount(1);
    await expect(cartao.locator('[data-slot="badge"]')).toHaveCount(0);
    await expect(cartao.locator('[data-slot="stat-legenda"]')).toHaveText("agora");
  });
});

test.describe("Painel: gráfico de 14 dias", () => {
  test("14 colunas, e o dia sem movimento aparece em vez de sumir", async ({
    page,
  }) => {
    await page.goto("/design/painel");

    const secao = page.locator("section").filter({ hasText: "Movimento dos" });
    await expect(secao).toBeVisible();

    const colunas = secao.locator("div[title]");
    await expect(colunas).toHaveCount(14);

    // Dia vazio vira risco no chão. Sem ele o eixo encurta e o buraco, que é a
    // informação, desaparece.
    const vazios = await colunas.evaluateAll(
      (els) =>
        els.filter((e) =>
          /: 0 da IA, 0 do time/.test(e.getAttribute("title") ?? "")
        ).length
    );
    expect(vazios).toBe(1);

    // Sem legenda as duas cores não significam nada.
    await expect(secao.getByText(/respondidas pela IA/)).toBeVisible();
    await expect(secao.getByText(/respondidas pelo time/)).toBeVisible();
  });

  test("nada de biblioteca de gráfico: as barras são CSS", async ({ page }) => {
    await page.goto("/design/painel");
    const secao = page.locator("section").filter({ hasText: "Movimento dos" });
    // Decisão registrada: sparkline, donut e área com meta custavam 40+ linhas de
    // SVG cada para dizer menos que estas barras.
    await expect(secao.locator("svg")).toHaveCount(0);
    await expect(secao.locator("canvas")).toHaveCount(0);
  });
});

test.describe("Painel: escrita", () => {
  test("não usa travessão em texto visível", async ({ page }) => {
    await page.goto("/design/painel");
    const texto = await page.locator("body").innerText();
    expect(texto).not.toMatch(/[—–]/);
  });
});
