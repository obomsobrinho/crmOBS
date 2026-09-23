import { test, expect } from "@playwright/test";

// Varredura de toda tela em 375px (plano do mobile, 23/09/2026). Roda no
// projeto `mobile`, sobre as telas /design e as públicas, sem login.
//
// Duas regras que valem em QUALQUER tela do celular:
// 1. a página não rola para o lado (conteúdo que vaza vira rolagem horizontal
//    no dedo, e o usuário perde a tela);
// 2. nenhum texto abaixo de 12px (regra da casa, que no celular é mais fácil de
//    quebrar porque tudo encolhe).
//
// ⚠️ Alvo de toque de 44px NÃO está aqui para toda tela: o desktop tem botões de
// 32px de propósito e o mesmo componente serve os dois. Cada tela prova os
// alvos dela no próprio spec.

const TELAS = [
  "/design",
  "/design/painel",
  "/design/pipeline",
  "/design/agente",
  "/design/equipe",
  "/design/assinatura",
  "/design/montagem?passo=conectar",
  "/design/montagem?passo=quem",
  "/design/montagem?passo=sabe",
  "/design/montagem?passo=ativar",
  "/design/connect",
  "/design/conexao",
  "/design/playground",
  "/login",
  "/cadastro",
];

// 375 é o tamanho do desenho; 360 é o Android pequeno mais comum, e é onde
// linha que "quase cabe" começa a vazar (plano do mobile, fase 6).
for (const largura of [375, 360])
for (const url of [...TELAS, "/design?lista=1"]) {
  test(`${url} em ${largura}px: sem rolagem lateral e sem texto abaixo de 12px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const r = await page.evaluate(() => {
      const doc = document.documentElement;
      const pequenos: string[] = [];
      for (const el of document.querySelectorAll("body *")) {
        const st = getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") continue;
        const caixa = el.getBoundingClientRect();
        if (!caixa.width || !caixa.height) continue;
        const temTexto = [...el.childNodes].some(
          (n) => n.nodeType === 3 && n.textContent?.trim(),
        );
        if (temTexto && parseFloat(st.fontSize) < 12)
          pequenos.push(`${st.fontSize} ${el.textContent?.trim().slice(0, 30)}`);
      }
      return { sobra: doc.scrollWidth - doc.clientWidth, pequenos };
    });
    expect(r.sobra).toBeLessThanOrEqual(0);
    expect(r.pequenos).toEqual([]);
  });
}
