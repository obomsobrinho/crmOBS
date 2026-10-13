import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SOLUCOES, rotuloDaSolucao, solucaoDoBanco } from "../lib/solucoes";
import {
  HISTORIA_VAZIA,
  encaixarNaHistoria,
  montarSecoes,
  recorteAntes,
  recorteDepois,
  recorteDurante,
  type LinhaHistoria,
} from "../lib/historia-do-pedido";
import { atualizacaoDoPedido, entraNaFila, mesmoAssunto } from "../lib/fila-de-pedidos";
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
  solucao: null,
  atualizado_em: null,
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

  test("resolvidos: do mais recente para o mais antigo, com solução e orientação", () => {
    const r = montarResolvidos(
      [
        { id: 5, phone: "5511912345678", opened_at: "2026-09-20T10:00:00Z", summary: "a", instruction: null, closed_at: "2026-09-20T11:00:00Z", solucao: "time_resolveu", closed_by: "u1" },
        { id: 6, phone: "5511955554444", opened_at: "2026-09-21T10:00:00Z", summary: "b", instruction: " Diga que sim ", closed_at: "2026-09-21T12:00:00Z", solucao: "orientou_ia", closed_by: null },
      ],
      contatos,
      null
    );
    expect(r.map((p) => p.id)).toEqual([6, 5]);
    expect(r[0]).toMatchObject({ solucao: "orientou_ia", orientacao: "Diga que sim", nome: null });
    expect(r[1]).toMatchObject({ solucao: "time_resolveu", orientacao: null, nome: "Ana", porQuem: "u1" });
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
      linhaBanco({ closed_at: "2026-09-29T11:00:00Z", solucao: "orientou_ia", instruction: " ok ", posicao: null, total: null })
    ) as PedidoResolvido;
    expect(r).toMatchObject({ solucao: "orientou_ia", orientacao: "ok", nome: null, closedAt: "2026-09-29T11:00:00Z" });
    // Valor fora da lista de lib/solucoes.ts nunca vira solução.
    expect(paraPedido(linhaBanco({ closed_at: "2026-09-29T11:00:00Z", solucao: "ia", posicao: null, total: null }))).toMatchObject({ solucao: null });
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
      paraPedido(linhaBanco({ id, closed_at: em, solucao: "time_resolveu", posicao: null, total: null }));
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
    // A caixa de orientar fica EMBAIXO das seções: espera elas carregarem, senão o botão desce no meio do clique.
    await expect(detalhe(page).locator('[data-slot="pedido-secoes-carregando"]')).toHaveCount(0);
    await detalhe(page).getByRole("button", { name: "Resolvido" }).click();
    await expect(page.locator('[data-slot="pedidos-resultado"]')).toHaveText("Marcado como resolvido.");
    await expect(linhas(page)).toHaveCount(2);
    await page.getByRole("tab", { name: "Resolvidos" }).click();
    await expect(linhas(page)).toHaveCount(4);
    await expect(linhas(page).first()).toContainText("troca da lente");
    // A solução que a rota grava, no selo da linha.
    await expect(linhas(page).first().locator('[data-solucao="time_resolveu"]')).toHaveText("Time resolveu");
  });

  test("orientar pela ficha resolve, e o histórico guarda a orientação", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=3");
    // A caixa de orientar fica EMBAIXO das seções: espera elas carregarem, senão o botão desce no meio do clique.
    await expect(detalhe(page).locator('[data-slot="pedido-secoes-carregando"]')).toHaveCount(0);
    await detalhe(page).getByRole("textbox", { name: "Orientação para a IA" }).fill("Diga que parcela em até 6 vezes.");
    await detalhe(page).getByRole("button", { name: "Orientar a IA" }).click();
    await expect(page.locator('[data-slot="pedidos-resultado"]')).toContainText("Orientado.");
    await page.getByRole("tab", { name: "Resolvidos" }).click();
    await linhas(page).first().click();
    await expect(detalhe(page).locator('[data-slot="pedido-solucao"]')).toHaveText("Orientou IA");
    await expect(linhas(page).first().locator('[data-solucao="orientou_ia"]')).toHaveText("Orientou IA");
    await expect(detalhe(page).locator('[data-slot="pedido-orientacao"]')).toHaveText("Diga que parcela em até 6 vezes.");
    // Resolvido é histórico: não tem ação.
    await expect(detalhe(page).locator('[data-slot="pedido-acoes"]')).toHaveCount(0);
  });

  test("resolvidos mostram quem resolveu e a busca recorta a lista", async ({ page }) => {
    await page.goto("/design/pedidos");
    await page.getByRole("tab", { name: "Resolvidos" }).click();
    await expect(linhas(page)).toHaveCount(3);
    await linhas(page).nth(2).click();
    await expect(detalhe(page).locator('[data-slot="pedido-solucao"]')).toHaveText("Time resolveu");
    await expect(detalhe(page).locator('[data-slot="pedido-fatos"]')).toContainText("por franck");
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

// ---------------------------------------------------------------------------
// REDESENHO DE PEDIDOS (08/10/2026): a solução gravada (lib/solucoes.ts), a
// as seções do pedido com as mensagens reais (lib/historia-do-pedido.ts) e o
// layout com a lista estreita.
// ---------------------------------------------------------------------------

test.describe("Solução do pedido (lib/solucoes.ts)", () => {
  test("três chaves, três rótulos do dono, e nada fora da lista", () => {
    expect(SOLUCOES.map((s) => s.chave)).toEqual(["orientou_ia", "time_resolveu", "time_assumiu"]);
    expect(rotuloDaSolucao("orientou_ia")).toBe("Orientou IA");
    expect(rotuloDaSolucao("time_resolveu")).toBe("Time resolveu");
    expect(rotuloDaSolucao("time_assumiu")).toBe("Time assumiu");
    // Os valores antigos de closed_how nunca passam por solução.
    expect(solucaoDoBanco("ia")).toBeNull();
    expect(solucaoDoBanco("resolvido")).toBeNull();
    expect(rotuloDaSolucao(null)).toBeNull();
  });

  test("a migração tem o mesmo check e o mesmo mapa do histórico", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261008233757_solucao_do_pedido.sql"), "utf8");
    for (const s of SOLUCOES) expect(sql).toContain(`'${s.chave}'`);
    expect(sql).toMatch(/when 'ia' then 'orientou_ia'/);
    expect(sql).toMatch(/when 'resolvido' then 'time_resolveu'/);
  });
});

test.describe("Seções do pedido (lib/historia-do-pedido.ts)", () => {
  const H = 3_600_000;
  const base = Date.parse("2026-10-08T15:00:00Z");
  const iso = (ms: number) => new Date(base + ms).toISOString();
  let seq = 0;
  const l = (ms: number, o: Partial<LinhaHistoria>): LinhaHistoria => ({
    id: ++seq,
    user_message: null,
    bot_message: null,
    message_type: null,
    media_type: null,
    media_url: null,
    created_at: iso(ms),
    ...o,
  });
  const vazia = HISTORIA_VAZIA;

  test("antes: só o cliente, as 5 últimas da janela de 12h, na ordem", () => {
    const linhas = [
      l(-13 * H, { user_message: "velha demais" }),
      ...[1, 2, 3, 4, 5, 6].map((i) => l(-10 * 60_000 + i * 1000, { user_message: `m${i}` })),
      l(-60_000, { bot_message: "resposta da IA" }),
      l(-30_000, { bot_message: "do time", message_type: "manual", media_url: "x.jpg" }),
      l(1000, { user_message: "depois da abertura" }),
    ];
    const antes = recorteAntes(linhas, { openedAt: iso(0) });
    expect(antes.map((x) => x.user_message)).toEqual(["m2", "m3", "m4", "m5", "m6"]);
  });

  test("durante: o cliente entre a abertura e o fechamento, as 10 mais novas, e se cortou", () => {
    const linhas = [
      l(-1000, { user_message: "antes" }),
      ...Array.from({ length: 12 }, (_, i) => l((i + 1) * 60_000, { user_message: `d${i + 1}` })),
      l(13 * 60_000, { bot_message: "resposta" }),
      l(2 * H, { user_message: "depois de fechar" }),
    ];
    const fechado = recorteDurante(linhas, { openedAt: iso(0), closedAt: iso(H) });
    expect(fechado.durante.map((x) => x.user_message)).toEqual(
      Array.from({ length: 10 }, (_, i) => `d${i + 3}`)
    );
    expect(fechado.duranteCortado).toBe(true);
    // Aberto: sem fim, a mensagem de agora entra.
    const aberto = recorteDurante(linhas.slice(-2), { openedAt: iso(0), closedAt: null });
    expect(aberto).toEqual({ durante: [expect.objectContaining({ user_message: "depois de fechar" })], duranteCortado: false });
  });

  test("depois: só respostas, e o cliente não come o limite; aberto só tem o time", () => {
    const fechado = { openedAt: iso(0), closedAt: iso(H) };
    const linhas = [
      ...Array.from({ length: 7 }, (_, i) => l(H + (i + 1) * 1000, { user_message: `c${i}` })),
      l(3 * H, { bot_message: "Resposta do time, 2h depois", message_type: "manual" }),
      l(3 * H + 1000, { bot_message: "Da IA. | Em duas partes." }),
    ];
    expect(recorteDepois(linhas, fechado).map((x) => x.bot_message)).toEqual([
      "Resposta do time, 2h depois",
      "Da IA. | Em duas partes.",
    ]);
    const aberto = { openedAt: iso(0), closedAt: null };
    expect(recorteDepois(linhas, aberto).map((x) => x.bot_message)).toEqual(["Resposta do time, 2h depois"]);
  });

  test("durante: mídia do time (manual) não ocupa vaga do cliente", () => {
    const p = { openedAt: iso(0), closedAt: null };
    const linhas = [
      ...Array.from({ length: 10 }, (_, i) => l((i + 1) * 1000, { user_message: `d${i}` })),
      ...Array.from({ length: 3 }, (_, i) => l(20_000 + i, { media_url: "f.jpg", message_type: "manual" })),
    ];
    expect(recorteDurante(linhas, p)).toMatchObject({ duranteCortado: false });
    expect(recorteDurante(linhas, p).durante).toHaveLength(10);
    const mais = [...linhas, l(30_000, { user_message: "d10" })];
    expect(recorteDurante(mais, p).duranteCortado).toBe(true);
  });

  test("cliente verbatim com mídia; durante separado; a IA em partes", () => {
    const s = montarSecoes({
      ...vazia,
      antes: [
        l(-60_000, { user_message: "Quanto custa?" }),
        l(-30_000, { media_type: "audio", media_url: "a.ogg", user_message: "transcrição" }),
        l(-20_000, { media_type: "image", media_url: "f.jpg" }),
      ],
      durante: [l(H, { user_message: "Preciso até sexta" })],
      depois: [l(H + 5000, { bot_message: "Custa R$ 100. | Posso ajudar em algo mais?" })],
    });
    expect(s.cliente.map((m) => [m.texto, m.midia])).toEqual([
      ["Quanto custa?", null],
      ["transcrição", "Áudio"],
      ["", "Imagem"],
    ]);
    expect(s.durante.map((m) => m.texto)).toEqual(["Preciso até sexta"]);
    expect(s.respostas).toHaveLength(1);
    expect(s.respostas[0].quem).toBe("ia");
    expect(s.respostas[0].mensagens.map((m) => m.texto)).toEqual(["Custa R$ 100.", "Posso ajudar em algo mais?"]);
  });

  test("quem mandou sai de lib/mensagem.ts: manual e importado são time, o resto é IA", () => {
    const s = montarSecoes({
      ...vazia,
      depois: [
        l(H - 20_000, { bot_message: "Oi, aqui é o time", message_type: "manual" }),
        l(H + 1000, { bot_message: "histórico", message_type: "imported" }),
        l(H + 2000, { bot_message: "resposta automática" }),
      ],
    });
    expect(s.respostas.map((r) => [r.quem, r.mensagens.length])).toEqual([
      ["time", 2],
      ["ia", 1],
    ]);
  });

  test("o realtime encaixa a linha: cliente na espera entra no durante; fora das janelas, nada", () => {
    const p = { openedAt: iso(0), closedAt: null };
    const h1 = encaixarNaHistoria(vazia, l(1000, { user_message: "oi de novo" }), p);
    expect(h1.durante).toHaveLength(1);
    // Mensagem do cliente não é resposta: não ocupa vaga no "depois".
    expect(h1.depois).toHaveLength(0);
    // Aberto: a IA não entra no "depois" (ninguém respondeu ainda); o time, sim.
    expect(encaixarNaHistoria(h1, l(2000, { bot_message: "vou confirmar" }), p)).toBe(h1);
    expect(encaixarNaHistoria(h1, l(3000, { bot_message: "oi, é o time", message_type: "manual" }), p).depois).toHaveLength(1);
    expect(encaixarNaHistoria(h1, l(-1000, { user_message: "antes" }), p)).toBe(h1);
    // Pedido fechado: mensagem depois do fechamento não entra no durante.
    const fechado = { openedAt: iso(0), closedAt: iso(H) };
    expect(encaixarNaHistoria(vazia, l(2 * H, { user_message: "tarde" }), fechado).durante).toHaveLength(0);
    // Passou de 10: fica com as mais novas e marca o corte.
    let h = vazia;
    for (let i = 1; i <= 11; i++) h = encaixarNaHistoria(h, l(i * 1000, { user_message: `x${i}` }), p);
    expect(h.durante.map((x) => x.user_message)[0]).toBe("x2");
    expect(h.duranteCortado).toBe(true);
    expect(recorteDepois([l(25 * H, { user_message: "longe" })], p)).toHaveLength(0);
  });
});

test.describe("Pedido em aberto atualizado pelo cliente (lib/fila-de-pedidos.ts)", () => {
  const prazo = { id: 1, summary: "Cliente quer saber o prazo de entrega do pedido", motivo: null };
  const garantia = { id: 2, summary: "Cliente pediu a garantia da armação", motivo: "pessoa" };
  // O modelo diz qual pedido (`pedido_aberto`, o número na lista) e se é novidade.
  const base = {
    retomada: false,
    action: "pausar",
    guardrailBarrou: false,
    entraNaFila: false,
    summary: "Cliente quer saber o prazo de entrega e precisa até sexta",
    motivo: "falta_info",
    pedidoAberto: 1,
    informacaoNova: true,
    abertos: [prazo],
  };

  test("informação nova num pedido aberto: reescreve o resumo e preenche o motivo que faltava", () => {
    expect(atualizacaoDoPedido(base)).toEqual({
      tipo: "atualizar",
      id: 1,
      summary: "Cliente quer saber o prazo de entrega e precisa até sexta",
      motivo: "falta_info",
    });
  });

  test("motivo que o pedido já tinha não muda", () => {
    const r = atualizacaoDoPedido({ ...base, abertos: [{ ...prazo, motivo: "preco" }] });
    expect(r).toMatchObject({ tipo: "atualizar", motivo: null });
  });

  test("o alvo é o número que o modelo deu, na ordem da lista", () => {
    expect(atualizacaoDoPedido({ ...base, abertos: [garantia, prazo], pedidoAberto: 2 })).toMatchObject({
      tipo: "atualizar",
      id: 1,
    });
    expect(atualizacaoDoPedido({ ...base, abertos: [garantia, prazo], pedidoAberto: 1 })).toMatchObject({
      tipo: "atualizar",
      id: 2,
    });
  });

  test("não atualiza: sem informação nova, número fora da lista, retomada, ação, guardrail, fila, nada novo", () => {
    const nenhuma = { tipo: "nenhuma" };
    // Agradecer, insistir ou repetir: o modelo diz informacao_nova = false.
    expect(atualizacaoDoPedido({ ...base, informacaoNova: false })).toEqual(nenhuma);
    expect(atualizacaoDoPedido({ ...base, pedidoAberto: 0 })).toEqual(nenhuma);
    expect(atualizacaoDoPedido({ ...base, pedidoAberto: 2 })).toEqual(nenhuma);
    expect(atualizacaoDoPedido({ ...base, pedidoAberto: 1.5 })).toEqual(nenhuma);
    expect(atualizacaoDoPedido({ ...base, retomada: true })).toEqual(nenhuma);
    expect(atualizacaoDoPedido({ ...base, action: "none" })).toEqual(nenhuma);
    expect(atualizacaoDoPedido({ ...base, action: "agendar" })).toEqual(nenhuma);
    expect(atualizacaoDoPedido({ ...base, guardrailBarrou: true })).toEqual(nenhuma);
    expect(atualizacaoDoPedido({ ...base, entraNaFila: true })).toEqual(nenhuma);
    expect(atualizacaoDoPedido({ ...base, abertos: [] })).toEqual(nenhuma);
    expect(atualizacaoDoPedido({ ...base, summary: "  " })).toEqual(nenhuma);
    expect(atualizacaoDoPedido({ ...base, summary: "cliente quer saber o PRAZO de entrega do pedido " })).toEqual(nenhuma);
  });

  test("fila: o pedido apontado pelo modelo com informação nova é atualização, mesmo sem palavra em comum", () => {
    const fila = {
      retomada: false,
      action: "pausar",
      guardrailBarrou: false,
      semPedido: false,
      pedidoNovo: false,
      // Reescrito sem nenhuma palavra de assunto do pedido velho: a rede sozinha abriria pedido novo.
      summary: "Precisa até sexta",
      abertos: [prazo],
      pedidoAberto: 1,
      informacaoNova: true,
      listaDoModelo: [prazo],
    };
    expect(mesmoAssunto(fila.summary, prazo.summary)).toBe(false);
    expect(entraNaFila(fila)).toBe(false);
    expect(atualizacaoDoPedido({ ...base, summary: fila.summary, entraNaFila: entraNaFila(fila) })).toMatchObject({
      tipo: "atualizar",
      id: 1,
    });
    // Fora da exceção, a rede é a de sempre.
    expect(entraNaFila({ ...fila, informacaoNova: false })).toBe(true);
    expect(entraNaFila({ ...fila, pedidoAberto: 0 })).toBe(true);
    expect(entraNaFila({ ...fila, pedidoAberto: 2 })).toBe(true);
    expect(entraNaFila({ ...fila, pedidoNovo: true })).toBe(true);
    expect(entraNaFila({ ...fila, informacaoNova: false, summary: "Prazo de entrega até sexta" })).toBe(false);
    expect(entraNaFila({ ...fila, informacaoNova: false, guardrailBarrou: true })).toBe(false);
    expect(entraNaFila({ ...fila, semPedido: true })).toBe(true);
    expect(entraNaFila({ ...fila, retomada: true, semPedido: true })).toBe(false);
    expect(entraNaFila({ ...fila, action: "agendar", semPedido: true })).toBe(false);
  });

  test("a rede mesmoAssunto continua a mesma (só decide a fila)", () => {
    expect(mesmoAssunto("Cliente quer o prazo de entrega", "prazo para entregar")).toBe(true);
    expect(mesmoAssunto("Cliente quer orçamento do site", "Nota fiscal em aberto")).toBe(false);
    expect(mesmoAssunto("Cliente quer falar com alguém", "qualquer assunto")).toBe(true);
  });
});

test.describe("Página de pedidos redesenhada (/design/pedidos)", () => {
  const linhas = (page: import("@playwright/test").Page) => page.locator('[data-slot="pedido-linha"]');
  const detalhe = (page: import("@playwright/test").Page) => page.locator('[data-slot="pedido-detalhe"]');
  const secoes = (page: import("@playwright/test").Page) =>
    detalhe(page)
      .locator('[data-slot="pedido-secoes"] section')
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-slot")));
  /** As seções e a caixa de orientar empilhadas: mesmo x, mesma largura, cada uma abaixo da anterior. */
  async function empilhadas(page: import("@playwright/test").Page, slots: string[]) {
    const caixas = [];
    for (const s of slots) caixas.push((await detalhe(page).locator(`[data-slot="${s}"]`).boundingBox())!);
    for (let i = 1; i < caixas.length; i++) {
      expect(Math.abs(caixas[i].x - caixas[0].x)).toBeLessThan(2);
      expect(Math.abs(caixas[i].width - caixas[0].width)).toBeLessThan(2);
      expect(caixas[i].y).toBeGreaterThanOrEqual(caixas[i - 1].y + caixas[i - 1].height);
    }
  }

  test("a lista é estreita e o detalhe fica com o resto; filtro ao lado da busca", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/design/pedidos?abrir=1");
    const lista = await page.locator('[data-slot="pedidos-coluna-lista"]').boundingBox();
    const det = await page.locator('[data-slot="pedidos-coluna-detalhe"]').boundingBox();
    expect(lista!.width).toBeLessThanOrEqual(400);
    expect(det!.width).toBeGreaterThan(lista!.width * 2);
    const busca = await page.getByLabel("Buscar pedidos").boundingBox();
    const filtro = await page.getByLabel("Filtrar por motivo").boundingBox();
    // Mesma linha: o filtro à direita da busca, com o meio na mesma altura.
    expect(filtro!.x).toBeGreaterThan(busca!.x);
    expect(Math.abs(filtro!.y + filtro!.height / 2 - (busca!.y + busca!.height / 2))).toBeLessThan(6);
  });

  test("na coluna de 340px a busca e o filtro se leem inteiros", async ({ page }) => {
    // Abaixo de `xl` (1280) a coluna da lista tem 340px.
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto("/design/pedidos");
    expect((await page.locator('[data-slot="pedidos-coluna-lista"]').boundingBox())!.width).toBeLessThanOrEqual(345);
    // O texto de exemplo cabe na largura do campo (mede com a fonte de verdade).
    const cabe = await page.getByLabel("Buscar pedidos").evaluate((el) => {
      const i = el as HTMLInputElement;
      const cs = getComputedStyle(i);
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const livre = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return ctx.measureText(i.placeholder).width <= livre;
    });
    expect(cabe).toBe(true);
    const valor = page.getByLabel("Filtrar por motivo").locator('[data-slot="select-value"]');
    await expect(valor).toHaveText("Motivo");
    expect(await valor.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  });

  test("o resumo vem rotulado como da IA, e embaixo a mensagem REAL do cliente", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=1");
    const d = detalhe(page);
    await expect(d.getByText("Resumo da IA", { exact: true })).toBeVisible();
    await expect(d.locator('[data-slot="pedido-resumo"]')).toHaveText(
      "Pediu o valor da troca da lente com antirreflexo e precisa até sexta"
    );
    await expect(d.locator('[data-slot="pedido-mensagem-cliente"]')).toHaveText([
      "Oi, boa tarde",
      "Quanto fica a troca da lente com antirreflexo?",
      "E queria saber se a lente nova tem garantia também",
    ]);
    // A mídia recebida aparece pelo tipo (o áudio veio com a transcrição).
    await expect(d.locator('[data-mensagem="cliente"]').nth(2)).toContainText("Áudio");
    // Aberto: ninguém respondeu o pedido, então nada de "Resposta da IA" (a frase da
    // IA ao abrir não conta); o time respondeu pela conversa sem fechar.
    await expect(d.locator('[data-slot="pedido-resposta-time"]')).toContainText("no feriado abrimos");
    expect(await secoes(page)).toEqual(["pedido-cliente", "pedido-resposta-time"]);
    await expect(d.locator('[data-slot="pedido-resposta-ia"]')).toHaveCount(0);
    await expect(d.locator('[data-slot="pedido-secoes"]')).not.toContainText("Preço ou orçamento");
    await expect(d.locator('[data-slot="pedido-fatos"]')).toContainText("Preço ou orçamento");
    // Nada de balão de conversa.
    await expect(d.locator("[data-autor]")).toHaveCount(0);
  });

  test("o que o cliente mandou ENQUANTO o pedido esperava, depois de um divisor", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=1");
    const d = detalhe(page);
    await expect(d.locator('[data-slot="pedido-depois-do-pedido"]')).toHaveText("depois do pedido");
    await expect(d.locator('[data-slot="pedido-mensagem-durante"]')).toHaveText([
      "Preciso até sexta, tá?",
      "A loja abre no feriado de segunda?",
    ]);
    // A imagem do período aparece pelo tipo, na ordem.
    await expect(d.locator('[data-mensagem="cliente"]').last()).toContainText("Imagem");
    // O divisor fica DEPOIS das mensagens que levaram ao pedido.
    const ultimaAntes = (await d.locator('[data-slot="pedido-mensagem-cliente"]').last().boundingBox())!;
    const divisor = (await d.locator('[data-slot="pedido-depois-do-pedido"]').boundingBox())!;
    expect(divisor.y).toBeGreaterThan(ultimaAntes.y);
    await expect(d.locator('[data-slot="pedido-durante-cortado"]')).toHaveCount(0);
  });

  test("pedido atualizado pelo cliente: a faixa diz quando", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=1");
    await expect(detalhe(page).locator('[data-slot="pedido-atualizado"]')).toHaveText(/^atualizado às \d{2}:\d{2}$/);
    await page.goto("/design/pedidos?abrir=2");
    await expect(detalhe(page).locator('[data-slot="pedido-atualizado"]')).toHaveCount(0);
  });

  test("uma coluna só em qualquer tela: seções em ordem e Orientar a IA embaixo", async ({ page }) => {
    for (const largura of [1440, 1024]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/design/pedidos?abrir=1");
      await expect(detalhe(page).locator('[data-slot="pedido-resposta-time"]')).toBeVisible();
      await empilhadas(page, ["pedido-cliente", "pedido-resposta-time", "pedido-acoes"]);
    }
  });

  test("sem mensagem do cliente: uma linha neutra dentro da seção, e nada mais vazio", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=3");
    const d = detalhe(page);
    await expect(d.locator('[data-slot="pedido-sem-mensagens"]')).toHaveText(
      "Nenhuma mensagem do cliente encontrada antes do pedido."
    );
    // Aberto e sem resposta do time: só a seção do cliente.
    expect(await secoes(page)).toEqual(["pedido-cliente"]);
  });

  test("mídia sem texto mostra só o tipo", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=2");
    await expect(detalhe(page).locator('[data-mensagem="cliente"]').last()).toContainText("Imagem");
  });

  test("Orientou IA: cliente, orientação e resposta da IA, empilhados", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/design/pedidos?abrir=7");
    const d = detalhe(page);
    await expect(d.locator('[data-slot="pedido-mensagem-cliente"]')).toHaveText(["Vocês entregam no sábado?"]);
    await expect(d.locator('[data-slot="pedido-orientacao"]')).toContainText("até as 13h");
    expect(await secoes(page)).toEqual(["pedido-cliente", "pedido-orientacao-secao", "pedido-resposta-ia"]);
    await expect(d.locator('[data-slot="pedido-resposta-ia"] [data-slot="pedido-resposta"]').first()).toContainText(
      "Entregamos sim"
    );
    await expect(d.locator('[data-slot="pedido-solucao"]')).toHaveText("Orientou IA");
    await empilhadas(page, ["pedido-cliente", "pedido-orientacao-secao", "pedido-resposta-ia"]);
    await expect(d.locator('[data-slot="pedido-acoes"]')).toHaveCount(0);
  });

  test("Time assumiu: resposta do time, e o selo com ícone na lista e no detalhe", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=8");
    const d = detalhe(page);
    await expect(d.locator('[data-slot="pedido-resposta-time"]')).toContainText("Pode trazer na loja");
    expect(await secoes(page)).toEqual(["pedido-cliente", "pedido-resposta-time"]);
    await expect(d.locator('[data-slot="pedido-solucao"]')).toHaveText("Time assumiu");
    const selo = linhas(page).filter({ hasText: "Beatriz Lima" }).locator('[data-solucao="time_assumiu"]');
    await expect(selo).toHaveText("Time assumiu");
    await expect(selo.locator("svg")).toHaveCount(1);
    // Tom da marca, nunca verde/âmbar/vermelho (que são estado).
    await expect(selo).toHaveClass(/bg-brand-surface/);
    await expect(selo).not.toHaveClass(/human|warn|danger/);
  });

  test("cada solução tem um ícone diferente", async ({ page }) => {
    await page.goto("/design/pedidos");
    await page.getByRole("tab", { name: "Resolvidos" }).click();
    await expect(linhas(page)).toHaveCount(3);
    const icones = await page
      .locator('[data-slot="pedido-linha"] [data-solucao] svg')
      .evaluateAll((els) => els.map((e) => e.getAttribute("class") ?? ""));
    expect(icones).toHaveLength(3);
    expect(new Set(icones).size).toBe(3);
  });

  test("o rótulo é Solução, nunca Como, e sem travessão", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=8");
    const texto = await detalhe(page).innerText();
    expect(texto).toMatch(/Solução/i);
    expect(texto).not.toMatch(/\bComo\b/);
    expect(texto).not.toMatch(/[—–]/);
  });
});
