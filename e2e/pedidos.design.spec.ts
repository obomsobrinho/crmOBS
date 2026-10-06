import { test, expect } from "@playwright/test";
import {
  casaBuscaPedido,
  encaixarAbertosDaConversa,
  encaixarResolvido,
  montarFila,
  montarResolvidos,
  paraPedido,
  type PedidoAberto,
  type PedidoResolvido,
} from "../lib/pedidos";

// Linha do banco (o que `pedidos_pagina` devolve) para os testes puros.
const linhaBanco = (o: Record<string, unknown>) => ({
  id: 1,
  phone: "5511912345678",
  opened_at: "2026-09-29T10:00:00Z",
  summary: "a",
  instruction: null,
  closed_at: null,
  closed_how: null,
  closed_by: null,
  nomewpp: null,
  display_name: null,
  foto_path: null,
  motivo: null,
  posicao: 1,
  total: 1,
  ...o,
});

// PÁGINA DE PEDIDOS ABERTOS (29/09/2026, docs/plano-pedidos.md).
//
// A regra (lib/pedidos.ts, pura) testada direto, e a tela no /design com dado
// falso: três pedidos em duas conversas, o mais antigo há 6h (âmbar).

test.describe("Fila de pedidos (lib/pedidos.ts)", () => {
  const pedidos = [
    { id: 3, phone: "5511955554444", opened_at: "2026-09-29T12:50:00Z", summary: "c" },
    { id: 1, phone: "5511912345678", opened_at: "2026-09-29T07:00:00Z", summary: "a" },
    { id: 2, phone: "5511912345678", opened_at: "2026-09-29T12:20:00Z", summary: "b" },
  ];
  const contatos = [{ telefone: "5511912345678", nomewpp: "Você", display_name: "Ana" }];

  test("do mais antigo para o mais novo, com a posição na conversa", () => {
    const f = montarFila(pedidos, contatos, null);
    expect(f.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(f[0]).toMatchObject({ nome: "Ana", posicao: 1, total: 2 });
    expect(f[1]).toMatchObject({ posicao: 2, total: 2 });
    expect(f[2]).toMatchObject({ nome: null, posicao: 1, total: 1 });
  });

  test("o número de avisos não entra na fila", () => {
    const f = montarFila(pedidos, contatos, "5511955554444@s.whatsapp.net");
    expect(f.map((p) => p.id)).toEqual([1, 2]);
  });

  test("resolvidos: do mais recente para o mais antigo, com como e orientação", () => {
    const r = montarResolvidos(
      [
        { id: 5, phone: "5511912345678", opened_at: "2026-09-20T10:00:00Z", summary: "a", instruction: null, closed_at: "2026-09-20T11:00:00Z", closed_how: "resolvido", closed_by: "u1" },
        { id: 6, phone: "5511955554444", opened_at: "2026-09-21T10:00:00Z", summary: "b", instruction: " Diga que sim ", closed_at: "2026-09-21T12:00:00Z", closed_how: "ia", closed_by: null },
      ],
      contatos,
      null
    );
    expect(r.map((p) => p.id)).toEqual([6, 5]);
    expect(r[0]).toMatchObject({ como: "ia", orientacao: "Diga que sim", nome: null });
    expect(r[1]).toMatchObject({ como: "resolvido", orientacao: null, nome: "Ana", porQuem: "u1" });
  });

  test("a busca olha cliente, telefone e o que foi pedido", () => {
    const [p] = montarFila(pedidos, contatos, null);
    expect(casaBuscaPedido(p, "ana")).toBe(true);
    expect(casaBuscaPedido(p, "91234")).toBe(true);
    expect(casaBuscaPedido({ ...p, summary: "Quer saber da GARANTIA" }, "garantia")).toBe(true);
    expect(casaBuscaPedido(p, "zzz")).toBe(false);
  });
});

test.describe("Paginação de pedidos (lib/pedidos.ts, peças puras)", () => {
  test("a linha do banco vira pedido, com o nome limpo e a posição do banco", () => {
    const a = paraPedido(linhaBanco({ nomewpp: "Você", display_name: "Ana", posicao: "2", total: "3" })) as PedidoAberto;
    expect(a).toMatchObject({ nome: "Ana", posicao: 2, total: 3, openedAt: "2026-09-29T10:00:00Z", fotoPath: null });
    // A foto do contato (R-26) vem na mesma linha, sem consulta nova.
    expect(paraPedido(linhaBanco({ foto_path: "t/55.jpg" }))).toMatchObject({ fotoPath: "t/55.jpg" });
    const r = paraPedido(
      linhaBanco({ closed_at: "2026-09-29T11:00:00Z", closed_how: "ia", instruction: " ok ", posicao: null, total: null })
    ) as PedidoResolvido;
    expect(r).toMatchObject({ como: "ia", orientacao: "ok", nome: null, closedAt: "2026-09-29T11:00:00Z" });
  });

  test("a fila de uma conversa é trocada inteira e o pedido novo entra no fim sem buraco", () => {
    const aberto = (id: number, phone: string, opened: string, posicao = 1, total = 1) =>
      paraPedido(linhaBanco({ id, phone, opened_at: opened, posicao, total })) as PedidoAberto;
    const lista = [
      aberto(1, "A", "2026-09-29T08:00:00Z", 1, 2),
      aberto(2, "B", "2026-09-29T09:00:00Z"),
      aberto(3, "A", "2026-09-29T10:00:00Z", 2, 2),
    ];
    // A conversa A fechou o pedido 1: sobra o 3, agora "1 de 1".
    const sem = encaixarAbertosDaConversa(lista, "A", [aberto(3, "A", "2026-09-29T10:00:00Z", 1, 1)], "", false);
    expect(sem.map((p) => p.id)).toEqual([2, 3]);
    expect(sem[1]).toMatchObject({ posicao: 1, total: 1 });
    // Pedido novo da conversa C: no fim se a lista está completa...
    const novo = aberto(4, "C", "2026-09-29T11:00:00Z");
    expect(encaixarAbertosDaConversa(lista, "C", [novo], "", false).map((p) => p.id)).toEqual([1, 2, 3, 4]);
    // ...e fora da tela se ainda há páginas (chega pela rolagem, sem buraco nem repetição).
    expect(encaixarAbertosDaConversa(lista, "C", [novo], "", true).map((p) => p.id)).toEqual([1, 2, 3]);
    // Com busca ativa, quem não casa não entra.
    expect(encaixarAbertosDaConversa(lista, "C", [novo], "zzz", false).map((p) => p.id)).toEqual([1, 2, 3]);
  });

  test("resolvido entra no topo, sai se foi apagado ou saiu da janela de 30 dias", () => {
    const agora = Date.parse("2026-10-02T12:00:00Z");
    const fechado = (id: number, em: string) =>
      paraPedido(linhaBanco({ id, closed_at: em, closed_how: "resolvido", posicao: null, total: null }));
    const lista = [fechado(5, "2026-10-01T10:00:00Z"), fechado(4, "2026-09-30T10:00:00Z")];
    const novo = fechado(6, "2026-10-02T11:00:00Z");
    expect(encaixarResolvido(lista, 6, novo, "", true, agora).map((p) => p.id)).toEqual([6, 5, 4]);
    expect(encaixarResolvido(lista, 5, null, "", true, agora).map((p) => p.id)).toEqual([4]);
    const velho = fechado(3, "2026-08-01T10:00:00Z");
    expect(encaixarResolvido(lista, 3, velho, "", false, agora).map((p) => p.id)).toEqual([5, 4]);
    // Abaixo do último da tela, com mais páginas por vir, não entra agora.
    const antigo = fechado(2, "2026-09-20T10:00:00Z");
    expect(encaixarResolvido(lista, 2, antigo, "", true, agora).map((p) => p.id)).toEqual([5, 4]);
  });
});

test.describe("Página de pedidos (/design/pedidos)", () => {
  test("25 abertos: 10 por vez, mais ao rolar, com o número do cabeçalho do agregado", async ({ page }) => {
    await page.goto("/design/pedidos?muitos=1");
    const linhas = page.locator('[data-slot="pedido-linha"]');
    await expect(linhas).toHaveCount(10);
    // O número é o total, não o que está carregado.
    await expect(page.locator('[data-slot="pedidos-aba"]').first()).toContainText("25");
    await page.locator('[data-slot="pedidos-mais"]').scrollIntoViewIfNeeded();
    await expect(linhas).toHaveCount(20);
    await page.locator('[data-slot="pedidos-mais"]').scrollIntoViewIfNeeded();
    await expect(linhas).toHaveCount(25);
    await expect(page.locator('[data-slot="pedidos-mais"]')).toHaveCount(0);
  });

  test("a busca recorta no servidor (fonte) e some quando limpa", async ({ page }) => {
    await page.goto("/design/pedidos?muitos=1");
    await page.getByLabel("Buscar pedidos").fill("extra 22");
    await expect(page.locator('[data-slot="pedido-linha"]')).toHaveCount(1);
    await page.getByLabel("Buscar pedidos").fill("");
    await expect(page.locator('[data-slot="pedido-linha"]')).toHaveCount(10);
  });

  const linhas = (page: import("@playwright/test").Page) => page.locator('[data-slot="pedido-linha"]');
  const detalhe = (page: import("@playwright/test").Page) => page.locator('[data-slot="pedido-detalhe"]');

  test("abertos do mais antigo para o mais novo, com espera, cliente e resumo", async ({ page }) => {
    await page.goto("/design/pedidos");
    await expect(linhas(page)).toHaveCount(3);
    await expect(linhas(page).nth(0)).toContainText("Ana Paula");
    await expect(linhas(page).nth(0)).toContainText("Pediu o valor da troca da lente");
    await expect(linhas(page).nth(0)).toContainText("1 de 2 nesta conversa");
    await expect(linhas(page).nth(1)).toContainText("2 de 2 nesta conversa");
    // Sem nome, o telefone formatado.
    await expect(linhas(page).nth(2)).toContainText("+55 (11) 95555-4444");
    // Acima de 2h a espera fica âmbar; abaixo, não.
    await expect(linhas(page).nth(0).locator('[data-slot="pedido-espera"]')).toHaveAttribute("data-longa", "sim");
    await expect(linhas(page).nth(2).locator('[data-slot="pedido-espera"]')).not.toHaveAttribute("data-longa", "sim");
    // Nenhum selecionado: a coluna da ficha diz o que fazer.
    await expect(page.locator('[data-slot="pedido-nenhum"]')).toBeVisible();
  });

  test("o pedido abre ao lado como FICHA, sem chat, com orientar e Resolvido", async ({ page }) => {
    await page.goto("/design/pedidos");
    await linhas(page).first().click();
    await expect(detalhe(page)).toHaveCount(1);
    await expect(detalhe(page).locator('[data-slot="pedido-resumo"]')).toContainText("troca da lente");
    // Decisão do dono (30/09/2026): nada de balão de conversa aqui.
    await expect(detalhe(page).locator("[data-autor]")).toHaveCount(0);
    await expect(detalhe(page).getByRole("textbox", { name: "Orientação para a IA" })).toBeVisible();
    await expect(detalhe(page).getByRole("button", { name: "Resolvido" })).toBeVisible();
    await expect(detalhe(page).getByRole("link", { name: "Abrir conversa" })).toHaveAttribute(
      "href",
      "/inbox/5511912345678"
    );
    await expect(linhas(page).first().getByRole("button")).toHaveAttribute("aria-current", "true");
  });

  test("o link do aviso abre o pedido certo", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=2");
    await expect(detalhe(page)).toHaveAttribute("data-pedido", "2");
  });

  test("Resolvido tira o pedido dos abertos e ele aparece nos resolvidos", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=1");
    await detalhe(page).getByRole("button", { name: "Resolvido" }).click();
    await expect(page.locator('[data-slot="pedidos-resultado"]')).toHaveText("Marcado como resolvido.");
    await expect(linhas(page)).toHaveCount(2);
    await page.getByRole("tab", { name: "Resolvidos" }).click();
    await expect(linhas(page)).toHaveCount(3);
    await expect(linhas(page).first()).toContainText("troca da lente");
  });

  test("orientar pela ficha resolve, e o histórico guarda a orientação", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=3");
    await detalhe(page).getByRole("textbox", { name: "Orientação para a IA" }).fill("Diga que parcela em até 6 vezes.");
    await detalhe(page).getByRole("button", { name: "Orientar a IA" }).click();
    await expect(page.locator('[data-slot="pedidos-resultado"]')).toContainText("Orientado.");
    await page.getByRole("tab", { name: "Resolvidos" }).click();
    await linhas(page).first().click();
    await expect(detalhe(page).locator('[data-slot="pedido-como"]')).toHaveText("A IA respondeu com a orientação do time");
    await expect(detalhe(page).locator('[data-slot="pedido-orientacao"]')).toHaveText("Diga que parcela em até 6 vezes.");
    // Resolvido é histórico: não tem ação.
    await expect(detalhe(page).locator('[data-slot="pedido-acoes"]')).toHaveCount(0);
  });

  test("resolvidos mostram quem resolveu e a busca recorta a lista", async ({ page }) => {
    await page.goto("/design/pedidos");
    await page.getByRole("tab", { name: "Resolvidos" }).click();
    await expect(linhas(page)).toHaveCount(2);
    await linhas(page).nth(1).click();
    await expect(detalhe(page).locator('[data-slot="pedido-como"]')).toHaveText("Resolvido por franck");
    await page.getByLabel("Buscar pedidos").fill("sábado");
    await expect(linhas(page)).toHaveCount(1);
    await expect(linhas(page).first()).toContainText("Carlos Mendes");
  });

  test("sem pedido, diz que não há e onde vão aparecer", async ({ page }) => {
    await page.goto("/design/pedidos?vazio=1");
    await expect(page.locator('[data-slot="pedidos-vazio"]')).toContainText("Nenhum pedido esperando.");
  });

  test("o menu tem Pedidos entre Painel e Conversas", async ({ page }) => {
    await page.goto("/design/pedidos");
    const nomes = await page
      .locator("nav a")
      .evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ""));
    const i = nomes.findIndex((n) => n.startsWith("Pedidos"));
    expect(i).toBeGreaterThan(-1);
    expect(nomes[i - 1]).toMatch(/^Painel/);
    expect(nomes[i + 1]).toMatch(/^Conversas/);
  });

  test("sem travessão e sem assumir segmento", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=1");
    const texto = await page.locator("main, body").first().innerText();
    expect(texto).not.toMatch(/[—–]/);
    expect(texto).not.toMatch(/consulta|paciente|agendamento/i);
  });
});
