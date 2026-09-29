import { test, expect } from "@playwright/test";
import { mensagensDeContexto, montarFila } from "../lib/pedidos";

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

  test("o contexto separa o turno de duas mensagens e diz quem falou", () => {
    const c = mensagensDeContexto([
      { user_message: "Oi", bot_message: "Olá! | Como posso ajudar?", message_type: null, created_at: "t1" },
      { user_message: null, bot_message: "Sou do time", message_type: "manual", created_at: "t2" },
    ]);
    expect(c.map((m) => `${m.autor}:${m.texto}`)).toEqual([
      "cliente:Oi",
      "ia:Olá!",
      "ia:Como posso ajudar?",
      "time:Sou do time",
    ]);
  });
});

test.describe("Página de pedidos (/design/pedidos)", () => {
  test("lista do mais antigo para o mais novo, com espera, cliente e resumo", async ({ page }) => {
    await page.goto("/design/pedidos");
    const linhas = page.locator('[data-slot="pedido-linha"]');
    await expect(linhas).toHaveCount(3);
    await expect(linhas.nth(0)).toContainText("Ana Paula");
    await expect(linhas.nth(0)).toContainText("Pediu o valor da troca da lente");
    await expect(linhas.nth(0)).toContainText("1 de 2 nesta conversa");
    await expect(linhas.nth(1)).toContainText("2 de 2 nesta conversa");
    // Sem nome, o telefone formatado.
    await expect(linhas.nth(2)).toContainText("+55 (11) 95555-4444");
    // Acima de 2h a espera fica âmbar; abaixo, não.
    await expect(linhas.nth(0).locator('[data-slot="pedido-espera"]')).toHaveAttribute("data-longa", "sim");
    await expect(linhas.nth(2).locator('[data-slot="pedido-espera"]')).not.toHaveAttribute("data-longa", "sim");
  });

  test("abrir a linha mostra as últimas mensagens e a caixa com as três saídas", async ({ page }) => {
    await page.goto("/design/pedidos");
    const primeira = page.locator('[data-slot="pedido-linha"]').first();
    await primeira.getByRole("button").first().click();
    const detalhe = primeira.locator('[data-slot="pedido-detalhe"]');
    await expect(detalhe).toBeVisible();
    await expect(detalhe.locator('[data-slot="pedido-contexto"] [data-autor="cliente"]').first()).toContainText(
      "quanto fica a troca da lente"
    );
    // A MESMA caixa da conversa: abre em orientar e tem o Resolvido.
    await expect(detalhe.locator('[data-slot="pedido-caixa"]')).toBeVisible();
    await expect(detalhe.getByRole("button", { name: "Resolvido" })).toBeVisible();
    await expect(detalhe.getByRole("link", { name: "Abrir conversa" })).toHaveAttribute(
      "href",
      "/inbox/5511912345678"
    );
    // Uma aberta por vez.
    await page.locator('[data-slot="pedido-linha"]').nth(2).getByRole("button").first().click();
    await expect(page.locator('[data-slot="pedido-detalhe"]')).toHaveCount(1);
  });

  test("o link do aviso abre a linha certa", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=2");
    await expect(page.locator('[data-pedido="2"] [data-slot="pedido-detalhe"]')).toBeVisible();
    await expect(page.locator('[data-slot="pedido-detalhe"]')).toHaveCount(1);
  });

  test("Resolvido tira o pedido da lista e diz o que aconteceu", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=1");
    await page.locator('[data-pedido="1"]').getByRole("button", { name: "Resolvido" }).click();
    await expect(page.locator('[data-slot="pedidos-resultado"]')).toHaveText("Marcado como resolvido.");
    await expect(page.locator('[data-slot="pedido-linha"]')).toHaveCount(2);
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
