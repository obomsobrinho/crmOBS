import { test, expect, type Page } from "@playwright/test";

// CAMPANHAS na tela (docs/plano-campanhas.md), no preview com dados de mentira
// (`/design/campanhas`, a fonte em memória com a MESMA interface da página de
// verdade): páginas numeradas, busca e marcação, a busca nova que termina sozinha,
// o assistente que trava sem {empresa} e o pausar do detalhe. E as travas sem
// login: as rotas da central dão 404, o webhook e o cron recusam sem segredo, a
// página manda para o login. Prova layout e comportamento da tela, nunca o banco.

const ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

/** UF primeiro, depois a cidade DA LISTA, digitando no combobox. */
async function escolherCidade(page: Page, uf: string, digitado: string, nome: string) {
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("combobox", { name: "Estado" }).click();
  await page.getByRole("option", { name: uf, exact: true }).click();
  const cidade = dialogo.getByRole("combobox", { name: "Cidade" });
  await expect(cidade).toBeEnabled();
  await cidade.click();
  await page.getByRole("textbox", { name: "Cidade: buscar" }).fill(digitado);
  await page.getByRole("option", { name: nome, exact: true }).click();
  await expect(cidade).toHaveText(nome);
}

test.describe("Campanhas sem login", () => {
  test("as rotas /api/admin/campanhas respondem 404 a quem não é admin, sem revelar nada", async ({ request }) => {
    for (const r of [
      "/api/admin/campanhas",
      "/api/admin/campanhas/totais",
      "/api/admin/campanhas/conexoes",
      "/api/admin/campanhas/buscas",
      `/api/admin/campanhas/buscas/${ID}`,
      "/api/admin/campanhas/leads",
      "/api/admin/campanhas/resumo",
      "/api/admin/campanhas/resultados",
      "/api/admin/campanhas/previa",
      `/api/admin/campanhas/${ID}`,
      `/api/admin/campanhas/${ID}/leads`,
    ]) {
      expect((await request.get(r, { maxRedirects: 0 })).status(), r).toBe(404);
    }
    expect((await request.post("/api/admin/campanhas/buscas", { data: {}, maxRedirects: 0 })).status()).toBe(404);
    expect((await request.put(`/api/admin/campanhas/${ID}/acao`, { data: { acao: "iniciar" }, maxRedirects: 0 })).status()).toBe(404);
    expect((await request.put(`/api/admin/campanhas/leads/${ID}`, { data: { marcacao: "bom" }, maxRedirects: 0 })).status()).toBe(404);
  });

  test("o webhook da fonte e o cron recusam sem o segredo", async ({ request }) => {
    expect((await request.post(`/api/prospeccao/apify?busca=${ID}`, { data: {} })).status()).toBe(401);
    expect(
      (await request.post(`/api/prospeccao/apify?busca=${ID}`, { data: {}, headers: { "x-apify-secret": "chute" } })).status(),
    ).toBe(401);
    expect((await request.get("/api/prospeccao/cron")).status()).toBe(401);
    expect((await request.get("/api/prospeccao/cron", { headers: { authorization: "Bearer chute" } })).status()).toBe(401);
  });

  test("a página /campanhas sem sessão vai para o login", async ({ request }) => {
    const r = await request.get("/campanhas", { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    expect(r.headers().location).toContain("/login");
  });
});

test.describe("Campanhas no preview", () => {
  test("Leads: páginas numeradas de 10, a outra página e a busca pelo nome no servidor da fonte", async ({ page }) => {
    await page.goto("/design/campanhas?tela=leads");
    const buscas = page.locator('[data-slot="buscas-rodape"] [data-slot="paginacao-texto"]');
    await expect(buscas).toHaveText("Mostrando 1 a 10 de 14");
    await expect(page.locator('[data-slot="busca-linha"]')).toHaveCount(10);
    await page.locator('[data-slot="buscas-rodape"] [data-slot="paginacao-proxima"]').click();
    await expect(buscas).toHaveText("Mostrando 11 a 14 de 14");
    await expect(page.locator('[data-slot="busca-linha"]')).toHaveCount(4);

    await page.locator('[data-slot="leads-ver-todos"]').click();
    const leads = page.locator('[data-slot="leads-rodape"] [data-slot="paginacao-texto"]');
    await expect(leads).toContainText("Mostrando 1 a 10 de");
    await page.getByRole("textbox", { name: "Buscar lead pelo nome ou telefone" }).fill("Bella Pele");
    await expect(page.locator('[data-slot="lead-linha"]')).toHaveCount(1);
    await expect(leads).toHaveText("Mostrando 1 a 1 de 1");
  });

  test("marcar como bom muda só a linha, e desmarcar volta", async ({ page }) => {
    await page.goto("/design/campanhas?tela=busca");
    const linha = page.locator('[data-slot="lead-linha"]').first();
    const bom = linha.locator('[data-slot="lead-marcar-bom"]');
    const antes = await bom.getAttribute("aria-pressed");
    await bom.click();
    await expect(bom).toHaveAttribute("aria-pressed", antes === "true" ? "false" : "true");
    await bom.click();
    await expect(bom).toHaveAttribute("aria-pressed", antes ?? "false");
  });

  test("Nova busca entra como Buscando e fica Pronta sozinha (a tabela relê a linha que roda)", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/design/campanhas?tela=leads");
    await page.locator('[data-slot="leads-nova-busca"]').click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("textbox", { name: "Segmento" }).fill("pet shop");
    await dialogo.getByRole("textbox", { name: "Segmento" }).press("Enter");
    await escolherCidade(page, "MG", "mutum", "Mutum");
    await dialogo.getByRole("button", { name: "Buscar", exact: true }).click();
    const nova = page.locator('[data-slot="busca-linha"]', { hasText: "pet shop" });
    await expect(nova).toContainText("Buscando");
    await expect(nova).toContainText("Pronta", { timeout: 30_000 });
  });

  test("o assistente trava a mensagem sem {empresa} e põe a linha de saída na prévia", async ({ page }) => {
    await page.goto("/design/campanhas?tela=campanhas");
    await page.locator('[data-slot="campanhas-nova"]').click();
    await page.getByRole("textbox", { name: "Nome da campanha" }).fill("Teste do assistente");
    await page.locator('[data-slot="assistente-continuar"]').click();
    await expect(page.locator('[data-secao="quem"]')).toContainText(/\d+ leads?, \d+ dias?/);
    await page.locator('[data-slot="assistente-continuar"]').click();
    const variante = page.getByRole("textbox", { name: "Texto da variante 1" });
    await expect(page.getByText("Se não quiser receber mais mensagens, é só responder SAIR.").first()).toBeVisible();
    await variante.fill("Oi, tudo bem? Posso te mostrar uma coisa?");
    await expect(page.getByText("Falta {empresa} no texto.")).toBeVisible();
    await expect(page.locator('[data-slot="assistente-continuar"]')).toBeDisabled();
    await variante.fill("Oi, vi a {empresa} no Google.");
    await expect(page.locator('[data-slot="assistente-continuar"]')).toBeEnabled();
    await expect(page.locator('[data-slot="assistente-salvo"]')).toContainText("Salvo");
  });

  test("o detalhe pausa e retoma", async ({ page }) => {
    await page.goto("/design/campanhas?tela=campanha");
    const botao = page.locator('[data-slot="campanha-pausar"]');
    await expect(botao).toHaveText(/Pausar/);
    await botao.click();
    await expect(botao).toHaveText(/Retomar/);
    await botao.click();
    await expect(botao).toHaveText(/Pausar/);
    await expect(page.locator('[data-slot="campanha-leads-rodape"] [data-slot="paginacao-texto"]')).toContainText("Mostrando 1 a 10 de");
  });

  test("cenário vazio: os estados vazios dizem o próximo passo", async ({ page }) => {
    await page.goto("/design/campanhas?cenario=vazio&tela=leads");
    await expect(page.getByText("Nenhuma busca ainda")).toBeVisible();
    await page.locator('[data-slot="campanhas-aba-campanhas"]').click();
    await expect(page.getByText("Nenhuma campanha ainda")).toBeVisible();
  });
});

test.describe("Campanhas, revisão de 30/10/2026 (preview)", () => {
  test("o menu: o CRM como antes e, no fim, a seção do dono com Campanhas e Clientes", async ({ page }) => {
    await page.goto("/design/campanhas?tela=leads");
    const doCrm = (await page.locator('[data-slot="rail-itens"] a').allInnerTexts()).map((t) => t.trim());
    const secao = page.locator('[data-slot="rail-secao-dono"]');
    await expect(secao).toBeVisible();
    await expect(secao.getByText("Gestão da OBS")).toBeVisible();
    expect((await secao.locator("a").allInnerTexts()).map((t) => t.trim())).toEqual(["Campanhas", "Clientes"]);
    // Os itens do CRM ficam como antes das Campanhas, e a seção vem depois de todos.
    const crm = doCrm.filter((n) => n !== "Campanhas" && n !== "Clientes");
    expect(crm.slice(0, 5)).toEqual(["Painel", "Pedidos", "Conversas", "Contatos", "Pipeline"]);
    expect(doCrm.slice(-2)).toEqual(["Campanhas", "Clientes"]);
    await expect(secao.locator("a", { hasText: "Campanhas" })).toHaveAttribute("aria-current", "page");
  });

  test("celular: a seção do dono aparece agrupada dentro de \"Mais\"", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/design/campanhas?tela=leads");
    await page.getByRole("button", { name: "Mais" }).click();
    const grupo = page.locator('[data-slot="mais-secao-dono"]');
    await expect(grupo).toBeVisible();
    await expect(grupo.getByText("Gestão da OBS")).toBeVisible();
    expect((await grupo.locator("a").allInnerTexts()).map((t) => t.trim())).toEqual(["Campanhas", "Clientes"]);
  });

  test("Nova busca: a cidade escolhida abre o mapa; o raio aparece, muda e volta para a cidade inteira", async ({ page }) => {
    await page.goto("/design/campanhas?tela=leads");
    await page.locator('[data-slot="leads-nova-busca"]').click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.locator('[data-slot="nova-busca-mapa"]')).toHaveCount(0);
    await escolherCidade(page, "MG", "mutum", "Mutum");
    await expect(dialogo.locator('[data-slot="nova-busca-mapa"]')).toBeVisible();
    const raio = dialogo.locator('[data-slot="nova-busca-raio"]');
    await expect(raio).toHaveText("Raio: a cidade inteira");
    await dialogo.getByRole("button", { name: "Aumentar o raio" }).click();
    await expect(raio).toHaveText("Raio: 5 km");
    await expect(dialogo.locator(".pino-central")).toHaveCount(1);
    await expect(dialogo.locator("path.area-do-mapa")).toHaveCount(1);
    await dialogo.getByRole("button", { name: "Aumentar o raio" }).click();
    await expect(raio).toHaveText("Raio: 8 km");
    await dialogo.getByRole("button", { name: "Diminuir o raio" }).click();
    await dialogo.getByRole("button", { name: "Diminuir o raio" }).click();
    await expect(raio).toHaveText("Raio: 3 km");
    await dialogo.locator('[data-slot="nova-busca-cidade-inteira"]').click();
    await expect(raio).toHaveText("Raio: a cidade inteira");
    await expect(dialogo.locator(".pino-central")).toHaveCount(0);
  });

  test("Nova busca: clicar longe no mapa move o centro e avisa a cidade vizinha, sem bloquear", async ({ page }) => {
    await page.goto("/design/campanhas?tela=leads");
    await page.locator('[data-slot="leads-nova-busca"]').click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("textbox", { name: "Segmento" }).fill("padaria");
    await dialogo.getByRole("textbox", { name: "Segmento" }).press("Enter");
    await escolherCidade(page, "MG", "mutum", "Mutum");
    // Da cidade inteira até o maior raio: 5, 8, 10, 15, 20, 30, 50 km (no fim o "+" desliga).
    const mais = dialogo.getByRole("button", { name: "Aumentar o raio" });
    for (let i = 0; i < 7; i++) await mais.click();
    await expect(dialogo.locator('[data-slot="nova-busca-raio"]')).toHaveText("Raio: 50 km");
    await expect(mais).toBeDisabled();
    await expect(dialogo.locator('[data-bloco="nova-busca-centro-fora"]')).toHaveCount(0);
    const mapa = dialogo.locator('[data-slot="nova-busca-mapa"]');
    await mapa.scrollIntoViewIfNeeded();
    const caixa = await mapa.boundingBox();
    if (!caixa) throw new Error("mapa sem caixa");
    await page.mouse.click(caixa.x + caixa.width - 40, caixa.y + caixa.height / 2);
    await expect(dialogo.locator('[data-bloco="nova-busca-centro-fora"]')).toContainText("O centro está em");
    await expect(dialogo.getByRole("button", { name: "Buscar", exact: true })).toBeEnabled();
  });

  test("o detalhe da busca diz onde ela procurou: a cidade e o raio usado", async ({ page }) => {
    await page.goto("/design/campanhas?tela=busca");
    await expect(page.getByText("Mutum, MG · raio de 5 km")).toBeVisible();
  });

  test("Nova busca: sem cidade da lista não busca; a cidade casa sem acento e só na UF escolhida", async ({ page }) => {
    await page.goto("/design/campanhas?tela=leads");
    await page.locator('[data-slot="leads-nova-busca"]').click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("textbox", { name: "Segmento" }).fill("clínica de estética");
    await dialogo.getByRole("textbox", { name: "Segmento" }).press("Enter");
    const buscar = dialogo.getByRole("button", { name: "Buscar", exact: true });
    await expect(buscar).toBeDisabled();
    // Sem UF a cidade nem abre.
    await expect(dialogo.getByRole("combobox", { name: "Cidade" })).toBeDisabled();
    // No ES não existe Mutum.
    await dialogo.getByRole("combobox", { name: "Estado" }).click();
    await page.getByRole("option", { name: "ES", exact: true }).click();
    await dialogo.getByRole("combobox", { name: "Cidade" }).click();
    await page.getByRole("textbox", { name: "Cidade: buscar" }).fill("Mutúm");
    await expect(page.getByText("Nenhuma cidade com esse nome neste estado")).toBeVisible();
    await page.keyboard.press("Escape");
    await escolherCidade(page, "MG", "MUTÚM", "Mutum");
    await expect(buscar).toBeEnabled();
    // As categorias sugeridas saem do segmento.
    await expect(dialogo.getByRole("group", { name: "Só desta categoria" }).last().getByRole("button", { name: "Esteticista" })).toBeVisible();
    await expect(dialogo.getByRole("group", { name: "Mínimo de avaliações no Google" }).first()).toBeVisible();
  });

  test("o mapa da busca: um pino por lead com coordenadas, a legenda conta os estados", async ({ page }) => {
    await page.goto("/design/campanhas?tela=busca");
    const mapa = page.locator('[data-slot="busca-mapa"]');
    await expect(mapa).toBeVisible();
    const n = Number(await mapa.getAttribute("data-pinos"));
    expect(n).toBeGreaterThan(10);
    await expect(mapa.locator("path.pino-do-mapa")).toHaveCount(n);
    const legenda = await page.locator('[data-slot="busca-mapa-legenda"] li').allInnerTexts();
    expect(legenda.map((t) => Number(t.match(/(\d+)$/)?.[1] ?? 0)).reduce((a, b) => a + b, 0)).toBe(n);
    await expect(page.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
  });

  test("clicar num pino destaca a linha na tabela; \"ver no mapa\" na linha destaca o pino", async ({ page }) => {
    await page.goto("/design/campanhas?tela=busca");
    const pinos = page.locator('[data-slot="busca-mapa"] path.pino-do-mapa');
    await expect(pinos.first()).toBeVisible();
    // O último pino da busca de estética é o dentista que veio no meio (fica na última página da tabela).
    // O clique vai ao próprio pino (o Leaflet escuta o evento no SVG), sem depender de onde ele cai na tela.
    await pinos.last().dispatchEvent("click");
    await expect(page.locator('[data-slot="leads-rodape"] [data-slot="paginacao-texto"]')).toHaveText("Mostrando 11 a 17 de 17");
    const destacada = page.locator('[data-slot="lead-linha"][data-destaque]');
    await expect(destacada).toHaveCount(1);
    await expect(destacada).toBeInViewport();
    const linha = page.locator('[data-slot="lead-linha"]').first();
    await linha.locator('[data-slot="lead-ver-no-mapa"]').click();
    await expect(page.locator('[data-slot="lead-linha"][data-destaque]')).toHaveAttribute("data-lead", (await linha.getAttribute("data-lead")) ?? "");
  });

  test("a ficha do lead: pontos e motivos, perfil não reivindicado, horário da semana e avaliações por estrela", async ({ page }) => {
    await page.goto("/design/campanhas?tela=busca");
    await page.locator('[data-slot="lead-abrir-ficha"]').first().click();
    const ficha = page.locator('[data-slot="lead-ficha"]');
    await expect(ficha).toBeVisible();
    await expect(ficha.locator('[data-slot="ficha-pontos"]')).toContainText("pontos");
    await expect(ficha.locator('[data-slot="ficha-horario"] tr')).toHaveCount(7);
    await expect(ficha.locator('[data-slot="ficha-avaliacoes"]')).toContainText("avaliações");
    await expect(ficha.getByText("Perfil no Google")).toBeVisible();
  });

  test("o filtro Perfil não reivindicado mostra só quem a fonte diz que não reivindicou", async ({ page }) => {
    await page.goto("/design/campanhas?tela=busca");
    const rodape = page.locator('[data-slot="leads-rodape"] [data-slot="paginacao-texto"]');
    await expect(rodape).toContainText("de 17");
    // A tabela fica abaixo do mapa: traz o botão para a tela antes de abrir o menu (o menu segue o botão).
    await page.locator('[data-slot="leads-filtro"]').scrollIntoViewIfNeeded();
    await page.locator('[data-slot="leads-filtro"]').click();
    const opcao = page.locator('[data-menu="leads-filtro"] [data-filtro]', { hasText: "Perfil não reivindicado" });
    await expect(opcao).toBeVisible();
    await opcao.dispatchEvent("click");
    await page.keyboard.press("Escape");
    await expect(rodape).not.toContainText("de 17");
    await page.locator('[data-slot="lead-abrir-ficha"]').first().click();
    await expect(page.locator('[data-slot="ficha-nao-reivindicado"]')).toBeVisible();
  });
});

// Bug de 30/10/2026: um refresh deixava a aba Leads em "Carregando…" com "Nenhum
// resultado" na paginação, para sempre. Causa: a tela dependia só das leituras do
// navegador, sem prazo, e o HTML do servidor era a tela vazia. Agora a primeira tela
// vem lida do servidor, a paginação só aparece com dados e uma leitura que não
// volta vira "Tentar de novo".
test.describe("Campanhas: refresh nunca fica em Carregando (regressão de 30/10/2026)", () => {
  test("o HTML do servidor já traz a primeira tela: buscas, contagens e paginação, sem Carregando", async ({ request }) => {
    const html = await (await request.get("/design/campanhas?tela=leads")).text();
    expect(html).not.toContain("Carregando…");
    expect(html).not.toContain("Nenhum resultado");
    expect(html).toContain("Mostrando 1 a 10 de 14");
    expect(html).toContain('data-slot="busca-linha"');
  });

  test("refresh: a tabela continua com as buscas, e a paginação nunca diz Nenhum resultado sob Carregando", async ({ page }) => {
    await page.goto("/design/campanhas?tela=leads");
    const rodape = page.locator('[data-slot="buscas-rodape"] [data-slot="paginacao-texto"]');
    await expect(rodape).toHaveText("Mostrando 1 a 10 de 14");
    for (let i = 0; i < 2; i++) {
      await page.reload();
      await expect(page.locator('[data-slot="busca-linha"]')).toHaveCount(10);
      await expect(rodape).toHaveText("Mostrando 1 a 10 de 14");
      await expect(page.getByText("Carregando…")).toHaveCount(0);
    }
  });

  test("uma leitura que nunca volta vira \"Tentar de novo\" no tempo limite, sem paginação embaixo", async ({ page }) => {
    await page.clock.install();
    await page.goto("/design/campanhas?tela=leads&cenario=travado");
    const tabela = page.locator('[data-bloco="leads-tabela"]');
    await expect(tabela.getByText("Carregando…")).toBeVisible();
    // Carregando: nada de "Nenhum resultado" embaixo.
    await expect(page.locator('[data-slot="buscas-rodape"]')).toHaveCount(0);
    // O HTML aparece antes de a tela hidratar e o prazo começar: o relógio anda até a falha aparecer.
    await expect(async () => {
      await page.clock.fastForward(5_000);
      await expect(tabela.getByText("Não deu para carregar agora.")).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 20_000 });
    await expect(tabela.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
    await expect(page.locator('[data-slot="buscas-rodape"]')).toHaveCount(0);
  });
});
