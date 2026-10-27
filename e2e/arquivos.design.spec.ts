import { test, expect, type Page } from "@playwright/test";
import {
  abaInicial,
  arquivoDaLinha,
  ehPdf,
  nomeDoDocumento,
  nomeParaBaixar,
  ordenarArquivos,
  rotuloDoTipo,
  type ArquivoDoContato,
} from "../lib/arquivos";

// ARQUIVOS DO CONTATO (27/10/2026): imagens, vídeos e documentos que a pessoa
// mandou, no bloco "Arquivos" da ficha, uma aba por tipo. Duas metades: a REGRA
// (lib/arquivos.ts, pura, sem navegador) e a TELA no preview /design, com
// arquivos falsos. A URL assinada e o download do Storage de verdade não rodam
// aqui (sem banco).

const linha = (o: Partial<Parameters<typeof arquivoDaLinha>[0]>) => ({
  id: 1,
  media_url: "t/in/abc.pdf",
  message_type: "document",
  user_message: null,
  created_at: "2026-10-27T14:00:00Z",
  ...o,
});

test.describe("Regra dos arquivos (lib/arquivos.ts)", () => {
  test("o nome do documento sai do texto que o n8n grava", () => {
    expect(nomeDoDocumento("[Documento enviado: contrato.pdf. O conteúdo não pôde ser lido.]")).toBe("contrato.pdf");
    // Com legenda da pessoa antes.
    expect(nomeDoDocumento("segue o RG\n\n[Documento enviado: RG frente.pdf. O conteúdo não pôde ser lido.]")).toBe("RG frente.pdf");
    // Sem nome de arquivo, o n8n escreve só "[Documento enviado. ...]".
    expect(nomeDoDocumento("[Documento enviado. O conteúdo não pôde ser lido.]")).toBeNull();
    expect(nomeDoDocumento(null)).toBeNull();
  });

  test("imagem, vídeo e documento COM arquivo guardado entram; áudio não", () => {
    expect(arquivoDaLinha(linha({ message_type: "audio" }))).toBeNull();
    expect(arquivoDaLinha(linha({ message_type: "text" }))).toBeNull();
    expect(arquivoDaLinha(linha({ media_url: null }))).toBeNull();
    expect(arquivoDaLinha(linha({ created_at: null }))).toBeNull();
    expect(arquivoDaLinha(linha({ message_type: "video", media_url: "t/in/v.mp4" }))).toMatchObject({ tipo: "video", nome: null });
    const img = arquivoDaLinha(linha({ message_type: "image", media_url: "t/in/x.jpg", user_message: "[Imagem enviada: um RG]" }));
    expect(img).toMatchObject({ tipo: "image", nome: null, caminho: "t/in/x.jpg" });
    const doc = arquivoDaLinha(linha({ user_message: "[Documento enviado: laudo.pdf. O conteúdo não pôde ser lido.]" }));
    expect(doc).toMatchObject({ tipo: "document", nome: "laudo.pdf" });
  });

  test("mais recente primeiro, e o empate no instante decide pelo id", () => {
    const a = (id: number, criadoEm: string): ArquivoDoContato => ({ id, caminho: `p/${id}.jpg`, tipo: "image", nome: null, criadoEm });
    const ordem = ordenarArquivos([a(1, "2026-10-26T10:00:00Z"), a(3, "2026-10-27T10:00:00Z"), a(2, "2026-10-27T10:00:00Z")]);
    expect(ordem.map((x) => x.id)).toEqual([3, 2, 1]);
  });

  test("nome para baixar, tipo escrito e prévia de PDF", () => {
    const img: ArquivoDoContato = { id: 1, caminho: "t/in/u.jpg", tipo: "image", nome: null, criadoEm: "2026-10-27T14:00:00Z" };
    expect(nomeParaBaixar(img, "2026-10-27")).toBe("imagem-2026-10-27.jpg");
    expect(nomeParaBaixar({ ...img, tipo: "video", caminho: "t/in/u.mp4" }, "2026-10-27")).toBe("video-2026-10-27.mp4");
    const doc: ArquivoDoContato = { id: 2, caminho: "t/in/u.pdf", tipo: "document", nome: "contrato.pdf", criadoEm: "2026-10-27T14:00:00Z" };
    expect(nomeParaBaixar(doc, "2026-10-27")).toBe("contrato.pdf");
    expect(ehPdf(doc)).toBe(true);
    expect(ehPdf({ ...doc, caminho: "t/in/u.docx", nome: "p.docx" })).toBe(false);
    expect(ehPdf(img)).toBe(false);
    expect(rotuloDoTipo(doc)).toBe("PDF");
    // O nome que a pessoa mandou vence o `bin` do mime desconhecido.
    expect(rotuloDoTipo({ ...doc, caminho: "t/in/u.bin", nome: "proposta.docx" })).toBe("DOCX");
    expect(rotuloDoTipo({ ...doc, caminho: "t/in/u.bin", nome: null })).toBe("Arquivo");
  });

  test("a aba que abre é a primeira com arquivo", () => {
    expect(abaInicial(null)).toBe("image");
    expect(abaInicial({ image: 0, video: 0, document: 0 })).toBe("image");
    expect(abaInicial({ image: 0, video: 2, document: 5 })).toBe("video");
    expect(abaInicial({ image: 0, video: 0, document: 1 })).toBe("document");
  });
});

const bloco = (page: Page) => page.locator('[data-slot="painel-arquivos"]:visible');
const aba = (page: Page, tipo: string) => bloco(page).locator(`[data-arquivo-aba="${tipo}"]`);

test.describe("Bloco Arquivos na ficha da conversa (/design)", () => {
  test("três abas com contagem; cada uma mostra só o seu tipo", async ({ page }) => {
    await page.goto("/design");
    await expect(aba(page, "image")).toContainText("Imagens3");
    await expect(aba(page, "video")).toContainText("Vídeos1");
    await expect(aba(page, "document")).toContainText("Documentos2");

    // Abre em Imagens: só miniaturas de imagem.
    await expect(aba(page, "image")).toHaveAttribute("data-state", "active");
    await expect(bloco(page).locator('[data-arquivo="imagem"]')).toHaveCount(3);
    await expect(bloco(page).locator('[data-arquivo="documento"]')).toHaveCount(0);

    await aba(page, "video").click();
    await expect(bloco(page).locator('[data-arquivo="video"]')).toHaveCount(1);
    await expect(bloco(page).locator('[data-arquivo="imagem"]')).toHaveCount(0);

    await aba(page, "document").click();
    const docs = bloco(page).locator('[data-arquivo="documento"]');
    await expect(docs).toHaveCount(2);
    // Nome, tipo e data em cada linha.
    await expect(docs.first()).toContainText("comprovante-pix.pdf");
    await expect(docs.first()).toContainText(/PDF · \d{1,2} \w{3}, \d{2}:\d{2}/);
  });

  // Achado do dono (27/10/2026): com "Documentos" ativa, a pílula vazava pela
  // borda da trilha. Em toda aba ativa, na largura do painel e no celular, a
  // pílula fica DENTRO da trilha e o respiro em volta do texto é o mesmo.
  for (const largura of [1366, 390]) {
    test(`a pílula ativa cabe na trilha em toda aba (${largura}px)`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 844 });
      await page.goto("/design");
      if (largura < 768) {
        await page.getByRole("button", { name: "Mais ações da conversa" }).click();
        await page.getByRole("menuitem", { name: "Dados do contato" }).click();
      }
      for (const tipo of ["image", "video", "document"]) {
        await aba(page, tipo).click();
        await expect(aba(page, tipo)).toHaveAttribute("data-state", "active");
        const m = await aba(page, tipo).evaluate((t) => {
          const trilha = t.parentElement!.getBoundingClientRect();
          const b = t.getBoundingClientRect();
          const filhos = [...t.children].map((c) => c.getBoundingClientRect());
          return {
            dentro: b.left >= trilha.left && b.right <= trilha.right + 0.5,
            esq: Math.round(filhos[0].left - b.left),
            dir: Math.round(b.right - filhos[filhos.length - 1].right),
            transborda: t.scrollWidth > t.clientWidth,
          };
        });
        expect(m.dentro, `${tipo}: ${JSON.stringify(m)}`).toBe(true);
        expect(m.transborda, tipo).toBe(false);
        expect(Math.abs(m.esq - m.dir), `${tipo}: ${JSON.stringify(m)}`).toBeLessThanOrEqual(1);
      }
    });
  }

  test("a imagem abre a prévia com Abrir e Baixar", async ({ page }) => {
    await page.goto("/design");
    await bloco(page).locator('[data-arquivo="imagem"]').first().click();
    const previa = page.locator("[data-arquivo-previa]");
    await expect(previa).toBeVisible();
    await expect(previa.getByRole("img", { name: "Imagem enviada pelo contato" })).toBeVisible();
    await expect(previa.locator('[data-arquivo-acao="abrir"]')).toHaveAttribute("target", "_blank");
    await expect(previa.locator('[data-arquivo-acao="baixar"]')).toHaveAttribute("download", /^imagem-\d{4}-\d{2}-\d{2}$/);
    await page.keyboard.press("Escape");
    await expect(previa).toHaveCount(0);
  });

  test("o vídeo abre num player com Abrir e Baixar", async ({ page }) => {
    await page.goto("/design");
    await aba(page, "video").click();
    await bloco(page).locator('[data-arquivo="video"]').click();
    const previa = page.locator("[data-arquivo-previa]");
    await expect(previa.locator("[data-arquivo-video]")).toHaveAttribute("controls", "");
    await expect(previa.locator('[data-arquivo-acao="baixar"]')).toHaveAttribute("download", /^video-\d{4}-\d{2}-\d{2}\.mp4$/);
  });

  test("o PDF abre em prévia; o .docx diz que não tem prévia e deixa baixar", async ({ page }) => {
    await page.goto("/design");
    await aba(page, "document").click();
    const docs = bloco(page).locator('[data-arquivo="documento"]');
    await docs.filter({ hasText: "comprovante-pix.pdf" }).click();
    const previa = page.locator("[data-arquivo-previa]");
    await expect(previa.locator("[data-arquivo-pdf]")).toBeVisible();
    await expect(previa.locator('[data-arquivo-acao="baixar"]')).toHaveAttribute("download", "comprovante-pix.pdf");
    await page.keyboard.press("Escape");

    await docs.filter({ hasText: "proposta-assinada.docx" }).click();
    await expect(previa).toContainText("não tem prévia");
    await expect(previa.locator("[data-arquivo-pdf]")).toHaveCount(0);
    await expect(previa.locator('[data-arquivo-acao="baixar"]')).toHaveAttribute("download", "proposta-assinada.docx");
  });

  test("sem arquivos, cada aba diz isso e as contagens são zero", async ({ page }) => {
    await page.goto("/design?arquivos=nenhum");
    await expect(aba(page, "image")).toContainText("Imagens0");
    await expect(bloco(page)).toContainText("Nenhuma imagem recebida ainda.");
    await aba(page, "document").click();
    await expect(bloco(page)).toContainText("Nenhum documento recebido ainda.");
    await expect(bloco(page).locator("[data-arquivo]")).toHaveCount(0);
  });

  test("cabe em 390px sem rolar a página de lado", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/design");
    await page.getByRole("button", { name: "Mais ações da conversa" }).click();
    await page.getByRole("menuitem", { name: "Dados do contato" }).click();
    await expect(aba(page, "document")).toBeVisible();
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largura).toBeLessThanOrEqual(390);
  });
});
