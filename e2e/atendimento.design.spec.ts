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
