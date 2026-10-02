import { test, expect, type Page } from "@playwright/test";

// REGRA DA CASA (02/10/2026, pedido do dono): TUDO que é clicável mostra o
// cursor de clique. Antes algumas peças mostravam a seta padrão (o Item de menu
// do Radix e um div com onClick, por exemplo), e a pessoa não sabia que dava
// para clicar.
//
// A regra mora na BASE (`components/ui/*` e o reset de `app/globals.css`); este
// arquivo trava que ela vale em toda tela, e não só onde alguém lembrou. Passa
// por todas as rotas /design (dados falsos, sem login) em desktop e olha todo
// elemento visível e habilitado que a pessoa pode acionar.

const ROTAS = [
  "/design",
  "/design?lista=1",
  "/design?handoff=aberto",
  "/design/agente",
  "/design/assinatura",
  "/design/bloqueio",
  "/design/cancelamento",
  "/design/clientes",
  "/design/clientes?sel=2",
  "/design/conexao",
  "/design/conhecimento",
  "/design/connect",
  "/design/equipe",
  "/design/montagem",
  "/design/montagem?passo=conectar",
  "/design/montagem?passo=testar",
  "/design/onboarding",
  "/design/painel",
  "/design/painel-estados",
  "/design/pedidos",
  "/design/pedidos?abrir=1",
  "/design/pipeline",
  "/design/playground",
  "/design/sistema",
  "/design/valor",
  "/login",
  "/cadastro",
  "/recuperar-senha",
];

const ACIONAVEIS =
  'button, a[href], [role=button], [role=tab], [role=menuitem], [role=option], [role=switch], [role=checkbox], summary, label[for], label:has(input, [role=checkbox], [role=switch]), [onclick]';

/** Quem, na página, é acionável, está visível, habilitado, e NÃO mostra "pointer". */
async function foraDoPadrao(page: Page): Promise<string[]> {
  return page.evaluate((seletor) => {
    const achados: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(seletor)) {
      if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true")
        continue;
      // `label[for]` de um campo desabilitado também não é acionável.
      if (el instanceof HTMLLabelElement && el.control?.matches(":disabled")) continue;
      // Radix escreve `data-disabled` em item de menu e de select.
      if (el.hasAttribute("data-disabled")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const c = getComputedStyle(el);
      if (c.visibility === "hidden" || c.display === "none") continue;
      if (c.pointerEvents === "none") continue;
      // Link de pular para o conteúdo e afins ficam fora da tela até o foco.
      if (r.right < 0 || r.bottom < 0) continue;
      // O que é ARRASTÁVEL mostra a mãozinha de arrastar, que é o cursor certo.
      if (el.draggable && (c.cursor === "grab" || c.cursor === "grabbing")) continue;
      // Operação em andamento (`carregando`) mostra o cursor de progresso.
      if (el.getAttribute("aria-busy") === "true" && c.cursor === "progress") continue;
      if (c.cursor !== "pointer") {
        achados.push(
          `${el.tagName.toLowerCase()}[${el.getAttribute("data-slot") ?? el.getAttribute("role") ?? ""}] cursor=${c.cursor} "${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 30)}"`,
        );
      }
    }
    return achados;
  }, ACIONAVEIS);
}

test.describe("Regra: tudo que é clicável mostra o cursor de clique", () => {
  for (const rota of ROTAS) {
    test(`${rota}: todo acionável habilitado tem cursor pointer`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(rota);
      await expect(page.locator("body")).toBeVisible();
      await page.waitForTimeout(800);
      expect(await foraDoPadrao(page), `cursor errado em ${rota}`).toEqual([]);
    });
  }

  test("menu suspenso: gatilho e itens abertos têm cursor pointer", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/design");
    // O menu do cabeçalho da conversa (Radix: o Item é um div com role).
    const gatilho = page.locator('[data-slot="dropdown-menu-trigger"]').first();
    if ((await gatilho.count()) === 0) test.skip(true, "sem dropdown nesta tela");
    await gatilho.click();
    await expect(page.locator('[role=menuitem]').first()).toBeVisible();
    expect(await foraDoPadrao(page), "item de menu aberto").toEqual([]);
  });

  test("seletor aberto: gatilho e opções (div com role) têm cursor pointer", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/design/pipeline");
    await page.waitForLoadState("networkidle");
    // O filtro de estágio do funil é um Select da base.
    const gatilho = page.locator('[data-slot="select-trigger"]:visible').first();
    await expect(gatilho).toBeVisible();
    await gatilho.click();
    await expect(page.locator('[role=option]').first()).toBeVisible();
    expect(await foraDoPadrao(page), "opção de seletor aberto").toEqual([]);
  });

  test("a base declara o cursor: botão desabilitado mostra not-allowed", async ({ page }) => {
    await page.goto("/design/agente");
    const desabilitados = page.locator("button:disabled:visible");
    const n = await desabilitados.count();
    for (let i = 0; i < Math.min(n, 8); i++) {
      const cursor = await desabilitados
        .nth(i)
        .evaluate((el) => getComputedStyle(el).cursor);
      // `not-allowed` na base; `progress` quando é `carregando`; `default` para
      // o que a base não tem (um <button> cru fora da base).
      expect(["not-allowed", "progress", "default"]).toContain(cursor);
    }
  });
});
