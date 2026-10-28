import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { SEM_PEDIDOS, textoDosPedidosAbertos } from "../lib/admin-alertas";
import {
  consultaDoCursor,
  cursorDaConsulta,
  ordenarPedidos,
  pedidosDasLinhas,
  REPETIDO_A_PARTIR_DE,
  resumoDosPedidos,
  textoDaContagem,
  type LinhaDoPedidoDaCentral,
  type PedidoDaCentral,
} from "../lib/admin-pedidos";

// CENTRAL: PEDIDOS DE AJUDA ABERTOS POR CLIENTE (27/10/2026, dono). Um ícone ao
// lado do nome quando a empresa tem pedido de ajuda (`handoffs`) sem fechar, com
// quantos e há quanto tempo o mais antigo espera. Regra: UM aberto já mostra.
// A regra é pura (lib/admin-alertas.ts); a tela roda no preview /design/clientes,
// com dados falsos (Barbearia do Zé: 12 e 5 dias; Ateliê Lumière: 1 e 3 horas).
// A contagem de verdade é `admin_pedidos_abertos` (SQL, uma chamada por página).
//
// E o bloco "Pedidos em aberto" do detalhe (27/10/2026, dono): TODOS os abertos, do
// mais antigo ao mais novo, sem período, 10 por vez, abrindo por um resumo e pelos
// motivos que se repetem ("pode virar regra"); o ícone da lista leva até ele.
// A lista de verdade é `admin_pedidos_do_cliente` (keyset por opened_at e id).

const AGORA = Date.parse("2026-10-27T15:00:00Z");
const ha = (ms: number) => new Date(AGORA - ms).toISOString();
const H = 3_600_000;

test.describe("Regra do ícone de pedidos abertos (lib/admin-alertas.ts)", () => {
  test("nenhum aberto: sem ícone; um já mostra", () => {
    expect(textoDosPedidosAbertos(SEM_PEDIDOS, AGORA)).toBeNull();
    expect(textoDosPedidosAbertos({ abertos: 0, maisAntigo: ha(H) }, AGORA)).toBeNull();
    expect(textoDosPedidosAbertos({ abertos: 1, maisAntigo: ha(3 * H) }, AGORA)).toBe(
      "1 pedido de ajuda aberto há 3 horas"
    );
  });

  test("vários: quantos e há quanto tempo o mais antigo espera", () => {
    expect(textoDosPedidosAbertos({ abertos: 7, maisAntigo: ha(5 * 24 * H + 2 * H) }, AGORA)).toBe(
      "7 pedidos de ajuda abertos · o mais antigo há 5 dias"
    );
    expect(textoDosPedidosAbertos({ abertos: 2, maisAntigo: ha(24 * H) }, AGORA)).toBe(
      "2 pedidos de ajuda abertos · o mais antigo há 1 dia"
    );
    expect(textoDosPedidosAbertos({ abertos: 2, maisAntigo: ha(H) }, AGORA)).toBe(
      "2 pedidos de ajuda abertos · o mais antigo há 1 hora"
    );
    expect(textoDosPedidosAbertos({ abertos: 3, maisAntigo: ha(10 * 60_000) }, AGORA)).toBe(
      "3 pedidos de ajuda abertos · o mais antigo há menos de 1 hora"
    );
    // Sem data (não deveria acontecer): só a contagem, nunca uma idade inventada.
    expect(textoDosPedidosAbertos({ abertos: 4, maisAntigo: null }, AGORA)).toBe("4 pedidos de ajuda abertos");
  });
});

test.describe("Ícone na lista da central (/design/clientes)", () => {
  test("aparece só em quem tem pedido aberto, e o balão diz o quê", async ({ page }) => {
    await page.goto("/design/clientes");
    const icones = page.locator('[data-slot="central-pedidos"]');
    await expect(icones).toHaveCount(2);

    const barbearia = page.locator('[data-slot="central-cliente"]', { hasText: "Barbearia do Zé" });
    const icone = barbearia.locator('[data-slot="central-pedidos"]');
    await expect(icone).toHaveAttribute("aria-label", "12 pedidos de ajuda abertos · o mais antigo há 5 dias");
    await icone.scrollIntoViewIfNeeded();
    // A lista chega no HTML do servidor antes da hidratação: um hover cedo demais
    // não abre o balão (o Radix ainda não ouve). Repete o gesto até abrir.
    await expect(async () => {
      await page.mouse.move(0, 0);
      await icone.hover();
      await expect(page.locator('[data-slot="tooltip-content"]')).toContainText(
        "12 pedidos de ajuda abertos · o mais antigo há 5 dias",
        { timeout: 1500 }
      );
    }).toPass({ timeout: 15_000 });

    // Quem não tem pedido aberto não tem ícone.
    const semPedido = page.locator('[data-slot="central-cliente"]', { hasText: "Cliente de exemplo 01" });
    await expect(semPedido.locator('[data-slot="central-pedidos"]')).toHaveCount(0);
  });
});

const linhaDePedido = (o: Partial<LinhaDoPedidoDaCentral>): LinhaDoPedidoDaCentral => ({
  id: 1,
  phone: "5511912345678",
  opened_at: "2026-10-22T23:58:21Z",
  motivo: "preco",
  summary: "  Quer o preço.  ",
  nomewpp: "Maria",
  display_name: null,
  ...o,
});

test.describe("Regra do bloco Pedidos em aberto (lib/admin-pedidos.ts)", () => {
  test("a linha vira o pedido: nome pelo contato, resumo limpo, motivo como veio", () => {
    const [p] = pedidosDasLinhas([linhaDePedido({})]);
    expect(p).toEqual({
      id: 1,
      phone: "5511912345678",
      abertoEm: "2026-10-22T23:58:21Z",
      motivo: "preco",
      resumo: "Quer o preço.",
      nome: "Maria",
    });
    // O nome que o time deu vence o do WhatsApp; "Você" não é nome; resumo vazio é nulo.
    const [q] = pedidosDasLinhas([linhaDePedido({ display_name: "Maria Silva", summary: " " })]);
    expect(q.nome).toBe("Maria Silva");
    expect(q.resumo).toBeNull();
    const [r] = pedidosDasLinhas([linhaDePedido({ nomewpp: "Você" })]);
    expect(r.nome).toBeNull();
  });

  test("resumo: total, o mais antigo e os motivos do maior para o menor", () => {
    const r = resumoDosPedidos([
      { motivo: "pessoa", abertos: 1, mais_antigo: "2026-10-27T17:04:55Z" },
      { motivo: "urgencia", abertos: 2, mais_antigo: "2026-10-26T14:32:14Z" },
      { motivo: "falta_info", abertos: 6, mais_antigo: "2026-10-22T23:58:21Z" },
    ]);
    expect(r.total).toBe(9);
    expect(r.maisAntigo).toBe("2026-10-22T23:58:21Z");
    expect(r.porMotivo.map((m) => [m.rotulo, m.abertos, m.podeVirarRegra])).toEqual([
      ["Falta informação", 6, true],
      ["Urgência", 2, true],
      ["Pediu uma pessoa", 1, false],
    ]);
  });

  test("repetido = mais de um do mesmo motivo; 'Sem motivo' nunca vira regra; empate pelo mais antigo", () => {
    expect(REPETIDO_A_PARTIR_DE).toBe(2);
    const r = resumoDosPedidos([
      { motivo: null, abertos: 4, mais_antigo: "2026-10-01T10:00:00Z" },
      { motivo: "preco", abertos: 2, mais_antigo: "2026-10-20T10:00:00Z" },
      { motivo: "fechar", abertos: 2, mais_antigo: "2026-10-10T10:00:00Z" },
    ]);
    expect(r.porMotivo.map((m) => [m.motivo, m.podeVirarRegra])).toEqual([
      [null, false],
      ["fechar", true],
      ["preco", true],
    ]);
    expect(resumoDosPedidos([])).toEqual({ total: 0, maisAntigo: null, porMotivo: [] });
    expect(textoDaContagem(1)).toBe("1 pedido");
    expect(textoDaContagem(5)).toBe("5 pedidos");
  });

  test("o número de avisos sai no banco, nas duas leituras (lista e contagem por motivo)", () => {
    const sql = readFileSync("supabase/migrations/20261027183844_admin_pedidos_abertos.sql", "utf8");
    const fora = "and not (split_part(h.phone, '@', 1) = any (coalesce(p_fora, '{}')))";
    expect(sql.split(fora).length - 1).toBe(2);
  });

  test("do mais antigo ao mais novo; empate no instante decide pelo id", () => {
    const p = (id: number, abertoEm: string): PedidoDaCentral => ({ id, phone: "", abertoEm, motivo: null, resumo: null, nome: null });
    const ordem = ordenarPedidos([p(3, "2026-10-26T10:00:00Z"), p(2, "2026-10-22T10:00:00Z"), p(1, "2026-10-26T10:00:00Z")]);
    expect(ordem.map((x) => x.id)).toEqual([2, 1, 3]);
  });

  test("o cursor da rota vai e volta; malformado é 400, nunca 500", () => {
    const p: PedidoDaCentral = { id: 42, phone: "", abertoEm: "2026-10-22T23:58:21.407Z", motivo: null, resumo: null, nome: null };
    const q = new URLSearchParams(consultaDoCursor(p));
    expect(cursorDaConsulta(q.get("em"), q.get("id"))).toEqual({ em: "2026-10-22T23:58:21.407Z", id: 42 });
    expect(cursorDaConsulta(null, null)).toBeNull();
    expect(cursorDaConsulta("2026-10-22T23:58:21Z", null)).toBe("invalido");
    expect(cursorDaConsulta(null, "42")).toBe("invalido");
    expect(cursorDaConsulta("ontem", "42")).toBe("invalido");
    expect(cursorDaConsulta("2026-10-22T23:58:21Z", "-1")).toBe("invalido");
    expect(cursorDaConsulta("2026-10-22T23:58:21Z", "4.2")).toBe("invalido");
  });
});

const secao = (page: import("@playwright/test").Page) => page.locator('[data-bloco="atendimento-pedidos"]');
const alerta = (page: import("@playwright/test").Page) => page.locator('[data-slot="visao-alerta-pedidos"]');
const BARBEARIA = "/design/clientes/detalhe?cliente=00000000-0000-4000-8000-000000000001";
const SEM_PEDIDO = "/design/clientes/detalhe?cliente=00000000-0000-4000-8000-000000000002";

test.describe("Pedidos em aberto no detalhe (/design/clientes/detalhe)", () => {
  test("Visão geral: o aviso âmbar mora DENTRO do cartão Alertas, e Ver pedidos leva à seção do Atendimento", async ({ page }) => {
    await page.goto(BARBEARIA);
    const cartaoDeAlertas = page.locator('[data-bloco="visao-alertas"]');
    // Um lugar só para o que pede atenção (dono, 27/10/2026): nada de faixa solta acima dos cartões,
    // e o cartão não diz "Nada pede atenção agora" com pedido aberto.
    await expect(cartaoDeAlertas.locator('[data-slot="visao-alerta-pedidos"]')).toHaveCount(1);
    await expect(alerta(page)).toHaveCount(1);
    await expect(cartaoDeAlertas.locator('[data-slot="visao-sem-alertas"]')).toHaveCount(0);
    await expect(alerta(page)).toHaveAttribute("data-tom", "warn");
    await expect(alerta(page).locator('[data-slot="visao-alerta-pedidos-texto"]')).toHaveText(
      "12 pedidos de ajuda abertos · o mais antigo há 5 dias"
    );
    // A lista e os motivos NÃO moram na Visão geral.
    await expect(page.locator('[data-slot="central-aba-visao"] [data-bloco="atendimento-pedidos"]')).toHaveCount(0);

    await page.waitForLoadState("networkidle");
    await alerta(page).locator('[data-slot="visao-ver-pedidos"]').click();
    await expect(page.locator('[data-slot="central-aba-atendimento-gatilho"]')).toHaveAttribute("data-state", "active");
    await expect(secao(page)).toBeInViewport();
  });

  test("o ícone da lista abre o Atendimento na seção: resumo, repetidos e a lista do mais antigo, 10 por vez", async ({ page }) => {
    await page.goto("/design/clientes");
    const barbearia = page.locator('[data-slot="central-cliente"]', { hasText: "Barbearia do Zé" });
    // Só depois da hidratação o clique é do ícone (antes, o link da linha abriria a Visão geral).
    await page.waitForLoadState("networkidle");
    await barbearia.locator('[data-slot="central-pedidos"]').click();
    // A primeira navegação compila a página no servidor de desenvolvimento: pode passar dos 5 s padrão.
    await expect(page).toHaveURL(/\/design\/clientes\/detalhe\?cliente=[^#&]+&aba=atendimento#pedidos$/, {
      timeout: 20_000,
    });
    await expect(page.locator('[data-slot="central-aba-atendimento-gatilho"]')).toHaveAttribute("data-state", "active");
    await expect(secao(page)).toBeInViewport();

    // Logo abaixo de "Por que a IA chamou o time".
    const motivosDoPeriodo = await page.locator('[data-bloco="atendimento-motivos"]').boundingBox();
    const caixa = await secao(page).boundingBox();
    expect(caixa!.y).toBeGreaterThanOrEqual(motivosDoPeriodo!.y + motivosDoPeriodo!.height);

    // 1. O resumo: a MESMA frase do ícone da lista.
    await expect(secao(page).locator('[data-slot="atendimento-pedidos-resumo"]')).toHaveText(
      "12 pedidos de ajuda abertos · o mais antigo há 5 dias"
    );

    // 2. Por motivo, do maior para o menor; só os repetidos com motivo dizem "Pode virar regra".
    const motivos = secao(page).locator('[data-cartao-motivo]');
    await expect(motivos).toHaveCount(6);
    await expect(motivos.nth(0).locator('[data-slot="atendimento-motivo-rotulo"]')).toHaveText("Falta informação");
    await expect(motivos.nth(0).locator('[data-slot="atendimento-motivo-n"]')).toHaveText("5");
    await expect(motivos.nth(0)).toContainText("Pode virar regra");
    await expect(motivos.nth(1).locator('[data-slot="atendimento-motivo-rotulo"]')).toHaveText("Preço ou orçamento");
    await expect(motivos.nth(1).locator('[data-slot="atendimento-motivo-n"]')).toHaveText("3");
    await expect(motivos.nth(1)).toContainText("Pode virar regra");
    // O repetido é um cartão tingido (a variante da marca); os outros, o cartão comum.
    const fundo = (i: number) => motivos.nth(i).evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await fundo(0)).not.toBe(await fundo(2));
    await expect(secao(page).locator('[data-repetido="true"]')).toHaveCount(2);
    await expect(motivos.filter({ hasText: "Sem motivo" })).not.toContainText("Pode virar regra");

    // 3. A lista: o mais antigo em cima, com contato, motivo, idade e o resumo da IA.
    const itens = secao(page).locator('[data-slot="atendimento-pedido"]');
    await expect(itens).toHaveCount(10);
    await expect(itens.first().locator('[data-slot="atendimento-pedido-idade"]')).toHaveText("Aberto há 5 dias");
    await expect(itens.first()).toContainText("Rafael Souza");
    await expect(itens.first()).toContainText("Falta informação");
    await expect(itens.first().locator('[data-slot="atendimento-pedido-resumo"]')).toBeVisible();
    // Sem nome, o telefone.
    await expect(itens.nth(3).locator('[data-slot="atendimento-pedido-quem"]')).toHaveText(/^\+55/);

    // A rolagem traz a segunda página (os 2 que faltam), sem repetir nenhum.
    await itens.last().scrollIntoViewIfNeeded();
    await expect(itens).toHaveCount(12);
    const ids = await itens.evaluateAll((els) => els.map((e) => e.getAttribute("data-pedido")));
    expect(new Set(ids).size).toBe(12);
    await expect(itens.last()).toContainText("Sem motivo");
    await expect(itens.last().locator('[data-slot="atendimento-pedido-idade"]')).toHaveText("Aberto há menos de 1 hora");
    // A idade fica âmbar passada a régua de espera da página Pedidos (ESPERA_AVISO_MS, 2 horas); antes, neutra.
    await expect(itens.first()).toHaveAttribute("data-longa", "sim");
    await expect(itens.last()).not.toHaveAttribute("data-longa", "sim");
  });

  test("a seção não segue o período da aba, e trocar o período não mexe nela", async ({ page }) => {
    await page.goto(`${BARBEARIA}&aba=atendimento`);
    await expect(secao(page)).toContainText("Não segue o período escolhido acima: pedido aberto sempre precisa ser resolvido.");
    await expect(secao(page)).toContainText("Agrupados pelo motivo que a IA deu");
    const antes = await secao(page).locator('[data-slot="atendimento-pedidos-resumo"]').textContent();
    await page.getByRole("tablist", { name: "Período" }).getByRole("tab", { name: "Dia" }).click();
    await expect(page.getByRole("tablist", { name: "Período" }).getByRole("tab", { name: "Dia" })).toHaveAttribute(
      "data-state",
      "active"
    );
    await expect(secao(page).locator('[data-slot="atendimento-pedidos-resumo"]')).toHaveText(antes!);
  });

  // Regra do dono (28/10/2026): pedido aberto É alerta. O cartão "Alertas" NUNCA diz "Nada pede atenção agora"
  // com pedido aberto, com ou sem outro alerta, nem quando a leitura dos pedidos falhou (sem ela não dá para afirmar).
  for (const [nome, url] of [
    ["12 abertos, sem outro alerta", BARBEARIA],
    ["12 abertos e WhatsApp caído", `${BARBEARIA}&whatsapp=desconectado`],
    ["1 aberto", "/design/clientes/detalhe?cliente=00000000-0000-4000-8000-000000000018"],
  ] as const) {
    test(`com pedido aberto o cartão Alertas nunca diz "Nada pede atenção" (${nome})`, async ({ page }) => {
      await page.goto(url);
      const cartaoDeAlertas = page.locator('[data-bloco="visao-alertas"]');
      await expect(cartaoDeAlertas.locator('[data-slot="visao-alerta-pedidos"]')).toBeVisible();
      await expect(cartaoDeAlertas).not.toContainText("Nada pede atenção agora.");
    });
  }

  test('leitura dos pedidos falhou: o cartão Alertas diz isso e NÃO diz "Nada pede atenção"', async ({ page }) => {
    await page.goto(`${BARBEARIA}&pedidos=falha`);
    const cartaoDeAlertas = page.locator('[data-bloco="visao-alertas"]');
    await expect(cartaoDeAlertas.locator('[data-slot="visao-pedidos-sem-leitura"]')).toHaveText(
      "Não deu para ler os pedidos de ajuda agora."
    );
    await expect(cartaoDeAlertas).not.toContainText("Nada pede atenção agora.");
  });

  test('sem pedido aberto e sem alerta da conta, aí sim "Nada pede atenção agora"', async ({ page }) => {
    await page.goto(`${SEM_PEDIDO}&whatsapp=conectado`);
    const cartaoDeAlertas = page.locator('[data-bloco="visao-alertas"]');
    await expect(cartaoDeAlertas.locator('[data-slot="visao-alerta-pedidos"]')).toHaveCount(0);
    const temAlertaDaConta = (await cartaoDeAlertas.locator('[data-slot="visao-alertas-lista"]').count()) > 0;
    await expect(cartaoDeAlertas.locator('[data-slot="visao-sem-alertas"]')).toHaveCount(temAlertaDaConta ? 0 : 1);
  });

  test("sem pedido aberto: nenhum alerta na Visão geral, e a seção diz que não há nenhum", async ({ page }) => {
    await page.goto(SEM_PEDIDO);
    await expect(page.locator('[data-slot="central-aba-visao"]')).toBeVisible();
    await expect(alerta(page)).toHaveCount(0);
    await page.goto(`${SEM_PEDIDO}&aba=atendimento`);
    await expect(secao(page).locator('[data-slot="atendimento-sem-pedidos"]')).toBeVisible();
    await expect(secao(page).locator('[data-slot="atendimento-pedido"]')).toHaveCount(0);
    await expect(secao(page).locator('[data-slot="atendimento-pedidos-resumo"]')).toHaveCount(0);
  });

  test("cabe em 390px sem rolar a página de lado", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BARBEARIA}&aba=atendimento#pedidos`);
    await expect(secao(page).locator('[data-slot="atendimento-pedido"]').first()).toBeVisible();
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largura).toBeLessThanOrEqual(390);
  });
});
