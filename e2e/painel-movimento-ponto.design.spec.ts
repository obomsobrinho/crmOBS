import { test, expect } from "@playwright/test";

// ⚠️ A BOLINHA DO HOVER TEM QUE CAIR NA LINHA (02/10/2026, achado do dono). A
// faixa de hover de cada dia tem largura 1/n, mas a linha liga os pontos de
// borda a borda (o primeiro dia em x=0, o último em x=W). Com a bolinha no meio
// da faixa ela escorregava para fora da linha, mais quanto mais perto da ponta.
// Mede o centro da bolinha contra o x do ponto da polyline, em cada dia.
test("no movimento, a bolinha do hover fica em cima do ponto da linha em todos os dias", async ({ page }) => {
  await page.goto("/design/painel");
  const card = page.locator('[data-slot="painel-movimento"]').first();
  await card.waitFor();
  const dias = card.locator(".painel-dia");
  const n = await dias.count();
  expect(n).toBeGreaterThan(1);

  const desvios = await card.evaluate((el) => {
    const svg = el.querySelector('[data-slot="painel-area"]') as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const largura = svg.viewBox.baseVal.width;
    const pts = (svg.querySelector("polyline")?.getAttribute("points") ?? "")
      .trim()
      .split(/\s+/)
      .map((s) => Number(s.split(",")[0]));
    const faixas = [...el.querySelectorAll<HTMLElement>(".painel-dia")];
    return faixas.map((faixa, i) => {
      const guia = faixa.querySelector<HTMLElement>(".painel-guia");
      if (!guia) return 0;
      const g = guia.getBoundingClientRect();
      return Math.abs(g.left + g.width / 2 - (r.left + (pts[i] / largura) * r.width));
    });
  });
  expect(Math.max(...desvios)).toBeLessThan(2);
});
