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
  test("quatro degraus de número, e a manchete é o maior", async ({ page }) => {
    await page.goto("/design/painel");

    // O defeito que isto conserta: os dez números da tela usavam o MESMO
    // `text-display` (24px), e a manchete só se distinguia por cor de fundo.
    //
    // ⚠️ Os degraus vêm MEDIDOS da prancha da rodada 3 (29/08/2026): 68 na
    // manchete, 44 no movimento, 32 no cartão de indicador, 18 no bloco
    // secundário. Antes eram três e todos pequenos, com a manchete nos mesmos
    // 32px de um cartão qualquer, e foi a divergência que o dono apontou ao
    // comparar a tela com o desenho. Não afrouxar estes números sem medir a
    // prancha de novo.
    const tamanhos = await page.evaluate(() => {
      const px = (e: Element) =>
        Math.round(parseFloat(getComputedStyle(e).fontSize));
      const vals = [...document.querySelectorAll('[data-slot="stat-valor"]')];
      const manchete = document
        .querySelector('[data-slot="stat"]')!
        .querySelector('[data-slot="stat-valor"]')!;
      // O numeral do movimento não é um `Stat`: é o número grande da coluna
      // esquerda daquele cartão. Precisa entrar na medição, senão o degrau de
      // 44px não seria conferido por ninguém.
      const mov = document.querySelector(
        '[data-slot="painel-movimento"] .font-display'
      )!;
      return {
        cartoes: [...new Set(vals.map(px))].sort((a, b) => a - b),
        manchete: px(manchete),
        movimento: px(mov),
        maior: Math.max(...vals.map(px)),
      };
    });

    // ⚠️ Só DOIS tamanhos de `stat-valor` na tela: 68 na manchete e 32 nos
    // quatro cartões da operação. O degrau de 18px saiu junto com a seção
    // "O que mais ela fez", que a prancha da rodada 3 não tem.
    expect(tamanhos.cartoes).toEqual([32, 68]);
    // A manchete é o primeiro cartão da tela E o maior numeral, com folga: 68
    // contra 32 é o dobro, e é essa distância que faz a tela ter ordem de
    // leitura antes de qualquer palavra ser lida.
    expect(tamanhos.manchete).toBe(68);
    expect(tamanhos.manchete).toBe(tamanhos.maior);
    // E o movimento fica no degrau do meio, 44, entre a manchete e o cartão.
    expect(tamanhos.movimento).toBe(44);
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
    // No período "Dia" as bases são pequenas: "atendidas sem você" vai de 4 para
    // 6. "+50%" seria verdade aritmética e mentira de leitura, então sai "+2".
    //
    // ⚠️ Este teste mirava em "Pessoas novas", que era o cartão da seção "Está
    // crescendo?". Essa seção deixou de existir na rodada 3: o gráfico de
    // movimento responde a mesma pergunta, e o número de pessoas novas foi para
    // o rodapé dele. A regra testada (base abaixo de PISO_PERCENTUAL sai em
    // valor absoluto) é exatamente a mesma.
    await periodo(page, "Dia");
    const cartao = page
      .locator('[data-slot="stat"]')
      .filter({ hasText: "Atendidas sem você" });
    await expect(cartao.locator('[data-slot="badge"]')).toHaveText("+2");
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
    // O cartão "Objeções que ela segurou" ainda não tem dado, e por isso é ele
    // que carrega a legenda NUA: os outros três concatenam o denominador antes
    // do período. A regra em teste é que TODO cartão diz de quando é o número,
    // inclusive o que ainda não tem número.
    const legenda = page
      .locator("[data-em-breve]")
      .locator('[data-slot="stat-legenda"]');

    await periodo(page, "Semana");
    await expect(legenda).toHaveText("últimos 7 dias");
    await periodo(page, "Dia");
    await expect(legenda).toHaveText("últimas 24 horas");
  });
});

test.describe("Painel: gráfico de hora dentro da manchete", () => {
  test("⚠️ a soma das partes roxas É o número da manchete", async ({ page }) => {
    await page.goto("/design/painel");

    // ⚠️ A ASSERÇÃO MAIS IMPORTANTE DA TELA. A manchete diz "N mensagens
    // respondidas fora do horário" e as barras roxas são essas mesmas linhas,
    // hora a hora. Se as duas divergirem, o cliente confere no WhatsApp dele em
    // dez segundos e a tela inteira perde a credibilidade.
    //
    // Lê os `data-fora` em vez de medir pixel: altura de barra é proporcional ao
    // maior valor, não absoluta, então medir pixel não provaria a igualdade.
    const { soma, manchete } = await page.evaluate(() => {
      const horas = [
        ...document.querySelectorAll('[data-slot="painel-horas"] .painel-hora'),
      ];
      return {
        soma: horas.reduce(
          (s, h) => s + Number((h as HTMLElement).dataset.fora ?? 0),
          0
        ),
        manchete: document
          .querySelector('[data-slot="stat-valor"]')
          ?.textContent?.trim(),
      };
    });

    expect(soma).toBeGreaterThan(0);
    expect(String(soma)).toBe(manchete);
  });

  test("são 24 colunas e as barras têm ALTURA de verdade", async ({ page }) => {
    await page.goto("/design/painel");

    // ⚠️ ESTE TESTE EXISTE POR UM DEFEITO MEDIDO EM PRODUÇÃO (27/08/2026): um
    // gráfico renderizou INVISÍVEL (coluna 1px, barra 0px), porque `items-end`
    // deixava a coluna com a altura do conteúdo e a barra, que tem altura em
    // porcentagem, resolvia para zero contra pai automático. O e2e da época
    // passava, porque contava colunas e nunca mediu uma barra.
    const m = await page.evaluate(() => {
      const raiz = document.querySelector('[data-slot="painel-horas"]')!;
      const alturas = [...raiz.querySelectorAll(".painel-barra")].map(
        (b) => b.getBoundingClientRect().height
      );
      return {
        colunas: raiz.querySelectorAll(".painel-hora").length,
        barras: alturas.length,
        maior: Math.max(...alturas),
        zeradas: alturas.filter((h) => h === 0).length,
      };
    });

    expect(m.colunas).toBe(24);
    expect(m.barras).toBeGreaterThan(0);
    expect(m.maior).toBeGreaterThan(10);
    expect(m.zeradas).toBe(0);
  });

  test("a legenda avisa que fim de semana conta como fora", async ({ page }) => {
    await page.goto("/design/painel");
    const g = page.locator('[data-slot="painel-horas"]');
    // Sem esta frase, uma barra roxa às 14h pareceria defeito: dentro ou fora
    // considera o DIA DA SEMANA, não só a hora.
    await expect(g.getByText(/incluindo fim de semana e feriado/)).toBeVisible();
  });

  test("uma mesma hora empilha as duas partes", async ({ page }) => {
    await page.goto("/design/painel");
    // A pilha é a peça central: a hora comercial tem cinza em cima e roxo
    // embaixo (o roxo vem do fim de semana). Se nenhuma hora tivesse as duas, o
    // gráfico seria só duas faixas de cor e a legenda não faria sentido.
    const empilhadas = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll(
            '[data-slot="painel-horas"] .painel-hora'
          ),
        ].filter(
          (h) =>
            Number((h as HTMLElement).dataset.fora ?? 0) > 0 &&
            Number((h as HTMLElement).dataset.dentro ?? 0) > 0
        ).length
    );
    expect(empilhadas).toBeGreaterThan(0);
  });
});

test.describe("Painel: movimento", () => {
  test("é uma área de UMA série, e a divisão IA/time virou texto", async ({
    page,
  }) => {
    await page.goto("/design/painel");
    const secao = page.locator('[data-slot="painel-movimento"]');
    await expect(secao).toBeVisible();

    // Uma série só: a paleta tem UMA cor categórica (a marca), porque verde,
    // âmbar e vermelho são estado. A segunda informação desceu para o rodapé.
    await expect(
      secao.locator('[data-slot="painel-area"] polyline')
    ).toHaveCount(1);
    await expect(secao.getByText(/respondidas pela IA/)).toBeVisible();
    await expect(secao.getByText(/pelo time/)).toBeVisible();
  });

  test("o rodapé traz pico, média e menor dia", async ({ page }) => {
    await page.goto("/design/painel");
    const secao = page.locator('[data-slot="painel-movimento"]');
    await expect(secao.getByText(/pico de \d+/)).toBeVisible();
    await expect(secao.getByText(/média de [\d,]+ por dia/)).toBeVisible();
    await expect(secao.getByText(/menor dia \d+/)).toBeVisible();
  });

  test("o seletor de 14 e 30 dias troca o número de pontos", async ({
    page,
  }) => {
    await page.goto("/design/painel");
    const secao = page.locator('[data-slot="painel-movimento"]');

    await expect(secao.locator(".painel-dia")).toHaveCount(14);
    await secao.getByRole("tab", { name: "30 dias" }).click();
    await expect(secao.locator(".painel-dia")).toHaveCount(30);
  });

  test("um dia sem movimento aparece, em vez de sumir do eixo", async ({
    page,
  }) => {
    await page.goto("/design/painel");
    // O buraco É a informação (um dia sem conversa). Se a série pulasse o dia, o
    // eixo encurtaria e o vale desapareceria.
    const secao = page.locator('[data-slot="painel-movimento"]');
    await expect(
      secao.locator(".painel-balao").filter({ hasText: /\b0 conversas/ })
    ).toHaveCount(1);
  });

  test("nada de biblioteca de gráfico", async ({ page }) => {
    await page.goto("/design/painel");
    const secao = page.locator('[data-slot="painel-movimento"]');
    // O SVG é da casa (um `polyline` e um `path`, escritos à mão). Biblioteca
    // receberia os tokens por JS e quebraria a troca de tema por cookie.
    await expect(secao.locator("canvas")).toHaveCount(0);
    await expect(secao.locator('[data-slot="painel-area"]')).toHaveCount(1);
  });
});

test.describe("Painel: a fila, no cabeçalho", () => {
  test("mostra a IDADE da espera e leva para algum lugar", async ({ page }) => {
    await page.goto("/design/painel");
    // "3" é uma fila; "a mais antiga há 6 horas" é um problema. A idade é a
    // informação, e é ela que transforma relatório em tarefa.
    const fila = page.locator('[data-slot="painel-fila"]').first();
    await expect(fila).toContainText("3");
    await expect(fila).toContainText("pessoas esperando");
    await expect(fila).toContainText("a mais antiga há 6 horas");
    await expect(fila).toHaveAttribute("href", "/inbox");
  });

  test("está no CABEÇALHO, acima da manchete, e não na trilha", async ({
    page,
  }) => {
    await page.goto("/design/painel");
    const acima = await page.evaluate(() => {
      const fila = document.querySelector('[data-slot="painel-fila"]')!;
      const manchete = document.querySelector('[data-slot="stat"]')!;
      return (
        fila.getBoundingClientRect().bottom <=
        manchete.getBoundingClientRect().top
      );
    });
    expect(acima).toBe(true);
  });

  test("neutra até o limiar, âmbar depois", async ({ page }) => {
    await page.goto("/design/painel");
    // Âmbar em toda fila ensinaria a ignorar o âmbar. O limiar é uma constante
    // nomeada (ESPERA_AVISO_MS), porque veio da ferramenta de desenho.
    const filas = page.locator('[data-slot="painel-fila"][data-urgente]');
    await expect(filas.filter({ hasText: "há 6 horas" })).toHaveAttribute(
      "data-urgente",
      "sim"
    );
    await expect(filas.filter({ hasText: "há 12 minutos" })).toHaveAttribute(
      "data-urgente",
      "nao"
    );
  });

  test("a fila não tem selo de variação", async ({ page }) => {
    await page.goto("/design/painel");
    // É foto de AGORA, não período: comparar "agora" com "agora da semana
    // passada" não significa nada.
    const fila = page.locator('[data-slot="painel-fila"]').first();
    await expect(fila.locator('[data-slot="badge"]')).toHaveCount(0);
  });

  test("zero é um presente, não uma tela vazia", async ({ page }) => {
    await page.goto("/design/painel");
    await expect(
      page.getByText("Ninguém está esperando você agora.")
    ).toBeVisible();
  });
});

test.describe("Painel: blocos sem dado ainda", () => {
  test("⚠️ o número é XX, nunca um valor plausível", async ({ page }) => {
    await page.goto("/design/painel");

    // O eixo do produto é que a IA não inventa. Um número plausível, mesmo
    // borrado ou esmaecido, é indistinguível de medição num print ampliado, e
    // isso é a única coisa que esta tela não pode fazer.
    const assuntos = page.locator('[data-slot="painel-assuntos"]');
    await expect(assuntos.getByText("XX")).toHaveCount(3);

    const objecoes = page.locator("[data-em-breve]");
    await expect(objecoes).toHaveCount(1);
    await expect(objecoes).toContainText("XX");
    await expect(objecoes).toContainText("Em breve");
  });

  test("os rótulos dos assuntos são POSICIONAIS, não conteúdo", async ({
    page,
  }) => {
    await page.goto("/design/painel");
    const assuntos = page.locator('[data-slot="painel-assuntos"]');
    // Escrever um assunto de mentira ("Garantia da lente antirreflexo XX")
    // sugeriria que o sistema já sabe qual é e só não contou, que é uma mentira
    // mais sutil que o número.
    await expect(assuntos.getByText("1º assunto mais perguntado")).toBeVisible();
    await expect(assuntos.getByText("2º assunto mais perguntado")).toBeVisible();
    await expect(assuntos.getByText("3º assunto mais perguntado")).toBeVisible();
    await expect(assuntos).toContainText("Em breve");
    // E diz POR QUE ainda não tem número, em vez de só mostrar caixas vazias.
    await expect(assuntos).toContainText(/preferimos não mostrar número/);
  });

  test("as barras do placeholder são cinzas, não roxas", async ({ page }) => {
    await page.goto("/design/painel");
    // Roxo é a cor de dado REAL nesta tela. Barra roxa lê como medição.
    const roxas = await page.evaluate(
      () =>
        [
          ...document
            .querySelector('[data-slot="painel-assuntos"]')!
            .querySelectorAll("div"),
        ].filter((d) => d.className.includes("bg-brand")).length
    );
    expect(roxas).toBe(0);
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

  test("nada na tela acusa a IA de não saber", async ({ page }) => {
    await page.goto("/design/painel");
    // `action = 'pausar'` também dispara por política, não só por buraco de
    // conhecimento. Chamar isso de "não soube responder" seria overclaim.
    const texto = await page.locator("body").innerText();
    expect(texto).not.toContain("não soube");
  });

  test("a resposta do agente aparece na íntegra e diz se foi sozinha", async ({
    page,
  }) => {
    await page.goto("/design/painel");
    const secao = page.locator('[data-slot="painel-ultima-resposta"]');
    await expect(secao).toBeVisible();
    await expect(secao).toContainText("Trabalhamos de segunda a sexta");
    // A regra de escolha é objetiva (lib/painel.escolherVerbatim) e o rótulo diz
    // o que dá peso à frase: ninguém do time entrou depois dela.
    await expect(secao).toContainText("atendida só pela IA");
    // Duas mensagens, duas linhas. O n8n grava o turno unido por " | ", e o
    // painel era o último lugar que ainda mostrava o pipe na tela.
    await expect(secao.locator("p.italic")).toHaveCount(2);
    await expect(secao).not.toContainText(" | ");
  });
});

test.describe("Painel: cada bloco manda no próprio período", () => {
  test("não existe seletor global nem aviso de que algo não o segue", async ({
    page,
  }) => {
    await page.goto("/design/painel");

    // ⚠️ O aviso escrito "não segue o seletor" era o SINTOMA de o controle estar
    // no lugar errado. Com o seletor dentro de cada bloco, ele deixou de ser
    // necessário, e reintroduzir o texto significaria que o global voltou.
    const texto = await page.locator("body").innerText();
    expect(texto).not.toMatch(/não segue o seletor/i);

    // Dois seletores independentes: o da operação (4 períodos) e o do movimento
    // (14 e 30 dias). Cada um dentro do próprio bloco.
    await expect(
      page.locator('[data-slot="painel-operacao"]').getByRole("tablist")
    ).toHaveCount(1);
    await expect(
      page.locator('[data-slot="painel-movimento"]').getByRole("tablist")
    ).toHaveCount(1);
  });

  test("trocar o período da operação NÃO mexe na manchete", async ({ page }) => {
    await page.goto("/design/painel");
    const manchete = page.locator('[data-slot="stat-valor"]').first();
    const antes = await manchete.textContent();

    await periodo(page, "Mês");
    // A frase mais forte da tela é mês fechado mais acumulado, e não pode
    // encolher com um clique em outro bloco.
    await expect(manchete).toHaveText(antes ?? "");
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
