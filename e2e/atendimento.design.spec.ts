import { test, expect } from "@playwright/test";

// Os cinco ajustes do atendimento pedidos em 19/09/2026, depois de o dono usar a
// tela redesenhada (`docs/plano-ajustes-atendimento.md`). Um describe por item,
// na ordem do plano. Roda sem login, na tela /design.
//
// Um arquivo só, e não espalhado pelos specs por tela, pelo mesmo motivo de
// `ajustes.design.spec.ts`: ele existe para a validação item a item. Depois de
// aprovado, cada teste pode migrar para o spec da tela a que pertence.

/**
 * Deixa as escritas do browser passarem sem banco.
 *
 * A /design monta os componentes REAIS com dado falso, então os callbacks da
 * conversa mandam PATCH de verdade para o Supabase, com um tenant que não
 * existe. Sem isto o PATCH volta em erro e o componente REVERTE o estado
 * otimista, que é exatamente o que este arquivo precisa observar. Devolver 204 é
 * o que o PostgREST devolve num update sem `Prefer: return=representation`.
 *
 * Devolve a lista de escritas, para o teste poder afirmar o que foi gravado e
 * não só o que a tela pintou: o item 5 é uma regra de BANCO, e checar só o
 * pixel deixaria passar uma tela que mente.
 */
async function interceptarEscritas(page: import("@playwright/test").Page) {
  const escritas: { tabela: string; corpo: string }[] = [];
  await page.route("**/rest/v1/**", async (route) => {
    const req = route.request();
    if (req.method() !== "PATCH") return route.fallback();
    const url = new URL(req.url());
    const corpo = req.postData() ?? "";
    // Abrir a conversa zera o contador de não lidas, e esse PATCH sai sozinho em
    // toda abertura. Ele não é gesto de ninguém, então não entra na lista: senão
    // toda asserção deste arquivo carregaria uma escrita que não tem nada a ver
    // com o que ela afirma, e a ordem dela dependeria de quando o efeito roda.
    if (!corpo.includes("unread_count")) {
      escritas.push({ tabela: url.pathname.split("/").pop() ?? "", corpo });
    }
    await route.fulfill({ status: 204, body: "" });
  });
  return escritas;
}

/**
 * Espera as escritas do gesto chegarem.
 *
 * ⚠️ A tela muda ANTES do banco, de propósito (as duas escritas são otimistas),
 * então afirmar a lista logo depois de ver o rótulo novo é uma corrida: com a
 * máquina ocupada, o segundo PATCH ainda estava no ar e o teste falhava sozinho.
 */
async function esperarEscritas(escritas: unknown[], quantas: number) {
  await expect.poll(() => escritas.length).toBe(quantas);
}

// ─────────────────────────────────────────────────────────────────────
// Item 1: a sombra de rolagem estava bugada
//
// O dono mandou print de uma faixa cinza clara com borda visível acima da caixa
// de escrita, e disse que acontecia também no cabeçalho. Eram duas `box-shadow`,
// e `box-shadow` pinta para FORA do elemento: a do cabeçalho (que tem `z-10`)
// caía sobre a faixa "O cliente quer", opaca e com borda própria, e lia como
// caixa. Hoje é um elemento absoluto por borda, dentro da área que rola.
//
// ⚠️ Os testes medem PIXEL, e não classe. Um teste que contasse a classe passava
// com o defeito inteiro na tela, que foi como ele chegou até aqui.
// ─────────────────────────────────────────────────────────────────────
test.describe("Item 1: a sombra de rolagem é sombra, não uma faixa", () => {
  /** Rola a conversa para o meio, onde as duas bordas têm conteúdo escondido. */
  async function rolarAoMeio(page: import("@playwright/test").Page) {
    // `.first()`: a coluna do cliente também é um ScrollArea dentro do <main>.
    const viewport = page
      .locator('main [data-slot="scroll-area-viewport"]')
      .first();
    await expect(viewport).toBeVisible();
    // ⚠️ Esperar a sombra de CIMA acender antes de rolar. A conversa abre na
    // última mensagem, e quem pula para lá é um efeito de montagem: rolar antes
    // dele perde a rolagem, porque o efeito ainda vai jogar tudo para o fim.
    // Essa sombra acesa é o sinal de que a medida já aconteceu.
    await expect(
      page.locator('[data-slot="sombra-rolagem"][data-borda="topo"]')
    ).toHaveAttribute("data-visivel", "sim");
    await viewport.evaluate((el) => {
      el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2);
    });
    await expect(
      page.locator('[data-slot="sombra-rolagem"][data-borda="fundo"]')
    ).toHaveAttribute("data-visivel", "sim");
  }

  test("é um degradê de poucos pixels, e não uma superfície", async ({ page }) => {
    await page.goto("/design");
    await rolarAoMeio(page);

    const sombras = await page
      .locator('[data-slot="sombra-rolagem"]')
      .evaluateAll((els) =>
        els.map((e) => {
          const c = getComputedStyle(e);
          return {
            borda: (e as HTMLElement).dataset.borda,
            altura: e.getBoundingClientRect().height,
            fundo: c.backgroundColor,
            degrade: c.backgroundImage,
          };
        })
      );
    expect(sombras).toHaveLength(2);
    for (const s of sombras) {
      // Poucos pixels. A queixa era uma FAIXA: qualquer coisa alta o bastante
      // para ler como bloco já é o defeito de volta.
      expect(s.altura, s.borda).toBeLessThanOrEqual(12);
      // E a cor não é sólida: fundo transparente, tudo num degradê que termina
      // em transparente.
      expect(s.fundo, s.borda).toBe("rgba(0, 0, 0, 0)");
      expect(s.degrade, s.borda).toMatch(/linear-gradient/);
      expect(s.degrade, s.borda).toMatch(/rgba\(0, 0, 0, 0\)/);
    }
    // ⚠️ `toHaveCSS` e não uma leitura direta: a sombra acende por `transition`
    // de opacidade, e a medida crua pegava o meio da interpolação (0.698…), que
    // não é nem a origem nem o destino. Mesmo cuidado dos gatilhos do composer.
    for (const borda of ["topo", "fundo"]) {
      await expect(
        page.locator(`[data-slot="sombra-rolagem"][data-borda="${borda}"]`)
      ).toHaveCSS("opacity", "1");
    }
  });

  test("ninguém mais desenha sombra, e ela não sai da área que rola", async ({
    page,
  }) => {
    await page.goto("/design");
    await rolarAoMeio(page);

    const medido = await page.evaluate(() => {
      const faixa = document.querySelector(
        '[data-slot="conversa-entendimento"]'
      )!;
      // A caixa de escrita é o irmão seguinte da moldura da conversa.
      const composer = document.querySelector('[data-slot="sombra-rolagem"]')!
        .parentElement!.nextElementSibling!;
      const vizinhos = [
        document.querySelector("main header")!,
        faixa,
        composer,
      ].map((e) => ({
        sombra: getComputedStyle(e).boxShadow,
        topo: e.getBoundingClientRect().top,
        fundo: e.getBoundingClientRect().bottom,
      }));
      const sombras = [
        ...document.querySelectorAll('[data-slot="sombra-rolagem"]'),
      ].map((e) => {
        const r = e.getBoundingClientRect();
        return { topo: r.top, fundo: r.bottom };
      });
      return { vizinhos, sombras };
    });

    // 1. Cabeçalho, faixa do entendimento e caixa de escrita não desenham sombra
    //    nenhuma. Era daí que o borrão saía, e são as superfícies opacas que ele
    //    sujava.
    for (const v of medido.vizinhos) expect(v.sombra).toBe("none");
    // 2. E a sombra não INVADE nenhum dos três. `box-shadow` pinta para fora do
    //    elemento, então a versão antiga não tinha como não invadir; esta é
    //    absoluta dentro da área que rola.
    for (const s of medido.sombras) {
      for (const v of medido.vizinhos) {
        const cruza = s.topo < v.fundo && s.fundo > v.topo;
        expect(cruza, `${s.topo}-${s.fundo} contra ${v.topo}-${v.fundo}`).toBe(
          false
        );
      }
    }
  });

  test("apagada quando não há conteúdo escondido daquele lado", async ({
    page,
  }) => {
    await page.goto("/design");
    const topo = page.locator('[data-slot="sombra-rolagem"][data-borda="topo"]');
    // A conversa abre na última mensagem, então em cima há conteúdo escondido e
    // embaixo não. Sombra acesa sem nada atrás dela é decoração, e decoração que
    // finge ser sinal é pior que nenhum sinal.
    await expect(topo).toHaveAttribute("data-visivel", "sim");
    await expect(
      page.locator('[data-slot="sombra-rolagem"][data-borda="fundo"]')
    ).toHaveAttribute("data-visivel", "nao");

    await page
      .locator('main [data-slot="scroll-area-viewport"]')
      .first()
      .evaluate((el) => {
        el.scrollTop = 0;
      });
    await expect(topo).toHaveAttribute("data-visivel", "nao");
    await expect(topo).toHaveCSS("opacity", "0");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Item 2: filtro por período na lista de conversas
//
// "Não faz sentido eu querer ficar vendo todas as conversas." A lista abria com
// 48. O padrão passou a ser HOJE, com Hoje / 7 dias / Tudo.
//
// O mock de /design foi montado para este item: três conversas de hoje, uma
// esperando desde ontem, uma de 3 dias atrás e uma de 20.
// ─────────────────────────────────────────────────────────────────────
test.describe("Item 2: a lista abre em Hoje", () => {
  const periodo = (page: import("@playwright/test").Page, rotulo: string) =>
    page.locator('[data-slot="inbox-periodo-opcao"]', { hasText: rotulo });
  const itens = (page: import("@playwright/test").Page) =>
    page.locator('[data-slot="inbox-item"]');

  test("o padrão é Hoje, e trocar de janela muda o que a lista traz", async ({
    page,
  }) => {
    await page.goto("/design");
    await expect(periodo(page, "Hoje")).toHaveAttribute("data-ativo", "sim");
    // 3 de hoje mais a que espera desde ontem (ver o teste seguinte).
    await expect(itens(page)).toHaveCount(4);

    await periodo(page, "7 dias").click();
    await expect(itens(page)).toHaveCount(5);

    await periodo(page, "Tudo").click();
    await expect(itens(page)).toHaveCount(6);
  });

  test("quem espera por você NÃO some pelo filtro de tempo", async ({
    page,
  }) => {
    await page.goto("/design");
    // ⚠️ ESTA É A PARTE PERIGOSA DO ITEM, e o motivo de ela ter teste próprio.
    // A conversa com handoff aberto é de ONTEM, ou seja, está fora da janela
    // "Hoje". Ela aparece assim mesmo, senão o recorte esconde exatamente o que
    // o produto existe para não deixar esquecer.
    await expect(periodo(page, "Hoje")).toHaveAttribute("data-ativo", "sim");
    const espera = page.locator('[data-slot="inbox-estado"]').first();
    await expect(espera).toContainText(/esperando/);
    // E o grupo dela continua na tela, com a contagem.
    await expect(
      page.locator('[data-slot="inbox-grupo"]').first()
    ).toContainText(/Esperando você/i);
  });

  test("a contagem do chip bate com o que a lista mostra", async ({ page }) => {
    await page.goto("/design");
    // Chip dizendo 12 com três linhas na tela é a lista e o contador
    // discordando. A contagem passou a sair da janela, e não do total.
    for (const janela of ["Hoje", "7 dias", "Tudo"]) {
      await periodo(page, janela).click();
      const todas = page
        .locator('[data-slot="inbox-chip"]')
        .filter({ hasText: "Todas" });
      const texto = (await todas.innerText()).replace(/\s+/g, " ");
      const n = Number(texto.match(/(\d+)/)![1]);
      await expect(itens(page), janela).toHaveCount(n);
    }
  });

  test("a busca ignora a janela", async ({ page }) => {
    await page.goto("/design");
    // Quem digita um nome quer achar a pessoa, não filtrar por data: procurar
    // alguém e não encontrar porque a conversa é de três semanas atrás é a busca
    // mentindo. O 9412 é da conversa de 20 dias atrás, que "Hoje" esconde.
    await expect(periodo(page, "Hoje")).toHaveAttribute("data-ativo", "sim");
    await expect(page.getByText("Obrigado, era só isso mesmo")).toHaveCount(0);
    await page.getByPlaceholder("Buscar nome ou mensagem").fill("9412");
    await expect(page.getByText("Obrigado, era só isso mesmo")).toBeVisible();
  });

  test("o seletor não cria uma segunda fileira de controles", async ({
    page,
  }) => {
    await page.goto("/design");
    // ⚠️ A busca já subiu de lugar uma vez por causa disto: com controles que
    // reenvolvem acima dela, o cabeçalho pulava de altura conforme a fila
    // enchia. O seletor foi para a linha do TÍTULO, que era a única com folga.
    const mesmaLinha = await page.evaluate(() => {
      const sel = document
        .querySelector('[data-slot="inbox-periodo"]')!
        .getBoundingClientRect();
      const titulo = document
        .querySelector("aside h2")!
        .getBoundingClientRect();
      const busca = document
        .querySelector('input[aria-label="Buscar conversas e mensagens"]')!
        .getBoundingClientRect();
      return {
        cruzaOTitulo: sel.top < titulo.bottom && sel.bottom > titulo.top,
        acimaDaBusca: sel.bottom <= busca.top,
        larguraDoSeletor: sel.width,
      };
    });
    expect(mesmaLinha.cruzaOTitulo).toBe(true);
    expect(mesmaLinha.acimaDaBusca).toBe(true);
    // E cabe na coluna de 296px sem espremer o título.
    expect(mesmaLinha.larguraDoSeletor).toBeLessThan(160);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Item 3: a edição dos dados do contato não parecia editável
//
// "Custei perceber que podia digitar ali." Os campos usavam a variante `limpo`
// do Input: texto puro até o clique. O ajuste é de AFFORDANCE, não de arranjo,
// então a tabela de pares de 18/09 (rótulo à esquerda, valor à direita, fio por
// linha) continua igual.
// ─────────────────────────────────────────────────────────────────────
test.describe("Item 3: os dados do contato parecem editáveis", () => {
  test("o campo tem moldura e altura de controle ANTES de qualquer clique", async ({
    page,
  }) => {
    await page.goto("/design");
    const linhas = page.locator('[data-slot="painel-dado"]');
    await expect(linhas.first()).toBeVisible();

    const campos = await linhas
      .locator("input")
      .evaluateAll((els) =>
        els.map((e) => {
          const c = getComputedStyle(e);
          return {
            rotulo: e.getAttribute("aria-label"),
            altura: Math.round(e.getBoundingClientRect().height),
            larguraDaBorda: c.borderTopWidth,
            corDaBorda: c.borderTopColor,
            cursor: c.cursor,
            marcador: (e as HTMLInputElement).placeholder,
          };
        })
      );
    expect(campos.length).toBeGreaterThan(0);
    for (const campo of campos) {
      // ⚠️ Nada aqui foi tocado, nem focado. É esse o ponto: o defeito era o
      // campo só existir DEPOIS do clique, então medir com foco provaria o
      // contrário do que o teste diz.
      expect(campo.larguraDaBorda, campo.rotulo!).toBe("1px");
      // Borda transparente é o mesmo que borda nenhuma, e foi assim que a
      // primeira tentativa deste ajuste passou sem resolver nada: no tema claro
      // a coluna, `--input-bg` e `--s-campo` são todos brancos, então só a cor
      // da borda distingue o campo do texto.
      expect(campo.corDaBorda, campo.rotulo!).not.toMatch(/, 0\)$|transparent/);
      // Altura de controle (32px), e não a linha de texto de antes.
      expect(campo.altura, campo.rotulo!).toBe(32);
      expect(campo.cursor, campo.rotulo!).toBe("text");
      // E o marcador CONVIDA, em vez de descrever ("Não informado" era laudo).
      expect(campo.marcador, campo.rotulo!).toMatch(/Adicionar|Nome do campo/);
    }
  });

  test("criar campo é um controle, e não um texto de rodapé", async ({
    page,
  }) => {
    await page.goto("/design");
    const botao = page.getByRole("button", { name: "+ Adicionar campo" });
    await expect(botao).toBeVisible();
    const medido = await botao.evaluate((e) => {
      const c = getComputedStyle(e);
      return {
        altura: Math.round(e.getBoundingClientRect().height),
        estilo: c.borderTopStyle,
        largura: c.borderTopWidth,
      };
    });
    // Tracejado porque a linha ainda NÃO existe, no mesmo vocabulário do chip
    // "Ninguém assumiu ainda" do cabeçalho.
    expect(medido.estilo).toBe("dashed");
    expect(medido.largura).toBe("1px");
    expect(medido.altura).toBe(32);

    // E ele cria a linha de verdade, com os dois campos prontos para digitar.
    const antes = await page.locator('[data-slot="painel-dado"]').count();
    await botao.click();
    await expect(page.locator('[data-slot="painel-dado"]')).toHaveCount(
      antes + 1
    );
    await expect(
      page.getByPlaceholder("Nome do campo").last()
    ).toBeVisible();
  });

  test("a tabela de pares continua de pé", async ({ page }) => {
    await page.goto("/design");
    // ⚠️ O ajuste é de affordance e NÃO pode desfazer o desenho de 18/09: é o
    // alinhamento à direita que faz os valores formarem uma segunda margem, e
    // sem o fio por linha a coluna volta a ler como texto corrido.
    const linha = page.locator('[data-slot="painel-dado"]').first();
    await expect(linha).toHaveCSS("border-bottom-width", "1px");
    await expect(linha.locator("input").last()).toHaveCSS("text-align", "right");
    await expect(linha.locator("> span").first()).toHaveCSS("width", "86px");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Item 4: fundo de rede neural atrás das mensagens
//
// Decisão do dono: só atrás das mensagens, bem discreto, nos dois temas (no
// escuro mais apagado ainda). Não entra em cabeçalho, lista nem painel do
// cliente.
// ─────────────────────────────────────────────────────────────────────
test.describe("Item 4: o fundo de rede fica só atrás das mensagens", () => {
  test("existe atrás da conversa, e em nenhuma outra superfície", async ({
    page,
  }) => {
    await page.goto("/design");
    const fundo = page.locator('[data-slot="fundo-rede"]');
    await expect(fundo).toHaveCount(1);

    const onde = await page.evaluate(() => {
      const f = document.querySelector('[data-slot="fundo-rede"]')!;
      const area = document
        .querySelector('main [data-slot="scroll-area"]')!
        .getBoundingClientRect();
      const r = f.getBoundingClientRect();
      return {
        dentroDoCabecalho: !!f.closest("header"),
        // A lista de conversas e a coluna do cliente são <aside>.
        dentroDeAside: !!f.closest("aside"),
        // ⚠️ ATUALIZADO NA SEGUNDA RODADA DE 19/09: este teste exigia que a
        // textura tivesse a LARGURA DA ÁREA. Ela passou a ter a largura da
        // COLUNA DE LEITURA (no máximo 960px, centrada), porque em tela larga
        // sobrava superfície vazia dos dois lados e lá a textura não fica atrás
        // de nada, fica sozinha na tela. O que o teste sempre quis dizer é que
        // ela cobre a conversa e nada além dela, e isso agora é "contida na
        // área", medido junto com o confinamento no teste próprio abaixo.
        colada: Math.abs(r.top - area.top) < 2,
        contida: r.left >= area.left - 1 && r.right <= area.right + 1,
      };
    });
    expect(onde.dentroDoCabecalho).toBe(false);
    expect(onde.dentroDeAside).toBe(false);
    expect(onde.colada).toBe(true);
    expect(onde.contida).toBe(true);
  });

  test("dissolve nas bordas, em vez de acabar em corte seco", async ({
    page,
  }) => {
    await page.goto("/design");
    // ⚠️ O DEFEITO QUE ESTE TESTE TRANCA, e ele chegou até o dono: a conversa e a
    // caixa de escrita têm a MESMA superfície, então na linha onde uma acaba e a
    // outra começa a única coisa que mudava era a textura ligar e desligar. O
    // resultado era uma faixa cinza atravessando o cartão inteiro, que ele leu
    // como sombra quebrada. Com a máscara o padrão some antes da borda e não
    // existe linha para ver.
    const mascara = await page
      .locator('[data-slot="fundo-rede"]')
      .evaluate((e) => {
        const c = getComputedStyle(e);
        return { imagem: c.maskImage, composicao: c.maskComposite };
      });
    // Dois degradês, um por eixo, cruzados: fade em cima, embaixo e nos dois
    // lados. Um eixo só deixaria a borda do outro em pé.
    expect(mascara.imagem.match(/linear-gradient/g) ?? []).toHaveLength(2);
    expect(mascara.imagem).toMatch(/to right/);
    expect(mascara.composicao).toMatch(/intersect/);
  });

  test("em tela larga a textura fica na coluna de leitura, não nas calhas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 950 });
    await page.goto("/design");
    // Com a coluna do cliente fechada a conversa passa dos 960px, que é o caso
    // em que o dono viu o problema: "as laterais estão ruins". Fundo é o que
    // passa por TRÁS do conteúdo; onde não há conteúdo, é só sujeira.
    await page.getByRole("button", { name: "Ocultar cliente" }).click();
    const medido = await page.evaluate(() => {
      const f = document
        .querySelector('[data-slot="fundo-rede"]')!
        .getBoundingClientRect();
      const area = document
        .querySelector('main [data-slot="scroll-area"]')!
        .getBoundingClientRect();
      return {
        textura: Math.round(f.width),
        area: Math.round(area.width),
        // Centrada: a calha que sobra é igual dos dois lados.
        folgaEsquerda: Math.round(f.left - area.left),
        folgaDireita: Math.round(area.right - f.right),
      };
    });
    expect(medido.area).toBeGreaterThan(960);
    expect(medido.textura).toBe(960);
    expect(Math.abs(medido.folgaEsquerda - medido.folgaDireita)).toBeLessThan(2);
  });

  test("a sombra de baixo tem a largura de quem a projeta", async ({ page }) => {
    await page.goto("/design");
    // Quem projeta a sombra de baixo é a CAIXA DE ESCRITA, branca e centrada em
    // 960px, e não o cartão. Na largura toda ela atravessava as laterais vazias,
    // onde acima e abaixo existe a mesma superfície e nada que projete coisa
    // nenhuma: lá ela lia como um risco solto. A de cima continua de ponta a
    // ponta porque o cabeçalho também é.
    const medido = await page.evaluate(() => {
      const r = (s: string) =>
        document.querySelector(s)!.getBoundingClientRect();
      const fundo = r('[data-slot="sombra-rolagem"][data-borda="fundo"]');
      const topo = r('[data-slot="sombra-rolagem"][data-borda="topo"]');
      const form = r("main form");
      const cabecalho = r("main header");
      return {
        fundo: [Math.round(fundo.left), Math.round(fundo.width)],
        form: [Math.round(form.left), Math.round(form.width)],
        topo: Math.round(topo.width),
        cabecalho: Math.round(cabecalho.width),
      };
    });
    expect(medido.fundo).toEqual(medido.form);
    expect(medido.topo).toBe(medido.cabecalho);
  });

  test("é discreto, e o balão continua vencendo o fundo", async ({ page }) => {
    await page.goto("/design");
    const opacidade = await page
      .locator('[data-slot="fundo-rede"]')
      .evaluate((e) => Number(getComputedStyle(e).opacity));
    expect(opacidade).toBeGreaterThan(0);
    expect(opacidade).toBeLessThanOrEqual(0.12);

    // ⚠️ O contraste do texto é garantido por CONSTRUÇÃO, não por calibragem:
    // todo balão tem fundo OPACO, então o padrão nunca fica atrás de letra. O
    // dia em que alguém puser um balão translúcido, este teste avisa.
    const fundos = await page
      .locator('[data-slot="conversa-balao"]')
      .evaluateAll((els) =>
        els.map((e) => getComputedStyle(e).backgroundColor)
      );
    expect(fundos.length).toBeGreaterThan(0);
    for (const cor of fundos) {
      const alfa = cor.startsWith("rgba") ? Number(cor.split(",")[3]) : 1;
      expect(alfa, cor).toBe(1);
    }
  });

  test("não anda com a rolagem", async ({ page }) => {
    await page.goto("/design");
    const fundo = page.locator('[data-slot="fundo-rede"]');
    const antes = await fundo.evaluate((e) => e.getBoundingClientRect().top);
    // Ele é irmão do ScrollArea e não filho do viewport: o conteúdo passa por
    // cima dele. Um padrão que anda junto com a rolagem chama atenção, e a
    // decisão do dono é discrição.
    await page
      .locator('main [data-slot="scroll-area-viewport"]')
      .first()
      .evaluate((el) => {
        el.scrollTop = 0;
      });
    await expect
      .poll(() => fundo.evaluate((e) => e.getBoundingClientRect().top))
      .toBe(antes);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Item 5: IA e humano não podem atender a mesma conversa
//
// A invariante "IA e pessoa nunca atendem a mesma conversa" já era a regra de
// EXIBIÇÃO (`quemAtende`, lib/crm.ts) e já valia no envio manual. O que faltava
// era valer no BANCO quando o gesto é atribuir ou religar a IA: dava para ter a
// conversa de alguém com a IA ligada, e a tela mostrava as duas coisas.
// ─────────────────────────────────────────────────────────────────────
test.describe("Item 5: IA e pessoa não atendem a mesma conversa", () => {
  test("religar a IA larga o responsável", async ({ page }) => {
    const escritas = await interceptarEscritas(page);
    await page.goto("/design");

    // Estado de partida do preview: alguém assumiu, a IA está pausada.
    // Tudo escopado no cabeçalho da conversa: a lista ao lado fala das mesmas
    // pessoas, e um locator solto acharia o rótulo dela.
    const cabecalho = page.locator("main header");
    const chave = cabecalho.getByRole("switch");
    await expect(chave).toContainText("IA pausada");
    await expect(cabecalho.getByRole("button", { name: "Você" })).toBeVisible();

    await chave.click();

    await expect(chave).toContainText("IA ligada");
    // E o responsável SAIU. Era o estado contraditório: a IA volta a responder e
    // a conversa continua marcada como de uma pessoa.
    await expect(
      cabecalho.getByRole("button", { name: "Ninguém assumiu ainda" })
    ).toBeVisible();
    await expect(cabecalho.getByRole("button", { name: "Você" })).toHaveCount(0);

    // Banco, e não só pixel: as duas escritas saíram, e a segunda zera o
    // responsável.
    await esperarEscritas(escritas, 2);
    expect(escritas.map((e) => e.tabela)).toEqual([
      "dados_cliente",
      "conversations",
    ]);
    expect(escritas[0].corpo).toContain("ativa");
    expect(JSON.parse(escritas[1].corpo)).toEqual({ assigned_user_id: null });
  });

  test("atribuir pausa a IA, inclusive para um colega", async ({ page }) => {
    const escritas = await interceptarEscritas(page);
    await page.goto("/design");

    // Pré-condição: a IA precisa estar LIGADA para o gesto de atribuir ter o que
    // pausar. É o mesmo clique do teste acima, e não uma variante de mock: com
    // a regra nova, "atribuído + IA ligada" não é mais um estado que o produto
    // consiga produzir para nascer na tela.
    const cabecalho = page.locator("main header");
    const chave = cabecalho.getByRole("switch");
    await chave.click();
    await expect(chave).toContainText("IA ligada");
    await esperarEscritas(escritas, 2);
    escritas.length = 0;

    // Transferir para um COLEGA, e não assumir para si: é o caso que surpreende,
    // e a regra é a mesma (a conversa passou a ser de uma pessoa).
    await cabecalho.getByRole("button", { name: "Ninguém assumiu ainda" }).click();
    await page.getByRole("menuitem", { name: "carlos" }).click();

    await expect(cabecalho.getByRole("button", { name: "carlos" })).toBeVisible();
    await expect(chave).toContainText("IA pausada");

    await esperarEscritas(escritas, 2);
    expect(escritas.map((e) => e.tabela)).toEqual([
      "conversations",
      "dados_cliente",
    ]);
    expect(JSON.parse(escritas[1].corpo)).toEqual({ atendimento_ia: "pause" });
  });

  test("soltar a conversa NÃO religa a IA", async ({ page }) => {
    const escritas = await interceptarEscritas(page);
    await page.goto("/design");

    // "Ninguém atende" é um estado LEGÍTIMO, e é o que a lista mostra como
    // dívida visível. Religar aqui transformaria soltar numa devolução
    // silenciosa para a IA, que é decisão de quem mexe na chave.
    const cabecalho = page.locator("main header");
    await cabecalho.getByRole("button", { name: "Você" }).click();
    await page.getByRole("menuitem", { name: "Soltar a conversa" }).click();

    await expect(
      cabecalho.getByRole("button", { name: "Ninguém assumiu ainda" })
    ).toBeVisible();
    await expect(cabecalho.getByRole("switch")).toContainText("IA pausada");
    await esperarEscritas(escritas, 1);
    expect(escritas.map((e) => e.tabela)).toEqual(["conversations"]);
  });
});
