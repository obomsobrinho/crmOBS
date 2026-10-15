import { test, expect, type Locator, type Page } from "@playwright/test";
import { idFalso } from "../app/design/clientes/dados";
import { ritmoDoLimite } from "../lib/admin-cliente";
import { tokensCurto } from "../lib/custo-ia";

// A central "Clientes" do dono do produto e a faixa do teto de IA, no preview com
// dados FALSOS (P1 item 6; docs/plano-central-clientes.md, entrega 1). Prova
// desenho, texto e a conta da tela; o banco é o custo-ia.serial, a trava de quem
// não é admin é o atendente.att, e a trava por rota é o central-clientes-lib.

const DASH = new RegExp("[\\u2013\\u2014]");
const ID = idFalso;

function cliente(page: Page, nome: string) {
  return page.locator('[data-slot="central-cliente"]', { hasText: nome });
}

/** O ritmo do limite como a tela o escreve ("322,6 mil"), pela mesma conta pura, no mês do relógio de hoje. */
const ritmo = (limite: number, unidade: "hora" | "dia") => tokensCurto(ritmoDoLimite(limite, Date.now(), unidade));

const detalhe = (n: number, extra = "") => `/design/clientes/detalhe?cliente=${ID(n)}${extra}`;

test.describe("Central: lista de Clientes (/design/clientes)", () => {
  test("10 por vez, e o resto chega ao rolar", async ({ page }) => {
    await page.goto("/design/clientes");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    const itens = page.locator('[data-slot="central-cliente"]');
    await expect(itens).toHaveCount(10);
    await page.locator('[data-slot="central-mais"]').scrollIntoViewIfNeeded();
    await expect(itens).toHaveCount(20);
    // 20 é múltiplo de 10: a segunda página veio cheia, então ainda se pede uma
    // terceira, que volta vazia e encerra a lista.
    await page.locator('[data-slot="central-mais"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-slot="central-mais"]')).toHaveCount(0);
    await expect(itens).toHaveCount(20);
  });

  test("situação, plano e alerta de cada cliente", async ({ page }) => {
    await page.goto("/design/clientes");
    await page.locator('[data-slot="central-mais"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-slot="central-cliente"]')).toHaveCount(20);

    const ze = cliente(page, "Barbearia do Zé");
    await expect(ze.locator('[data-slot="admin-situacao"]')).toHaveText("Ativo");
    await expect(ze).toContainText("plano Essencial");
    await expect(ze.locator('[data-slot="admin-alerta"]')).toHaveCount(0);
    await expect(ze.locator('[data-slot="central-agente"]')).toContainText("Agente ativo");
    await expect(ze.locator('[data-slot="central-whatsapp"]')).toContainText("Instância criada");

    const sorriso = cliente(page, "Clínica Sorriso");
    await expect(sorriso.locator('[data-slot="admin-situacao"]')).toHaveText("Em teste");
    await expect(sorriso).toContainText("5 dias restantes");
    await expect(sorriso.locator('[data-slot="admin-alerta"]')).toHaveText("Perto do limite de IA");
    await expect(sorriso.locator('[data-slot="central-percentual"]')).toHaveText("85%");
    await expect(sorriso.locator('[data-slot="medidor"]')).toHaveAttribute("data-consumo", "aviso");

    // O alerta principal é o mais urgente: IA parada vence o resto.
    const maria = cliente(page, "Dra Maria Jullia");
    await expect(maria.locator('[data-slot="admin-alerta"]')).toHaveText("IA parada no limite");
    await expect(maria).toHaveAttribute("data-estado", "parada");
    await expect(maria.locator('[data-slot="medidor"]')).toHaveAttribute("data-consumo", "parado");
    // A barra para em 100% mesmo com o uso passando do teto.
    const larg = await maria.locator("[data-medidor-cheio]").evaluate((el) => (el as HTMLElement).style.width);
    expect(larg).toBe("100%");

    const aurora = cliente(page, "Estúdio Aurora");
    await expect(aurora.locator('[data-slot="admin-situacao"]')).toHaveText("Atrasado");
    await expect(aurora.locator('[data-slot="admin-alerta"]')).toHaveText("Pagamento atrasado");

    await expect(cliente(page, "Mercearia Central").locator('[data-slot="admin-situacao"]')).toHaveText("Cancelado");
    await expect(cliente(page, "Ótica Vision").locator('[data-slot="admin-situacao"]')).toHaveText("Teste encerrado");

    const pizzaria = cliente(page, "Pizzaria Bella");
    await expect(pizzaria.locator('[data-slot="admin-alerta"]')).toHaveText("Montagem não terminada");
    await expect(pizzaria.locator('[data-slot="central-whatsapp"]')).toContainText("Sem WhatsApp");
    await expect(pizzaria.locator('[data-slot="central-agente"]')).toContainText("Sem publicar");

    await expect(cliente(page, "OBM").locator('[data-slot="admin-alerta"]')).toContainText("Sem atividade há 60 dias");
    await expect(cliente(page, "Loja Teste").locator('[data-slot="central-agente"]')).toContainText("Desativado");
    await expect(cliente(page, "Loja Teste").locator('[data-slot="admin-alerta"]')).toHaveCount(0);
  });

  test("custo estimado em dólar pela tabela", async ({ page }) => {
    await page.goto("/design/clientes");
    // (1.200.000 * 0,75 + 1.200.000 * 0,075 + 42.000 * 4,5) / 1e6 = 1,179
    const custo = await cliente(page, "Barbearia do Zé").locator('[data-slot="central-custo"]').innerText();
    expect(custo.replace(/\s/g, " ")).toContain("US$ 1,18");
  });

  test("busca por nome, sem acento e sem caixa", async ({ page }) => {
    await page.goto("/design/clientes");
    await page.getByLabel("Buscar clientes").fill("clinica");
    await expect(page.locator('[data-slot="central-cliente"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="central-cliente"]')).toContainText("Clínica Sorriso");
    await page.getByLabel("Buscar clientes").fill("nada disso");
    await expect(page.locator('[data-slot="central-vazio"]')).toContainText("Nenhum cliente para");
  });

  test("filtro por situação, no servidor da lista", async ({ page }) => {
    await page.goto("/design/clientes");
    const itens = page.locator('[data-slot="central-cliente"]');
    const chip = (nome: string) => page.locator('[data-slot="central-chip"]', { hasText: nome });
    await expect(chip("Todos")).toHaveAttribute("aria-pressed", "true");

    await chip("Atrasados").click();
    await expect(itens).toHaveCount(1);
    await expect(itens).toContainText("Estúdio Aurora");
    await expect(chip("Atrasados")).toHaveAttribute("aria-pressed", "true");

    await chip("Cancelados").click();
    await expect(itens).toHaveCount(1);
    await expect(itens).toContainText("Mercearia Central");

    // "Em teste" inclui o teste que já terminou (o selo da linha distingue).
    await chip("Em teste").click();
    await expect(itens).toHaveCount(5);
    await expect(cliente(page, "Ótica Vision")).toHaveCount(1);

    await chip("Ativos").click();
    await expect(itens).toHaveCount(10);

    // Filtro e busca juntos.
    await page.getByLabel("Buscar clientes").fill("zé");
    await expect(itens).toHaveCount(1);
    await expect(itens).toContainText("Barbearia do Zé");
    await chip("Cancelados").click();
    await expect(page.locator('[data-slot="central-vazio"]')).toBeVisible();
    await expect(chip("Todos")).toHaveAttribute("aria-pressed", "false");
  });

  test("a linha inteira abre o detalhe do cliente", async ({ page }) => {
    await page.goto("/design/clientes");
    await cliente(page, "Barbearia do Zé").click();
    await expect(page).toHaveURL(new RegExp(`/design/clientes/detalhe\\?cliente=${ID(1)}`), { timeout: 30_000 });
    await expect(page.locator('[data-slot="central-detalhe-nome"]')).toHaveText("Barbearia do Zé");
  });

  test("sem clientes, o vazio explica", async ({ page }) => {
    await page.goto("/design/clientes?cenario=vazia");
    await expect(page.locator('[data-slot="central-vazio"]')).toContainText("Nenhum cliente ainda");
  });

  test("nenhum travessão na tela", async ({ page }) => {
    await page.goto("/design/clientes");
    await page.locator('[data-slot="central-mais"]').scrollIntoViewIfNeeded();
    expect(DASH.test(await page.locator("body").innerText())).toBe(false);
  });

  // A coluna do cliente nunca some: onde a tabela de seis colunas não cabe (abaixo de 1280, com o
  // menu aberto), a linha vira o bloco empilhado do celular. Em 1024 a coluna do nome chegou a
  // zero e o avatar cobria o selo da situação.
  for (const largura of [1024, 1100, 1280, 1440]) {
    test(`em ${largura}px o nome do cliente aparece inteiro e não cobre a situação`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await page.goto("/design/clientes");
      const linha = cliente(page, "Barbearia do Zé");
      await expect(linha).toBeVisible();
      const nome = await linha.locator('[data-slot="central-nome"]').boundingBox();
      const selo = await linha.locator('[data-slot="admin-situacao"]').boundingBox();
      const avatar = await linha.locator('[data-slot="avatar"]').boundingBox();
      expect(nome, "nome").not.toBeNull();
      expect(selo, "selo").not.toBeNull();
      // O nome tem largura de verdade (cabe "Barbearia do Zé" sem cortar).
      expect(nome!.width).toBeGreaterThan(100);
      const texto = await linha.locator('[data-slot="central-nome"]').evaluate((el) => ({
        cortado: el.scrollWidth > el.clientWidth,
      }));
      expect(texto.cortado).toBe(false);
      const sobrepoe = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(sobrepoe(nome!, selo!), "nome x situação").toBe(false);
      if (avatar) expect(sobrepoe(avatar, selo!), "avatar x situação").toBe(false);
      // O cabeçalho das colunas só existe onde a tabela existe, e as etiquetas não se tocam.
      const cabecalho = page.locator('[data-slot="central-lista"]').locator("xpath=preceding::div[@aria-hidden='true'][1]");
      if (largura >= 1280) {
        const cliente = await page.getByText("Cliente", { exact: true }).first().boundingBox();
        const situacao = await page.getByText("Situação", { exact: true }).first().boundingBox();
        expect(cliente && situacao && !sobrepoe(cliente, situacao)).toBe(true);
      } else {
        await expect(cabecalho).toBeHidden();
      }
    });
  }

  test("no celular a lista cabe na tela, sem rolagem de lado", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/design/clientes");
    await expect(cliente(page, "Barbearia do Zé")).toBeVisible();
    const largura = await page.evaluate(() => ({
      pagina: document.documentElement.scrollWidth,
      janela: window.innerWidth,
    }));
    expect(largura.pagina).toBeLessThanOrEqual(largura.janela);
  });
});

test.describe("Central: o item de menu só existe para o dono do produto", () => {
  test("a central mostra Clientes no menu; Contatos e o resto não", async ({ page }) => {
    await page.goto("/design/clientes");
    await expect(page.getByRole("link", { name: "Clientes", exact: true }).first()).toBeVisible();

    for (const rota of ["/design/contatos", "/design/equipe", "/design/painel", "/design/pedidos"]) {
      await page.goto(rota);
      await expect(page.getByRole("link", { name: "Clientes", exact: true })).toHaveCount(0);
    }
  });

  test("no celular, Clientes está em Mais para o dono do produto e some para os outros", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/design/clientes");
    await page.getByRole("button", { name: "Mais" }).click();
    await expect(page.getByRole("link", { name: "Clientes", exact: true })).toBeVisible();

    await page.goto("/design/contatos");
    await page.getByRole("button", { name: "Mais" }).click();
    await expect(page.getByRole("link", { name: "Contatos", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clientes", exact: true })).toHaveCount(0);
    // Item só-do-dono (Agente) exige o papel `dono`: o preview passa o papel, e o item aparece em Mais.
    await expect(page.getByRole("link", { name: "Agente", exact: true })).toBeVisible();
  });
});

test.describe("Central: detalhe de um cliente", () => {
  test("cabeçalho com nome, situação e alerta principal", async ({ page }) => {
    await page.goto(detalhe(2));
    await expect(page.locator('[data-slot="central-detalhe-nome"]')).toHaveText("Clínica Sorriso");
    const cab = page.locator('[data-slot="central-detalhe"]');
    await expect(cab.locator('[data-slot="admin-situacao"]').first()).toHaveText("Em teste");
    await expect(cab.locator('[data-slot="admin-alerta"]').first()).toHaveText("Perto do limite de IA");
    await expect(page.getByRole("tab")).toHaveText(["Visão geral", "Uso de IA", "Atendimento", "Financeiro", "Ações"]);
    await expect(page.getByRole("tab", { name: "Visão geral" })).toHaveAttribute("aria-selected", "true");
  });

  test("Visão geral: dono, equipe, montagem, agente, avisos e WhatsApp ao vivo", async ({ page }) => {
    await page.goto(detalhe(1));
    await expect(page.locator('[data-slot="visao-dono"]')).toContainText("dono@barbeariadoz.exemplo");
    await expect(page.locator('[data-slot="visao-equipe"]')).toContainText("3");
    await expect(page.locator('[data-slot="visao-equipe"]')).toContainText("2 atendentes");
    await expect(page.locator('[data-slot="visao-montagem"]')).toHaveText("Terminada");
    await expect(page.locator('[data-slot="visao-agente"]')).toHaveText("Agente ativo");
    await expect(page.locator('[data-slot="visao-modo"]')).toHaveText("Guiado");
    await expect(page.locator('[data-slot="visao-avisos"]')).toHaveText("Configurado");
    await expect(page.locator('[data-slot="visao-conexao"]')).toHaveText("Conectado");
    await expect(page.locator('[data-slot="visao-sem-alertas"]')).toBeVisible();
  });

  test("WhatsApp desconectado entra nos alertas e no cabeçalho", async ({ page }) => {
    await page.goto(detalhe(1, "&whatsapp=desconectado"));
    await expect(page.locator('[data-slot="visao-conexao"]')).toHaveText("Desconectado");
    await expect(page.locator('[data-slot="visao-alertas-lista"] [data-alerta="whatsapp"]')).toBeVisible();
    await expect(
      page.locator('[data-slot="central-detalhe"] [data-slot="admin-alerta"]').first()
    ).toHaveText("WhatsApp desconectado");
  });

  test("WhatsApp reconectando é dito como tal e NÃO vira alerta de desconexão", async ({ page }) => {
    await page.goto(detalhe(1, "&whatsapp=reconectando"));
    await expect(page.locator('[data-slot="visao-conexao"]')).toHaveText("Reconectando");
    await expect(page.locator('[data-slot="visao-sem-alertas"]')).toBeVisible();
    await expect(page.locator('[data-slot="central-detalhe"] [data-slot="admin-alerta"]')).toHaveCount(0);
  });

  test("avatar do cliente leva a cor derivada do id (avatarPair), a mesma dos outros avatares", async ({ page }) => {
    await page.goto("/design/clientes");
    const estilos = await page
      .locator('[data-slot="central-cliente"] [data-slot="avatar"]')
      .evaluateAll((els) => els.slice(0, 6).map((e) => e.getAttribute("style") ?? ""));
    expect(estilos.length).toBeGreaterThan(1);
    // O par de fundo e tinta do tema (--av-N-bg e --av-N-fg), nunca uma cor fixa.
    for (const e of estilos) expect(e).toMatch(/var\(--av-[1-8]-bg\)/);
    // Ids diferentes, pares que não são todos o mesmo.
    expect(new Set(estilos).size).toBeGreaterThan(1);
  });

  test("quem nunca criou a instância não tem o que checar", async ({ page }) => {
    await page.goto(detalhe(6));
    await expect(page.locator('[data-slot="visao-conexao"]')).toHaveText("Sem WhatsApp");
    await expect(page.locator('[data-slot="visao-montagem"]')).toHaveText("Não terminada");
    await expect(page.locator('[data-slot="visao-agente"]')).toHaveText("Sem publicar");
    await expect(page.locator('[data-slot="visao-checar"]')).toHaveCount(0);
  });

  // --- Uso de IA e Atendimento: os gráficos (Recharts em components/ui/chart.tsx) ---

  const uso = (page: Page) => page.locator('[data-slot="central-aba-uso"]');
  const atend = (page: Page) => page.locator('[data-slot="central-aba-atendimento"]');

  async function periodo(page: Page, aba: Locator, nome: "Dia" | "Semana" | "Quinzena" | "Mês") {
    const gatilho = aba.getByRole("tab", { name: nome, exact: true });
    await gatilho.click();
    await expect(gatilho).toHaveAttribute("aria-selected", "true");
  }

  /** Passa o mouse sobre a ÚLTIMA coluna do gráfico (a mais recente), que fica colada na borda direita da área. */
  async function passarNaUltimaColuna(page: Page, grafico: Locator) {
    await grafico.scrollIntoViewIfNeeded();
    await expect(grafico.locator(".recharts-bar-rectangle").first()).toBeAttached();
    const caixa = (await grafico.boundingBox())!;
    await page.mouse.move(caixa.x + caixa.width - 8, caixa.y + caixa.height / 2);
  }

  const numero = (t: string | null) => Number((t ?? "").replace(/\./g, "").replace(",", "."));

  test("Uso de IA: o período manda nos números e no gráfico, e a soma das colunas é o total", async ({ page }) => {
    await page.goto(detalhe(1, "&aba=uso"));
    const aba = uso(page);
    await expect(aba.locator('[data-bloco="uso-tokens"]')).toBeVisible();
    // Os chips são os do painel, na mesma ordem.
    await expect(aba.getByRole("tab")).toHaveText(["Dia", "Semana", "Quinzena", "Mês"]);
    await expect(aba.getByRole("tab", { name: "Semana", exact: true })).toHaveAttribute("aria-selected", "true");

    for (const [nome, colunas, unidade, legenda] of [
      ["Dia", 24, "hora", "últimas 24 horas"],
      ["Semana", 7, "dia", "últimos 7 dias"],
      ["Quinzena", 15, "dia", "últimos 15 dias"],
      ["Mês", 30, "dia", "últimos 30 dias"],
    ] as const) {
      await periodo(page, aba, nome);
      const linhas = aba.locator('[data-tabela="central-uso"] tbody tr');
      await expect(linhas).toHaveCount(colunas);
      await expect(aba.locator('[data-slot="central-grafico"]')).toHaveAttribute("data-unidade", unidade);
      const usados = await linhas.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-usados"))));
      const turnos = await linhas.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-turnos"))));
      const tokens = aba.locator('[data-bloco="uso-tokens"]');
      expect(usados.reduce((s, n) => s + n, 0), nome).toBe(Number(await tokens.getAttribute("data-usados")));
      expect(turnos.reduce((s, n) => s + n, 0), nome).toBe(Number(await aba.locator('[data-bloco="uso-turnos"]').getAttribute("data-turnos")));
      await expect(tokens).toContainText(legenda);
      await expect(aba.locator('[data-bloco="uso-custo"]')).toContainText("US$");
    }
    // O mês é rolante (30 dias) e soma pelo menos o que a semana soma.
    const mes = Number(await aba.locator('[data-bloco="uso-tokens"]').getAttribute("data-usados"));
    await periodo(page, aba, "Semana");
    const semana = Number(await aba.locator('[data-bloco="uso-tokens"]').getAttribute("data-usados"));
    expect(mes).toBeGreaterThan(semana);
  });

  test("Uso de IA: o balão da coluna traz o dia, os tokens, os turnos, o custo e o ritmo do limite", async ({ page }) => {
    await page.goto(detalhe(1, "&aba=uso"));
    const aba = uso(page);
    const grafico = aba.locator('[data-slot="central-grafico"] [data-slot="chart"]');
    await passarNaUltimaColuna(page, grafico);
    const balao = page.locator('[data-slot="chart-tooltip"]');
    await expect(balao).toBeVisible();

    // O balão da última coluna diz o MESMO que a linha da tabela (a visão em tabela do gráfico).
    const ultima = aba.locator('[data-tabela="central-uso"] tbody tr').last();
    const rotulo = await ultima.locator("td").first().innerText();
    await expect(balao).toContainText(rotulo);
    await expect(balao.locator('[data-linha="tokens"]')).toContainText(
      Number(await ultima.getAttribute("data-usados")).toLocaleString("pt-BR")
    );
    await expect(balao.locator('[data-linha="turnos"]')).toContainText(String(await ultima.getAttribute("data-turnos")));
    await expect(balao.locator('[data-linha="custo"]')).toContainText("US$");
    await expect(balao.locator('[data-linha="ritmo"]')).toContainText(ritmo(10_000_000, "dia"));
    // Hoje em semana: "quarta, 14/10" (dia da semana e dia/mês).
    expect(rotulo).toMatch(/^(domingo|segunda|terça|quarta|quinta|sexta|sábado), \d{2}\/\d{2}$/);

    // Sair do gráfico some com o balão.
    await page.mouse.move(5, 5);
    await expect(balao).toHaveCount(0);

    // No Dia, o balão é por hora ("14/10, 15h").
    await periodo(page, aba, "Dia");
    await passarNaUltimaColuna(page, grafico);
    await expect(balao).toBeVisible();
    await expect(balao).toContainText(/\d{2}\/\d{2}, \d{2}h/);
    await expect(balao.locator('[data-linha="ritmo"]')).toContainText(ritmo(10_000_000, "hora"));
  });

  test("Uso de IA: o limite aparece no gráfico como a linha do ritmo, e seguir o limite muda a linha", async ({ page }) => {
    await page.goto(detalhe(3, "&aba=uso"));
    const aba = uso(page);
    const grafico = aba.locator('[data-slot="central-grafico"]');
    await expect(grafico.locator(".recharts-reference-line")).toHaveCount(1);
    const legendaDoRitmo = grafico.locator('[data-slot="chart-legenda"] [data-serie="ritmo"]');
    // Limite gravado de 5 mi: 5.000.000 / 31 por dia.
    await expect(legendaDoRitmo).toContainText(`Ritmo do limite: ${ritmo(5_000_000, "dia")} por dia`);
    await periodo(page, aba, "Dia");
    await expect(legendaDoRitmo).toContainText(`${ritmo(5_000_000, "hora")} por hora`);
    await periodo(page, aba, "Semana");

    await page.locator('[data-slot="central-editar-limite"]').click();
    const dialogo = page.locator('[data-slot="admin-limite-dialogo"]');
    await dialogo.locator('[data-campo="limite"]').fill("20");
    await dialogo.locator('[data-slot="admin-limite-salvar"]').click();
    await expect(dialogo).toHaveCount(0);
    await expect(legendaDoRitmo).toContainText(`Ritmo do limite: ${ritmo(20_000_000, "dia")} por dia`);
    // A nota da diferença entre o contador do mês e as colunas continua na tela.
    await expect(grafico).toContainText("O limite conta pelo contador do mês");
  });

  test("Uso de IA: o limite mostra o estado e subir o limite tira o cliente da parada", async ({ page }) => {
    await page.goto(detalhe(3, "&aba=uso"));
    // O cartão do limite já vem no HTML do servidor; esperar a leitura da aba é esperar a hidratação (um clique antes dela se perde).
    await expect(uso(page).locator('[data-bloco="uso-tokens"]')).toBeVisible();
    const cab = page.locator('[data-slot="central-detalhe"]');
    await expect(cab.locator('[data-slot="admin-alerta"]').first()).toHaveText("IA parada no limite");
    await expect(page.locator('[data-slot="central-limite-estado"]')).toHaveText("Parada no limite");
    await expect(page.locator('[data-bloco="central-uso"] [data-slot="central-percentual"]')).toContainText("102%");

    await page.locator('[data-slot="central-editar-limite"]').click();
    const dialogo = page.locator('[data-slot="admin-limite-dialogo"]');
    await expect(dialogo).toBeVisible();
    const campo = dialogo.locator('[data-campo="limite"]');
    await expect(campo).toHaveValue("5");
    await expect(dialogo.locator('[data-slot="admin-limite-tokens"]')).toHaveText("5.000.000 tokens");
    await campo.fill("0.5");
    await expect(dialogo.locator('[data-slot="admin-limite-tokens"]')).toHaveText("500.000 tokens");
    await campo.fill("0");
    await dialogo.locator('[data-slot="admin-limite-salvar"]').click();
    await expect(dialogo.locator('[data-slot="admin-limite-erro"]')).toBeVisible();
    await campo.fill("20");
    await dialogo.locator('[data-slot="admin-limite-salvar"]').click();
    await expect(dialogo).toHaveCount(0);

    await expect(page.locator('[data-slot="central-limite-estado"]')).toHaveText("Ativa");
    await expect(page.locator('[data-bloco="central-uso"] [data-slot="central-tokens"]')).toContainText("de 20 mi tokens");
    await expect(cab.locator('[data-slot="admin-alerta"]')).toHaveCount(0);
  });

  test("Uso de IA: horários de pico, com balão por célula, legenda da escala e o pico em destaque", async ({ page }) => {
    await page.goto(detalhe(1, "&aba=uso"));
    const mapa = uso(page).locator('[data-slot="mapa-de-calor"]');
    await expect(mapa.locator('[data-slot="mapa-celula"]')).toHaveCount(7 * 24);
    await expect(page.locator('[data-slot="central-grade-pico"]')).toContainText("Pico: segunda, 16h (46 turnos)");

    // O pico é UMA célula, a de maior número, com contorno próprio.
    const pico = mapa.locator('[data-slot="mapa-celula"][data-pico]');
    await expect(pico).toHaveCount(1);
    await expect(pico).toHaveAttribute("data-linha", "1");
    await expect(pico).toHaveAttribute("data-coluna", "16");
    await expect(pico).toHaveAttribute("data-n", "46");
    await expect(pico).toHaveAttribute("data-nivel", "4");
    expect(await pico.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("solid");

    // Madrugada sem uso: célula vazia, no degrau 0 da escala.
    const madrugada = mapa.locator('[data-slot="mapa-celula"][data-linha="2"][data-coluna="3"]');
    await expect(madrugada).toHaveAttribute("data-n", "0");
    await expect(madrugada).toHaveAttribute("data-nivel", "0");

    // O balão de cada célula: "quarta, 14h: 23 turnos".
    await expect(mapa.locator('[data-slot="mapa-balao"]')).toHaveCount(0);
    await mapa.locator('[data-slot="mapa-celula"][data-linha="3"][data-coluna="14"]').hover();
    const n = await mapa
      .locator('[data-slot="mapa-celula"][data-linha="3"][data-coluna="14"]')
      .getAttribute("data-n");
    await expect(mapa.locator('[data-slot="mapa-balao"]')).toHaveText(`quarta, 14h: ${n} turnos`);
    await pico.hover();
    await expect(mapa.locator('[data-slot="mapa-balao"]')).toHaveText("segunda, 16h: 46 turnos");
    await madrugada.hover();
    await expect(mapa.locator('[data-slot="mapa-balao"]')).toHaveText("terça, 03h: 0 turnos");

    // A legenda: a escala (menos a mais) e o que o contorno significa.
    const legenda = mapa.locator('[data-slot="mapa-legenda"]');
    await expect(legenda).toContainText("Menos turnos");
    await expect(legenda).toContainText("Mais turnos");
    await expect(legenda).toContainText("Pico");

    // Pelo teclado: a grade é um ponto de tabulação, entra no pico, as setas andam.
    await page.mouse.move(5, 5);
    await expect(mapa.locator('[data-slot="mapa-balao"]')).toHaveCount(0);
    await mapa.locator('[role="grid"]').focus();
    await expect(mapa.locator('[data-slot="mapa-balao"]')).toHaveText("segunda, 16h: 46 turnos");
    await page.keyboard.press("ArrowRight");
    await expect(mapa.locator('[data-slot="mapa-balao"]')).toContainText("segunda, 17h");
    await page.keyboard.press("ArrowDown");
    await expect(mapa.locator('[data-slot="mapa-balao"]')).toContainText("terça, 17h");
    await page.keyboard.press("Escape");
    await expect(mapa.locator('[data-slot="mapa-balao"]')).toHaveCount(0);
  });

  test("Uso de IA sem nenhum uso: o vazio diz isso", async ({ page }) => {
    await page.goto(detalhe(6, "&aba=uso&vazio=1"));
    const aba = uso(page);
    await expect(aba.locator('[data-slot="central-grafico-vazio"]')).toContainText("Nenhum uso de IA neste período");
    await expect(page.locator('[data-slot="central-grade-vazio"]')).toContainText("Nenhum uso de IA nos últimos 30 dias");
    await expect(aba.locator('[data-bloco="uso-tokens"]')).toHaveAttribute("data-usados", "0");
    await expect(aba.locator('[data-bloco="uso-maior"]')).toContainText("Sem uso");
    // O vazio vale para todos os períodos; nenhum gráfico vazio é desenhado.
    for (const nome of ["Dia", "Quinzena", "Mês"] as const) {
      await periodo(page, aba, nome);
      await expect(aba.locator('[data-slot="central-grafico-vazio"]')).toBeVisible();
    }
    await expect(aba.locator(".recharts-bar-rectangle")).toHaveCount(0);
  });

  test("Atendimento: as contas do painel, por período", async ({ page }) => {
    await page.goto(detalhe(1, "&aba=atendimento"));
    const aba = atend(page);
    const num = (slot: string) => page.locator(`[data-bloco="${slot}"] [data-bloco="atendimento-numero"]`);
    await expect(aba.getByRole("tab")).toHaveText(["Dia", "Semana", "Quinzena", "Mês"]);
    // Semana (o padrão): 7 vezes o dia.
    await expect(num("atendimento-conversas")).toHaveText("336");
    await expect(num("atendimento-ia")).toHaveText("75%");
    await expect(page.locator('[data-bloco="atendimento-ia"]')).toContainText("252 de 336 sem resposta humana, 84 com o time");
    await expect(num("atendimento-respostas")).toHaveText("1.470");
    await expect(page.locator('[data-bloco="atendimento-respostas"]')).toContainText("63 vezes passou o caso para o time");
    await expect(num("atendimento-tempo")).toHaveText("44s");
    await expect(page.locator('[data-bloco="atendimento-tempo"]')).toContainText("mediana de 40 atendimentos");

    // Motivos (lib/motivos.ts) e soluções (lib/solucoes.ts): a tabela é a visão em texto de cada gráfico.
    await expect(page.locator('[data-bloco="atendimento-motivos"]')).toContainText("65 pedidos de ajuda");
    await expect(page.locator('[data-slot="atendimento-pedidos-total"]')).toHaveText("65");
    const motivos = page.locator('[data-tabela="atendimento-motivos"] tr');
    await expect(motivos).toHaveCount(4);
    await expect(motivos.nth(0)).toContainText("Preço ou orçamento");
    await expect(motivos.nth(0)).toHaveAttribute("data-n", "28");
    await expect(motivos.nth(3)).toContainText("Sem motivo");
    const solucoes = page.locator('[data-tabela="atendimento-solucoes"] tr');
    await expect(solucoes.nth(0)).toContainText("Orientou IA");
    await expect(page.locator('[data-solucao="aberto"]')).toHaveAttribute("data-n", "1");
    await expect(page.locator('[data-solucao="sem"]')).toContainText("Fechados sem solução registrada");
    await expect(page.locator('[data-slot="atendimento-regras"]')).toHaveText("4 regras salvas para a IA.");

    // Trocar o período busca o outro recorte.
    await periodo(page, aba, "Dia");
    await expect(num("atendimento-conversas")).toHaveText("48");
    await expect(page.locator('[data-bloco="atendimento-conversas"]')).toContainText("últimas 24 horas");
    await periodo(page, aba, "Mês");
    await expect(num("atendimento-conversas")).toHaveText("1.440");
  });

  test("Atendimento: respostas da IA e do time ao longo do período, com balão e legenda", async ({ page }) => {
    await page.goto(detalhe(1, "&aba=atendimento"));
    const aba = atend(page);
    const bloco = aba.locator('[data-bloco="atendimento-movimento"]');
    const grafico = bloco.locator('[data-slot="chart"]');

    for (const [nome, colunas] of [
      ["Dia", 24],
      ["Semana", 7],
      ["Quinzena", 15],
      ["Mês", 30],
    ] as const) {
      await periodo(page, aba, nome);
      await expect(bloco.locator('[data-tabela="atendimento-movimento"] tbody tr')).toHaveCount(colunas);
    }

    await periodo(page, aba, "Semana");
    await expect(bloco.locator("h2")).toHaveText("Respostas por dia");
    await passarNaUltimaColuna(page, grafico);
    const balao = page.locator('[data-slot="chart-tooltip"]');
    await expect(balao).toBeVisible();
    const ultima = bloco.locator('[data-tabela="atendimento-movimento"] tbody tr').last();
    await expect(balao).toContainText(await ultima.locator("td").first().innerText());
    await expect(balao.locator('[data-serie="ia"]')).toContainText(String(await ultima.getAttribute("data-ia")));
    await expect(balao.locator('[data-serie="time"]')).toContainText(String(await ultima.getAttribute("data-time")));
    const total = Number(await ultima.getAttribute("data-ia")) + Number(await ultima.getAttribute("data-time"));
    await expect(balao.locator('[data-linha="total"]')).toHaveText(new RegExp(`Total\\s*${total}`));

    // A legenda soma cada série no período e identifica as duas (a cor nunca é o único canal).
    const legenda = bloco.locator('[data-slot="chart-legenda"]');
    await expect(legenda.locator('[data-serie="ia"]')).toContainText("IA");
    await expect(legenda.locator('[data-serie="time"]')).toContainText("Time");
    const linhas = bloco.locator('[data-tabela="atendimento-movimento"] tbody tr');
    const ia = await linhas.evaluateAll((els) => els.reduce((s, e) => s + Number(e.getAttribute("data-ia")), 0));
    expect(numero(await legenda.locator('[data-serie="ia"]').innerText().then((t) => t.replace(/\D*IA\s*/, "")))).toBe(ia);

    await periodo(page, aba, "Dia");
    await passarNaUltimaColuna(page, grafico);
    await expect(balao).toContainText(/\d{2}\/\d{2}, \d{2}h/);
    await expect(bloco.locator("h2")).toHaveText("Respostas por hora");
  });

  test("Atendimento: a rosca das soluções e as barras dos motivos têm balão, e a legenda traz número e fração", async ({ page }) => {
    await page.goto(detalhe(1, "&aba=atendimento"));
    const aba = atend(page);
    // Cada gráfico tem o próprio balão dentro dele (o do outro fica no DOM, sem conteúdo ativo).
    const balaoDe = (grafico: Locator) => grafico.locator('[data-slot="chart-tooltip"]');

    // Rosca: a primeira fatia (Orientou IA) começa no topo e vai para a direita.
    const rosca = aba.locator('[data-bloco="atendimento-solucoes"] [data-slot="chart"]');
    await rosca.scrollIntoViewIfNeeded();
    await expect(rosca.locator(".recharts-sector").first()).toBeVisible();
    await expect(rosca.locator(".recharts-sector")).toHaveCount(5);
    const c = (await rosca.boundingBox())!;
    const cx = c.x + c.width / 2;
    const cy = c.y + c.height / 2;
    const r = Math.min(c.width, c.height) / 2 * 0.8;
    await page.mouse.move(cx + r * Math.sin(Math.PI / 4), cy - r * Math.cos(Math.PI / 4));
    await expect(balaoDe(rosca)).toBeVisible();
    await expect(balaoDe(rosca)).toContainText("Orientou IA");
    await expect(balaoDe(rosca).locator('[data-linha="pedidos"]')).toContainText("28");
    await expect(balaoDe(rosca).locator('[data-linha="fracao"]')).toContainText("43%");
    const legenda = aba.locator('[data-bloco="atendimento-solucoes"] [data-slot="chart-legenda"]');
    await expect(legenda.locator("li")).toHaveCount(5);
    await expect(legenda.locator("li").first()).toContainText("Orientou IA");
    await expect(legenda.locator("li").first()).toContainText("28 (43%)");

    // Barras na horizontal: a primeira linha é o motivo mais frequente.
    await page.mouse.move(5, 5);
    const barras = aba.locator('[data-bloco="atendimento-motivos"] [data-slot="chart"]');
    await barras.scrollIntoViewIfNeeded();
    await expect(barras.locator(".recharts-bar-rectangle").first()).toBeAttached();
    await expect(barras.locator(".recharts-bar-rectangle")).toHaveCount(4);
    const b = (await barras.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + 22);
    await expect(balaoDe(barras)).toBeVisible();
    await expect(balaoDe(barras)).toContainText("Preço ou orçamento");
    await expect(balaoDe(barras).locator('[data-linha="pedidos"]')).toContainText("28");
    await expect(balaoDe(barras).locator('[data-linha="fracao"]')).toContainText("43%");
  });

  test("Atendimento sem movimento: sem medição e sem pedidos, nada inventado", async ({ page }) => {
    await page.goto(detalhe(6, "&aba=atendimento&vazio=1"));
    const aba = atend(page);
    await expect(page.locator('[data-bloco="atendimento-tempo"] [data-bloco="atendimento-numero"]')).toHaveText("Sem medição");
    await expect(page.locator('[data-bloco="atendimento-motivos"]')).toContainText("Nenhum pedido de ajuda no período");
    await expect(page.locator('[data-bloco="atendimento-solucoes"]')).toContainText("Nada a mostrar sem pedidos no período");
    await expect(aba.locator('[data-slot="atendimento-movimento-vazio"]')).toContainText("Nenhuma resposta no período");
    await expect(page.locator('[data-slot="atendimento-regras"]')).toHaveText("Nenhuma regra salva ainda.");
    await expect(aba.locator(".recharts-bar-rectangle, .recharts-sector")).toHaveCount(0);
  });

  for (const modo of ["light", "dark"] as const) {
    test(`os gráficos da central desenham no tema ${modo}, com a cor da marca e a tinta do tema`, async ({ page }) => {
      await page.context().addCookies([{ name: "theme", value: modo, url: "http://localhost" }]);
      await page.goto(detalhe(1, "&aba=uso"));
      const barra = uso(page).locator(".recharts-rectangle").first();
      await expect(barra).toBeAttached();
      // A coluna cresce na entrada; espera ela chegar a uma altura de verdade antes de medir.
      await expect.poll(async () => (await barra.boundingBox())?.height ?? 0).toBeGreaterThan(20);
      const marca = modo === "light" ? "rgb(107, 33, 232)" : "rgb(123, 53, 240)";
      const tinta = modo === "light" ? "rgb(110, 110, 110)" : "rgb(140, 140, 140)";
      const cores = await page.evaluate(() => {
        const barra = document.querySelector('[data-slot="central-grafico"] .recharts-rectangle');
        const eixo = document.querySelector('[data-slot="central-grafico"] .recharts-cartesian-axis-tick-value');
        const celula = document.querySelector('[data-slot="mapa-celula"][data-nivel="4"]');
        const rect = barra!.getBoundingClientRect();
        return {
          barra: getComputedStyle(barra!).fill,
          alturaDaBarra: rect.height,
          eixo: getComputedStyle(eixo!).fill,
          celula: getComputedStyle(celula!).backgroundColor,
        };
      });
      expect(cores.barra).toBe(marca);
      expect(cores.alturaDaBarra).toBeGreaterThan(4);
      // O eixo usa a tinta terciária do tema (nunca a cor da série); o pico da grade é a marca cheia.
      expect(cores.eixo).toBe(tinta);
      expect(cores.celula).toBe(marca);

      await page.goto(detalhe(1, "&aba=atendimento"));
      const atendimento = atend(page);
      const sectors = atendimento.locator('[data-bloco="atendimento-solucoes"] .recharts-sector');
      await expect(sectors).toHaveCount(5);
      const fills = () => sectors.evaluateAll((els) => els.map((e) => getComputedStyle(e).fill));
      // A rosca entra animada (por um instante a fatia ainda não tem cor): espera medir direito. A primeira
      // fatia (Orientou IA) é a marca cheia; as outras são degraus e cinzas, todas visíveis e diferentes.
      await expect
        .poll(async () => {
          const f = await fills();
          return f[0] === marca && f.every((x) => x !== "" && x !== "none") && new Set(f).size === f.length;
        })
        .toBe(true);
    });
  }

  for (const largura of [375, 1440]) {
    test(`em ${largura}px as abas Uso de IA e Atendimento cabem na tela, em todos os períodos, sem rolagem de lado`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: largura === 375 ? 812 : 900 });
      for (const aba of ["uso", "atendimento"] as const) {
        await page.goto(detalhe(1, `&aba=${aba}`));
        const raiz = page.locator(`[data-slot="central-aba-${aba}"]`);
        await expect(raiz.locator(".recharts-surface").first()).toBeVisible();
        for (const nome of ["Dia", "Semana", "Quinzena", "Mês"] as const) {
          await periodo(page, raiz, nome);
          await page.waitForTimeout(150);
          const medidas = await page.evaluate(() => ({
            pagina: document.documentElement.scrollWidth,
            janela: window.innerWidth,
            // Nenhum gráfico passa da própria caixa.
            graficos: [...document.querySelectorAll('[data-slot="chart"]')].map((g) => {
              const filho = g.querySelector(".recharts-wrapper");
              return filho ? filho.getBoundingClientRect().right - g.getBoundingClientRect().right : 0;
            }),
          }));
          expect(medidas.pagina, `${aba} ${nome}`).toBeLessThanOrEqual(medidas.janela);
          for (const sobra of medidas.graficos) expect(sobra, `${aba} ${nome}`).toBeLessThanOrEqual(1);
        }
        // O gráfico tem largura de verdade (não ficou em zero dentro da aba).
        const caixa = (await raiz.locator('[data-slot="chart"]').first().boundingBox())!;
        expect(caixa.width, aba).toBeGreaterThan(largura === 375 ? 200 : 400);
      }
    });
  }

  test("as abas carregam sob demanda e a troca não perde a tela", async ({ page }) => {
    await page.goto(detalhe(1));
    await expect(page.locator('[data-slot="central-aba-uso"]')).toHaveCount(0);
    await page.getByRole("tab", { name: "Uso de IA" }).click();
    await expect(page.locator('[data-slot="central-aba-uso"]')).toBeVisible();
    await page.getByRole("tab", { name: "Atendimento" }).click();
    await expect(page.locator('[data-slot="central-aba-atendimento"]')).toBeVisible();
    await expect(page.locator('[data-slot="central-aba-uso"]')).toBeHidden();
    await page.getByRole("tab", { name: "Visão geral" }).click();
    await expect(page.locator('[data-slot="central-aba-visao"]')).toBeVisible();
  });

  test("nenhum travessão em nenhuma aba", async ({ page }) => {
    for (const aba of ["visao", "uso", "atendimento"]) {
      await page.goto(detalhe(3, `&aba=${aba}`));
      await page.waitForTimeout(500);
      expect(DASH.test(await page.locator("body").innerText()), aba).toBe(false);
    }
  });

  test("no celular o detalhe cabe na tela, sem rolagem de lado", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const aba of ["visao", "uso", "atendimento"]) {
      await page.goto(detalhe(3, `&aba=${aba}`));
      await expect(page.locator('[data-slot="central-detalhe-nome"]')).toBeVisible();
      await page.waitForTimeout(400);
      const largura = await page.evaluate(() => ({
        pagina: document.documentElement.scrollWidth,
        janela: window.innerWidth,
      }));
      expect(largura.pagina, aba).toBeLessThanOrEqual(largura.janela);
    }
  });
});

test.describe("Central: quem não é admin, sem login", () => {
  // Sem sessão ninguém está em ADMIN_USER_IDS: o proxy responde 404 ao /admin e a
  // toda rota da central, sem revelar que existem. `/clientes` sem sessão segue o
  // caminho de qualquer página do app (vai ao login), nunca 404.
  test("/admin e as rotas da central respondem 404", async ({ request }) => {
    const id = ID(1);
    expect((await request.get("/admin", { maxRedirects: 0 })).status()).toBe(404);
    for (const rota of [
      "/api/admin/empresas",
      `/api/admin/empresas/${id}/uso`,
      `/api/admin/empresas/${id}/atendimento`,
      `/api/admin/empresas/${id}/whatsapp`,
    ]) {
      expect((await request.get(rota, { maxRedirects: 0 })).status(), rota).toBe(404);
    }
    const editar = await request.put(`/api/admin/empresas/${id}/limite`, { data: { limite: 1 }, maxRedirects: 0 });
    expect(editar.status()).toBe(404);
  });

  test("/clientes não responde 404, nem revela a central", async ({ request }) => {
    for (const rota of ["/clientes", `/clientes/${ID(1)}`, "/clientes/123"]) {
      const res = await request.get(rota, { maxRedirects: 0 });
      expect(res.status(), rota).toBe(307);
      expect(res.headers()["location"], rota).toContain("/login");
    }
  });
});

test.describe("Faixa do teto de IA e o nome Contatos", () => {
  test("a faixa aparece com a IA parada e some sem ela", async ({ page }) => {
    await page.goto("/design/contatos?ia=parada");
    const faixa = page.locator("[data-limite-ia]");
    await expect(faixa).toBeVisible();
    await expect(faixa).toContainText("Limite de IA do mês atingido");
    await expect(faixa).toContainText("o time segue atendendo");
    expect(DASH.test(await faixa.innerText())).toBe(false);
    await page.goto("/design/contatos");
    await expect(page.locator("[data-limite-ia]")).toHaveCount(0);
  });

  test("o menu e a tela chamam os contatos de Contatos, em /contatos", async ({ page }) => {
    await page.goto("/design/contatos");
    await expect(page.getByRole("heading", { name: "Contatos" })).toBeVisible();
    const menu = page.getByRole("link", { name: "Contatos" }).first();
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("href", "/contatos");
    await expect(page.locator('[data-slot="clientes-novo"]')).toHaveText("Novo contato");
    await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Clientes" })).toHaveCount(0);
  });
});
