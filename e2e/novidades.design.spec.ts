import { test, expect } from "@playwright/test";
import { NOVIDADES, novidadeParaMostrar, type Novidade } from "../lib/novidades";
import { inicioDoDiaSP } from "../lib/fuso";

// NOVIDADES (27/10/2026): uma vez por usuário, só para empresa criada ANTES do
// dia da nota. A REGRA é pura (lib/novidades.ts) e é ela que prova que conta
// nova não vê; a TELA roda no preview /design/novidades. Gravar o "já vi" no
// usuário de verdade fica fora (sem sessão aqui).

const NOTA: Novidade = { id: "2026-10-27", titulo: "Teste", resumo: "r", itens: [{ titulo: "a", texto: "b" }] };
const INICIO = inicioDoDiaSP(NOTA.id);
const DEPOIS = INICIO + 10 * 3_600_000;
const base = { nota: NOTA, vista: null, inicioDoDia: INICIO, agora: DEPOIS };

test.describe("Regra das Novidades (lib/novidades.ts)", () => {
  test("empresa que já existia vê; conta nova não vê", () => {
    expect(novidadeParaMostrar({ ...base, empresaCriadaEm: "2026-10-22T18:33:52Z" })).toBe(NOTA);
    // Criada no próprio dia da nota (já depois da 00h em São Paulo): nova.
    expect(novidadeParaMostrar({ ...base, empresaCriadaEm: "2026-10-27T03:00:00Z" })).toBeNull();
    expect(novidadeParaMostrar({ ...base, empresaCriadaEm: "2026-10-28T12:00:00Z" })).toBeNull();
    // Um minuto antes da 00h de São Paulo ainda é "antes".
    expect(novidadeParaMostrar({ ...base, empresaCriadaEm: "2026-10-27T02:59:00Z" })).toBe(NOTA);
    // Sem data de criação: nunca inventa que é antiga.
    expect(novidadeParaMostrar({ ...base, empresaCriadaEm: null })).toBeNull();
  });

  test("uma vez por usuário: fechou esta ou uma mais nova, não vê de novo", () => {
    const antiga = { ...base, empresaCriadaEm: "2026-10-01T12:00:00Z" };
    expect(novidadeParaMostrar({ ...antiga, vista: "2026-10-27" })).toBeNull();
    expect(novidadeParaMostrar({ ...antiga, vista: "2026-11-02" })).toBeNull();
    expect(novidadeParaMostrar({ ...antiga, vista: "2026-10-01" })).toBe(NOTA);
    expect(novidadeParaMostrar({ ...antiga, vista: 123 })).toBe(NOTA);
  });

  test("nota do futuro ainda não aparece; sem nota, nada", () => {
    const antiga = { ...base, empresaCriadaEm: "2026-10-01T12:00:00Z" };
    expect(novidadeParaMostrar({ ...antiga, agora: INICIO - 1 })).toBeNull();
    expect(novidadeParaMostrar({ ...antiga, nota: null })).toBeNull();
  });

  test("o texto da nota segue as regras de escrita", () => {
    for (const n of NOVIDADES) {
      expect(n.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const tudo = [n.titulo, n.resumo, ...n.itens.flatMap((i) => [i.titulo, i.texto])].join("\n");
      // O formato do diálogo: título curto e UMA linha por novidade.
      for (const i of n.itens) {
        expect(i.titulo.length, i.titulo).toBeLessThanOrEqual(28);
        expect(i.texto.length, i.texto).toBeLessThanOrEqual(64);
      }
      // Sem travessão e sem meia-risca.
      expect(tudo).not.toMatch(/[–—]/);
      // Nenhum emoji além do foguete.
      const emojis = tudo.match(/\p{Extended_Pictographic}/gu) ?? [];
      expect(emojis.filter((e) => e !== "🚀")).toEqual([]);
    }
  });
});

test.describe("Diálogo de Novidades (/design/novidades)", () => {
  test("abre com a nota atual e fecha em Entendi", async ({ page }) => {
    await page.goto("/design/novidades");
    const dialogo = page.locator('[data-slot="novidades"]');
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toHaveAttribute("data-nota", NOVIDADES[0].id);
    await expect(dialogo.getByRole("heading", { name: NOVIDADES[0].titulo })).toBeVisible();
    await expect(dialogo.locator('[data-slot="novidades-item"]')).toHaveCount(NOVIDADES[0].itens.length);
    await dialogo.locator('[data-slot="novidades-fechar"]').click();
    await expect(dialogo).toHaveCount(0);
  });

  test("topo ilustrado com o foguete, a marca do app e a ação depois de um fio", async ({ page }) => {
    await page.goto("/design/novidades");
    const dialogo = page.locator('[data-slot="novidades"]');
    await expect(dialogo.locator('[data-slot="novidades-ilustracao"]')).toBeVisible();
    await expect(dialogo.locator(".anim-foguete")).toHaveCount(1);
    await expect(dialogo.getByText(NOVIDADES[0].resumo)).toBeVisible();
    // A nuvem da frente tem a cor do corpo, nos dois temas: é ela que "vira" o corpo.
    for (const tema of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), tema);
      const [nuvem, corpo] = await dialogo.evaluate((d) => [
        getComputedStyle(d.querySelector('[data-slot="novidades-ilustracao"] g:last-of-type')!).fill,
        getComputedStyle(d).backgroundColor,
      ]);
      expect(nuvem, tema).toBe(corpo);
    }
  });

  test("com movimento reduzido o foguete fica parado", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/design/novidades");
    const anim = await page
      .locator(".anim-foguete")
      .evaluate((g) => getComputedStyle(g).animationName);
    expect(anim).toBe("none");
  });

  test("cabe em 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/design/novidades");
    await expect(page.locator('[data-slot="novidades-fechar"]')).toBeInViewport();
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largura).toBeLessThanOrEqual(390);
  });
});
