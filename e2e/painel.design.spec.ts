import { test, expect } from "@playwright/test";

// Painel (redesenho de 27/08/2026). Roda sem login, em /design/painel, que
// renderiza a tela INTEIRA e na mesma ordem da tela real.
//
// Cada bloco aqui existe por um defeito que ACONTECEU. Não enfraquecer sem
// trocar por uma asserção mais forte.

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

/** Clica numa aba do seletor de período e espera a troca acontecer. */
async function periodo(
  page: import("@playwright/test").Page,
  rotulo: "Dia" | "Semana" | "Quinzena" | "Mês"
) {
  const aba = page.getByRole("tab", { name: rotulo, exact: true });
  await aba.click();
  await expect(aba).toHaveAttribute("aria-selected", "true");
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

  test("a mediana declara o tamanho da amostra", async ({ page }) => {
    await page.goto("/design/painel");
    // Mediana de 3 atendimentos e mediana de 138 não são o mesmo número, e o
    // cartão precisa dizer qual dos dois ele é.
    const cartao = page
      .locator('[data-slot="stat"]')
      .filter({ hasText: "Tempo de 1a resposta" })
      .first();
    await expect(cartao.locator('[data-slot="stat-legenda"]')).toHaveText(
      /\d+ atendimentos medidos/
    );
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
            ...new Set(
              [...document.querySelectorAll('[data-slot="stat"]')]
                .map(g)
                // A variante `vazio` é tracejada e sem fundo de propósito.
                .filter((c) => c !== "rgba(0, 0, 0, 0)")
            ),
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
    // melhor. O mock da semana cai de 21s para 8s.
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
    // No período "Dia" as bases são pequenas: pessoas novas vai de 2 para 3.
    // "+50%" seria verdade aritmética e mentira de leitura, então sai "+1".
    await periodo(page, "Dia");
    const cartao = page
      .locator('[data-slot="stat"]')
      .filter({ hasText: "Pessoas novas" });
    await expect(cartao.locator('[data-slot="badge"]')).toHaveText("+1");
  });

  test("volume nunca é vermelho, mesmo quando cai", async ({ page }) => {
    await page.goto("/design/painel");
    // Menos escalada pode ser a base ficando melhor, e mais escalada pode ser só
    // mais demanda. `direcao: "neutra"` é o que impede o dono de torcer pelo
    // número errado. O mock da semana cai de 12 para 9.
    const badge = page
      .locator('[data-slot="stat"]')
      .filter({ hasText: "Preferiu confirmar" })
      .locator('[data-slot="badge"]');
    await expect(badge).toHaveText("-25%");
    await expect(badge).not.toHaveClass(/danger/);
  });
});

test.describe("Painel: filtro de período", () => {
  test("os quatro períodos existem e trocam os números", async ({ page }) => {
    await page.goto("/design/painel");
    for (const r of ["Dia", "Semana", "Quinzena", "Mês"] as const) {
      await expect(page.getByRole("tab", { name: r, exact: true })).toBeVisible();
    }

    const autonomia = page
      .locator('[data-slot="stat"]')
      .filter({ hasText: "Atendidas sem você" })
      .locator('[data-slot="stat-valor"]');

    await periodo(page, "Semana");
    await expect(autonomia).toHaveText("31");
    await periodo(page, "Mês");
    await expect(autonomia).toHaveText("112");
  });

  test("sem período anterior comparável, o selo SOME", async ({ page }) => {
    await page.goto("/design/painel");
    // É a regra de lib/delta.ts que impede variação inventada. No mock a
    // quinzena não tem período anterior medido.
    await periodo(page, "Quinzena");

    const operacao = page.locator('[data-slot="stat"]').filter({
      hasText:
        /Atendidas sem você|Tempo de 1a resposta|Preferiu confirmar|Pessoas novas/,
    });
    await expect(operacao.locator('[data-slot="badge"]')).toHaveCount(0);
    await expect(
      page.getByText("sem quinzena anterior completa").first()
    ).toBeVisible();
  });

  test("a legenda do cartão acompanha o período escolhido", async ({ page }) => {
    await page.goto("/design/painel");
    const legenda = page
      .locator('[data-slot="stat"]')
      .filter({ hasText: "Pessoas novas" })
      .locator('[data-slot="stat-legenda"]');

    await periodo(page, "Semana");
    await expect(legenda).toHaveText("últimos 7 dias");
    await periodo(page, "Dia");
    await expect(legenda).toHaveText("últimas 24 horas");
  });
});

test.describe("Painel: gráfico de movimento", () => {
  test("as barras têm ALTURA de verdade", async ({ page }) => {
    await page.goto("/design/painel");

    // ⚠️ ESTE TESTE EXISTE POR UM DEFEITO MEDIDO EM PRODUÇÃO (27/08/2026): o
    // gráfico renderizava INVISÍVEL (coluna 1px, barra 0px), porque `items-end`
    // deixava a coluna com a altura do conteúdo e a barra, que tem altura em
    // porcentagem, resolvia para zero contra pai automático. O e2e anterior
    // passava, porque contava colunas e legenda e nunca mediu uma barra.
    const alturas = await page.evaluate(() => {
      const secao = document.querySelector('[data-slot="painel-grafico"]')!;
      return [...secao.querySelectorAll("div[title] > div")].map(
        (b) => b.getBoundingClientRect().height
      );
    });

    expect(alturas.length).toBeGreaterThan(0);
    expect(Math.max(...alturas)).toBeGreaterThan(10);
  });

  test("o número de colunas segue o período", async ({ page }) => {
    await page.goto("/design/painel");
    const secao = page
      .locator('[data-slot="painel-grafico"]');

    await periodo(page, "Semana");
    await expect(secao.locator("div[title]")).toHaveCount(7);
    await periodo(page, "Quinzena");
    await expect(secao.locator("div[title]")).toHaveCount(15);
    // Uma janela de 24h vira 24 colunas POR HORA: uma coluna só não é gráfico.
    await periodo(page, "Dia");
    await expect(secao.locator("div[title]")).toHaveCount(24);
  });

  test("balde sem movimento aparece em vez de sumir", async ({ page }) => {
    await page.goto("/design/painel");
    const colunas = page
      .locator('[data-slot="painel-grafico"]')
      .locator("div[title]");

    // Balde vazio vira risco no chão. Sem ele o eixo encurta e o buraco, que é a
    // informação, desaparece.
    const vazios = await colunas.evaluateAll(
      (els) =>
        els.filter((e) =>
          /: 0 da IA, 0 do time/.test(e.getAttribute("title") ?? "")
        ).length
    );
    expect(vazios).toBe(1);
  });

  test("as duas séries têm legenda", async ({ page }) => {
    await page.goto("/design/painel");
    const secao = page
      .locator('[data-slot="painel-grafico"]');
    // Sem legenda as duas cores não significam nada.
    await expect(secao.getByText(/respondidas pela IA/)).toBeVisible();
    await expect(secao.getByText(/respondidas pelo time/)).toBeVisible();
  });

  test("nada de biblioteca de gráfico: as barras são CSS", async ({ page }) => {
    await page.goto("/design/painel");
    const secao = page
      .locator('[data-slot="painel-grafico"]');
    // Decisão registrada: a paleta só tem UMA cor categórica (a marca), porque
    // verde, âmbar e vermelho são estado. Duas séries é o teto, e barra
    // empilhada em CSS entrega isso com bundle zero.
    await expect(secao.locator("svg")).toHaveCount(0);
    await expect(secao.locator("canvas")).toHaveCount(0);
  });
});

test.describe("Painel: o que precisa de mim", () => {
  test("a fila mostra a IDADE da espera e leva para algum lugar", async ({
    page,
  }) => {
    await page.goto("/design/painel");
    // "3" é uma fila; "a mais antiga há 6 horas" é um problema. A idade é a
    // informação, e é ela que transforma relatório em tarefa.
    await expect(page.getByText("3 pessoas esperando você")).toBeVisible();
    await expect(page.getByText(/A mais antiga há 6 horas/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Ver quem está esperando/ })
    ).toBeVisible();
  });

  test("a fila não tem selo de variação", async ({ page }) => {
    await page.goto("/design/painel");
    // É foto de AGORA, não período: comparar "agora" com "agora da semana
    // passada" não significa nada.
    const bloco = page
      .locator("div")
      .filter({ hasText: /^3 pessoas esperando você/ })
      .first();
    await expect(bloco.locator('[data-slot="badge"]')).toHaveCount(0);
  });

  test("zero é um presente, não uma tela vazia", async ({ page }) => {
    await page.goto("/design/painel");
    // O estado zero aparece na seção de estados finos do preview.
    await expect(
      page.getByText("Ninguém está esperando você agora.")
    ).toBeVisible();
  });
});

test.describe("Painel: prova de que a IA não inventa", () => {
  test("a contenção é apresentada como escolha, não como falha", async ({
    page,
  }) => {
    await page.goto("/design/painel");
    const cartao = page
      .locator('[data-slot="stat"]')
      .filter({ hasText: "Preferiu confirmar" });
    await expect(cartao).toHaveCount(1);
    // O verbo carrega tudo: "preferiu confirmar" é integridade, "não soube" é
    // pedido de reembolso.
    await expect(cartao).toContainText("em vez de chutar");
  });

  test("a lista de escaladas não acusa a IA de não saber", async ({ page }) => {
    await page.goto("/design/painel");
    const secao = page.locator('[data-slot="painel-escaladas"]');
    await expect(secao).toBeVisible();
    // `action = 'pausar'` também dispara por política, não só por buraco de
    // conhecimento. Chamar tudo de "não soube responder" seria overclaim.
    await expect(secao).not.toContainText("não soube");
    await expect(
      secao.getByRole("link", { name: /Ensinar a resposta/ }).first()
    ).toBeVisible();
  });

  test("a última resposta do agente aparece na íntegra", async ({ page }) => {
    await page.goto("/design/painel");
    const secao = page.locator('[data-slot="painel-ultima-resposta"]');
    await expect(secao).toBeVisible();
    await expect(secao).toContainText("Oi, Marcelo!");
  });
});

test.describe("Painel: escrita", () => {
  test("não usa travessão em texto visível", async ({ page }) => {
    await page.goto("/design/painel");
    const texto = await page.locator("body").innerText();
    expect(texto).not.toMatch(/[—–]/);
  });

  test("nenhum texto fixo assume um único segmento", async ({ page }) => {
    await page.goto("/design/painel");
    // O beta tem advogado, pediatra, barbeiro, engenheiro, clínica e comércio.
    // Quem carrega a linguagem do segmento é o preset, nunca a tela.
    const texto = await page.locator("body").innerText();
    expect(texto).not.toMatch(/\bconsulta\b/i);
    expect(texto).not.toMatch(/\bpaciente/i);
    expect(texto).not.toMatch(/\bagendamento/i);
  });
});
