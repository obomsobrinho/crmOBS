import { test, expect, type Page } from "@playwright/test";

// A BARRA DA CONVERSA (05/10/2026, achado do dono): girando a roda a barrinha
// saltava, e segurando-a ela ficava parada enquanto o chat continuava subindo.
// Aqui se mede a barra contra a conta que ela deveria obedecer: a posição do
// polegar é proporcional ao `scrollTop`. Conversa longa em `/design?mensagens=150`.

const ROTA = "/design?mensagens=150";

async function medida(page: Page) {
  return page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>(
      'main [data-slot="scroll-area-viewport"]'
    )!;
    const thumb = document.querySelector<HTMLElement>(
      'main [data-slot="scroll-area-thumb"]'
    )!;
    const trilho = thumb.parentElement!.getBoundingClientRect();
    const t = thumb.getBoundingClientRect();
    const rolavel = vp.scrollHeight - vp.clientHeight;
    const livre = trilho.height - t.height;
    return {
      scrollTop: vp.scrollTop,
      rolavel,
      thumbTop: t.top - trilho.top,
      thumbAltura: t.height,
      // onde o polegar deveria estar para esse scrollTop
      esperado: rolavel > 0 ? (vp.scrollTop / rolavel) * livre : 0,
    };
  });
}

async function abrir(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(ROTA);
  const vp = page.locator('main [data-slot="scroll-area-viewport"]').first();
  await expect
    .poll(() =>
      vp.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)
    )
    .toBeLessThan(12);
  await page.waitForTimeout(800);
  return vp;
}

test.describe("Barra de rolagem da conversa", () => {
  test("a roda do mouse move o polegar em proporção, sem saltos", async ({ page }) => {
    await abrir(page);
    const area = page.locator('main [data-slot="scroll-area-viewport"]').first();
    const caixa = (await area.boundingBox())!;
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);

    const passos: { scrollTop: number; erro: number; salto: number }[] = [];
    let anterior = (await medida(page)).thumbTop;
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(120);
      const m = await medida(page);
      passos.push({
        scrollTop: m.scrollTop,
        erro: Math.abs(m.thumbTop - m.esperado),
        salto: Math.abs(m.thumbTop - anterior),
      });
      anterior = m.thumbTop;
    }
    const pior = Math.max(...passos.map((p) => p.erro));
    expect(pior, JSON.stringify(passos)).toBeLessThan(2);
  });

  test("arrastar o polegar rola o chat junto, e o polegar acompanha o mouse", async ({
    page,
  }) => {
    await abrir(page);
    // Sobe um pouco para sair do fim e o polegar ficar livre para arrastar.
    const area = page.locator('main [data-slot="scroll-area-viewport"]').first();
    await area.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 2;
    });
    await page.waitForTimeout(500);

    const thumb = page.locator('main [data-slot="scroll-area-thumb"]');
    const b = (await thumb.boundingBox())!;
    const x = b.x + b.width / 2;
    const y0 = b.y + b.height / 2;
    const inicio = await medida(page);

    await page.mouse.move(x, y0);
    await page.mouse.down();
    const passos: { alvo: number; thumbTop: number; scrollTop: number }[] = [];
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(x, y0 - i * 15, { steps: 4 });
      await page.waitForTimeout(100);
      const m = await medida(page);
      passos.push({
        alvo: inicio.thumbTop - i * 15,
        thumbTop: m.thumbTop,
        scrollTop: m.scrollTop,
      });
    }
    await page.mouse.up();

    // O polegar tem que ter ido para onde o mouse o levou, e o chat com ele.
    const ultimo = passos[passos.length - 1];
    expect(
      Math.abs(ultimo.thumbTop - ultimo.alvo),
      JSON.stringify(passos)
    ).toBeLessThan(6);
    expect(ultimo.scrollTop, JSON.stringify(passos)).toBeLessThan(inicio.scrollTop);
  });
});

// A CONVERSA PAGINADA: as mensagens anteriores chegam ao subir, e `scrollHeight`
// cresce em cima. É aí que a barra briga com a correção de posição.
// A `/design` não tem banco, então o teste serve as páginas pela rede, no mesmo
// formato do PostgREST.
const TOTAL = 150;
function linhaAntiga(i: number) {
  const texto = `Mensagem de teste ${i + 1}. ${"Texto para dar altura ao balão. ".repeat(1 + ((i * 7) % 5))}`;
  return {
    id: 1000 + i,
    phone: "553584774753@s.whatsapp.net",
    nomewpp: i % 2 === 0 ? "Franck Antonny" : null,
    user_message: i % 2 === 0 ? texto : null,
    bot_message: i % 2 === 0 ? null : texto,
    message_type: i % 2 === 0 ? null : "text",
    active: null,
    created_at: new Date(2026, 6, 20, 8, 0 + i).toISOString(),
    media_url: null,
    media_type: null,
  };
}

async function abrirPaginada(page: Page) {
  // Já foram mostradas as 30 últimas (índices 120 a 149).
  let proximo = TOTAL - 30;
  let pedidos = 0;
  await page.route("**/rest/v1/chat_messages*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    pedidos++;
    await new Promise((r) => setTimeout(r, 150));
    const fim = proximo;
    const ini = Math.max(0, fim - 30);
    proximo = ini;
    const linhas = Array.from({ length: fim - ini }, (_, k) => linhaAntiga(fim - 1 - k));
    await route.fulfill({ json: linhas });
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/design?mensagens=${TOTAL}&paginada=1`);
  const vp = page.locator('main [data-slot="scroll-area-viewport"]').first();
  await expect
    .poll(() => vp.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
    .toBeLessThan(12);
  await page.waitForTimeout(1200);
  return { vp, pedidos: () => pedidos };
}

test("subindo com a roda até carregar as anteriores, o polegar não salta", async ({ page }) => {
  const { vp, pedidos } = await abrirPaginada(page);
  const caixa = (await vp.boundingBox())!;
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);

  const passos: { scrollTop: number; scrollHeight: number; erro: number }[] = [];
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(80);
    const m = await medida(page);
    const h = await vp.evaluate((el) => el.scrollHeight);
    passos.push({ scrollTop: Math.round(m.scrollTop), scrollHeight: h, erro: Math.round(Math.abs(m.thumbTop - m.esperado)) });
  }
  expect(pedidos(), "carregou páginas anteriores").toBeGreaterThan(0);
  const pior = Math.max(...passos.map((p) => p.erro));
  expect(pior, JSON.stringify(passos)).toBeLessThan(2);
});

test("segurando o polegar nada muda sob ele; ao soltar, as anteriores vêm e a posição fica", async ({ page }) => {
  const { vp, pedidos } = await abrirPaginada(page);
  const thumb = page.locator('main [data-slot="scroll-area-thumb"]').first();
  const b = (await thumb.boundingBox())!;
  const x = b.x + b.width / 2;
  const y0 = b.y + b.height / 2;
  await page.mouse.move(x, y0);
  await page.mouse.down();
  const alturaAntes = await vp.evaluate((el) => el.scrollHeight);
  const passos: { thumbTop: number; scrollTop: number; scrollHeight: number }[] = [];
  // Arrasta até o topo e continua segurando, passando pelo ponto em que as
  // anteriores chegariam.
  for (let i = 1; i <= 40; i++) {
    await page.mouse.move(x, Math.max(b.y - 400, y0 - i * 15), { steps: 3 });
    await page.waitForTimeout(60);
    const m = await medida(page);
    passos.push({
      thumbTop: Math.round(m.thumbTop),
      scrollTop: Math.round(m.scrollTop),
      scrollHeight: await vp.evaluate((el) => el.scrollHeight),
    });
  }
  await page.waitForTimeout(600);
  // Segurado: nenhuma página carregou, o conteúdo não mudou de tamanho.
  expect(pedidos(), "segurar o polegar não carrega", ).toBe(0);
  expect(passos.every((p) => p.scrollHeight === alturaAntes), JSON.stringify(passos)).toBe(true);
  // O polegar só desce para cima junto com o mouse, nunca volta sozinho.
  for (let i = 1; i < passos.length; i++) {
    expect(passos[i].thumbTop, JSON.stringify(passos)).toBeLessThanOrEqual(passos[i - 1].thumbTop + 2);
  }
  await page.mouse.up();
  // Soltou no topo: vem UMA página, e a mensagem que estava no topo não sai do lugar.
  await expect.poll(() => pedidos(), { timeout: 5_000 }).toBe(1);
  await expect.poll(() => vp.evaluate((el) => el.scrollHeight)).toBeGreaterThan(alturaAntes + 1000);
  await expect.poll(() => vp.evaluate((el) => el.scrollTop)).toBeGreaterThan(1000);
});

// CONVERSA CURTA, SEM PAGINAÇÃO (06/10/2026, o dono de novo): no início da
// conversa o polegar aparecia no meio. Mede tamanho E posição do polegar contra
// a conta, abrindo a conversa, no topo, no meio e no fim.
test("conversa curta: o polegar tem o tamanho certo e acompanha do início ao fim", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/design");
  const vp = page.locator('main [data-slot="scroll-area-viewport"]').first();
  await expect.poll(() => vp.evaluate((el) => el.scrollHeight > el.clientHeight + 50)).toBe(true);
  await page.waitForTimeout(800);
  const conferir = async (onde: string) => {
    const m = await page.evaluate(() => {
      const v = document.querySelector<HTMLElement>('main [data-slot="scroll-area-viewport"]')!;
      const t = document.querySelector<HTMLElement>('main [data-slot="scroll-area-thumb"]');
      if (!t) return null;
      const tr = t.parentElement!.getBoundingClientRect();
      const r = t.getBoundingClientRect();
      const tamanho = Math.max(tr.height * (v.clientHeight / v.scrollHeight), 18);
      const rolavel = v.scrollHeight - v.clientHeight;
      return {
        altura: r.height,
        alturaCerta: tamanho,
        topo: r.top - tr.top,
        topoCerto: (v.scrollTop / rolavel) * (tr.height - tamanho),
      };
    });
    expect(m, `${onde}: polegar não existe`).not.toBeNull();
    expect(Math.abs(m!.altura - m!.alturaCerta), `${onde}: ${JSON.stringify(m)}`).toBeLessThan(2);
    expect(Math.abs(m!.topo - m!.topoCerto), `${onde}: ${JSON.stringify(m)}`).toBeLessThan(2);
  };
  await conferir("ao abrir");
  const caixa = (await vp.boundingBox())!;
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -200);
  await expect.poll(() => vp.evaluate((el) => el.scrollTop)).toBe(0);
  await page.waitForTimeout(300);
  await conferir("no início");
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  await conferir("no meio");
});
