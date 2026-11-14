import { test, expect, type Page } from "@playwright/test";

// O orçamento de desempenho (docs/plano-dados-e-estado.md, seção 3), medido no
// build de produção (`npm run test:orcamento`, depois de `npm run build`).
//
// B1: com a navegação do servidor (RSC) atrasada 3 s, a moldura da tela aparece
//     em até 300 ms depois do clique. O menu pré-carrega só na INTENÇÃO (D9): o
//     teste passa o mouse no item, espera o pré-carregamento e clica.
// B2: tela de área MIGRADA vista há pouco abre sem nenhuma requisição que bloqueie
//     (nem a de navegação). A lista cresce a cada passo; vazia no passo 1.
// B8: JS comprimido carregado por rota numa carga do zero, dentro do teto.

const ATRASO_RSC_MS = 3_000;
const B1_MS = 300;

/** Rotas com moldura própria (passo 0). Perfil não tem item no menu do computador. */
const ROTAS_COM_MOLDURA = ["/pipeline", "/pedidos", "/agenda", "/painel", "/equipe", "/agente", "/campanhas"];

/** Áreas migradas (o bloco "State" de .claude/rules/dados-estado-desempenho.md). */
const AREAS_MIGRADAS: string[] = [];

/** B8, em kB comprimidos. Campanhas e Nova busca descem para 340 no passo 2. */
const TETO_KB: Record<string, number> = {
  "/login": 240,
  "/painel": 340,
  "/inbox": 340,
  "/contatos": 340,
  "/pipeline": 340,
  "/pedidos": 340,
  "/agenda": 340,
  "/agente": 340,
  "/equipe": 340,
  "/perfil": 340,
  // Exceção do dono (D15, 14/11/2026): os gráficos de Campanhas ficam na abertura.
  "/campanhas": 480,
  "/campanhas/buscas/nova": 480,
};

/** Atrasa só a navegação do servidor (não o pré-carregamento), como no passo 0. */
async function atrasarNavegacao(page: Page) {
  let ligado = false;
  await page.route("**/*", async (route) => {
    const h = route.request().headers();
    if (ligado && h["rsc"] && !h["next-router-prefetch"]) await new Promise((r) => setTimeout(r, ATRASO_RSC_MS));
    await route.continue();
  });
  return (v: boolean) => {
    ligado = v;
  };
}

async function itemDoMenu(page: Page, rota: string) {
  return page.locator(`nav a[href="${rota}"]:visible`).first();
}

test.describe("B1: a moldura aparece no clique", () => {
  for (const rota of ROTAS_COM_MOLDURA) {
    test(`${rota} em até ${B1_MS} ms com a navegação atrasada`, async ({ page }) => {
      const ligar = await atrasarNavegacao(page);
      await page.goto(rota === "/painel" ? "/inbox" : "/painel");
      await page.waitForLoadState("load");
      const link = await itemDoMenu(page, rota);
      test.skip((await link.count()) === 0, `${rota} não está no menu desta conta`);
      // O pré-carregamento da INTENÇÃO: espera a resposta dele para ESTA rota, e não
      // a "rede parada" (que podia vir antes de ele sair e deixava o teste oscilando).
      const preCarregou = page.waitForResponse(
        (r) => !!r.request().headers()["next-router-prefetch"] && new URL(r.url()).pathname === rota,
        { timeout: 10_000 }
      );
      await link.hover();
      await preCarregou;
      await page.waitForTimeout(200); // a rota pré-carregada entra no cache do roteador
      ligar(true);
      const t0 = Date.now();
      await link.click();
      await page.locator('[data-slot="moldura-carregando"]').first().waitFor({ state: "visible", timeout: ATRASO_RSC_MS });
      const ms = Date.now() - t0;
      ligar(false);
      test.info().annotations.push({ type: "B1", description: `${rota}: ${ms} ms` });
      expect(ms).toBeLessThanOrEqual(B1_MS);
    });
  }
});

test.describe("B2: voltar a uma área migrada não espera nada", () => {
  test.skip(AREAS_MIGRADAS.length === 0, "nenhuma área migrada ainda (passo 1)");
  for (const rota of AREAS_MIGRADAS) {
    test(`A, B, volta para ${rota}`, async ({ page }) => {
      await page.goto(rota);
      await page.waitForLoadState("networkidle");
      const outra = rota === "/painel" ? "/inbox" : "/painel";
      await (await itemDoMenu(page, outra)).click();
      await page.waitForURL((u) => u.pathname === outra);
      await page.waitForLoadState("networkidle");
      const link = await itemDoMenu(page, rota);
      await link.hover();
      await page.waitForLoadState("networkidle");
      const pedidos: string[] = [];
      page.on("request", (r) => {
        if (!r.headers()["next-router-prefetch"]) pedidos.push(r.url());
      });
      await link.click();
      await page.waitForURL((u) => u.pathname === rota);
      await expect(page.locator('[data-slot="moldura-carregando"]')).toHaveCount(0);
      expect(pedidos, "nenhuma requisição na volta, nem a de navegação").toEqual([]);
    });
  }
});

test.describe("B8: JS por rota dentro do teto", () => {
  for (const [rota, teto] of Object.entries(TETO_KB)) {
    test(`${rota} até ${teto} kB`, async ({ page, context }) => {
      if (rota === "/login") await context.clearCookies();
      const r = await page.goto(rota);
      test.skip(!r || new URL(page.url()).pathname !== rota, `${rota} redirecionou nesta conta`);
      // "load" e uma folga, e não "networkidle": com o banco lento, Conversas nunca fica parada.
      await page.waitForLoadState("load");
      await page.waitForTimeout(2_000);
      const bytes = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter((e) => (e as PerformanceResourceTiming).initiatorType === "script" || e.name.endsWith(".js"))
          .reduce((s, e) => s + (e as PerformanceResourceTiming).encodedBodySize, 0)
      );
      const kb = Math.round(bytes / 1024);
      test.info().annotations.push({ type: "B8", description: `${rota}: ${kb} kB` });
      expect(kb).toBeLessThanOrEqual(teto);
    });
  }
});
