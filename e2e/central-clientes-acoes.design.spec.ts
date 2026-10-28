import { test, expect, type Page } from "@playwright/test";

// A CENTRAL "CLIENTES", ENTREGA 2, NA TELA (previews com dados falsos; as ações
// validam e não gravam): os filtros novos da lista (e nenhum aviso do beta), a aba
// Financeiro (ids mascarados, cobranças, ações com as razões de estarem
// desabilitadas), a aba Ações (zona de perigo, desativar, exportar, apagar com o
// nome digitado) e a tela da conta desativada. O comportamento com o banco de
// verdade está em `e2e/central-clientes-conta.serial.spec.ts` (login).

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const detalhe = (n: number, aba: string) => `/design/clientes/detalhe?cliente=${ID(n)}&aba=${aba}`;
const TRACO = new RegExp("[\\u2013\\u2014]");

async function semTraco(page: Page) {
  expect(TRACO.test(await page.locator("body").innerText())).toBe(false);
}

async function semRolagemLateral(page: Page) {
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra).toBeLessThanOrEqual(0);
}

test.describe("Central: filtros novos e nenhum aviso do beta (/design/clientes)", () => {
  test("a chave do beta saiu (15/10/2026): a lista não fala mais dela", async ({ page }) => {
    await page.goto("/design/clientes");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    await expect(page.locator('[data-slot="central-aviso-beta"]')).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toMatch(/beta aberto/i);
    await semTraco(page);
  });

  test("vitalício, bloqueado e desativado têm selo e filtro próprios", async ({ page }) => {
    await page.goto("/design/clientes");
    const itens = page.locator('[data-slot="central-cliente"]');
    // O filtro é UM botão de ícone ao lado da busca, que abre a lista de situações.
    const escolher = async (nome: string) => {
      await page.locator('[data-slot="central-filtro"]').click();
      await page.getByRole("menuitem", { name: nome, exact: true }).click();
      await expect(page.getByRole("menu")).toHaveCount(0);
    };
    const chip = (nome: string) => ({ click: () => escolher(nome) });

    await chip("Vitalícios").click();
    await expect(itens).toHaveCount(1);
    await expect(itens.locator('[data-slot="admin-situacao"]')).toHaveText("Vitalício");
    await expect(itens).toContainText("Ateliê Lumière");

    await chip("Bloqueados").click();
    await expect(itens).toHaveCount(1);
    await expect(itens.locator('[data-slot="admin-situacao"]')).toHaveText("Bloqueado");

    await chip("Desativados").click();
    await expect(itens).toHaveCount(1);
    await expect(itens.locator('[data-slot="admin-situacao"]')).toHaveText("Desativado");
    // Desativado não pede atenção: nenhum alerta.
    await expect(itens.locator('[data-slot="admin-alerta"]')).toHaveCount(0);

    // "Em teste" não leva o vitalício nem o desativado, que estão em teste por baixo.
    await chip("Em teste").click();
    await expect(itens).toHaveCount(5);
    await expect(page.locator('[data-slot="central-cliente"]', { hasText: "Ateliê Lumière" })).toHaveCount(0);
    await expect(page.locator('[data-slot="central-cliente"]', { hasText: "Academia Força" })).toHaveCount(0);
  });
});

test.describe("Central: aba Financeiro (/design/clientes/detalhe?aba=financeiro)", () => {
  test("ids do provedor mascarados, cobranças do Asaas e as ações travadas com a razão escrita", async ({ page }) => {
    // Estúdio Aurora: assinatura no Asaas, pagamento atrasado na carência.
    await page.goto(detalhe(7, "financeiro"));
    const aba = page.locator('[data-slot="central-aba-financeiro"]');
    await expect(aba).toBeVisible();
    await expect(aba.locator('[data-slot="financeiro-situacao"]')).toContainText("Atrasado");
    await expect(aba.locator('[data-slot="financeiro-plano"]')).toHaveText("Profissional");
    await expect(aba.locator('[data-slot="financeiro-provedor"]')).toHaveText("Asaas");
    await expect(aba.locator('[data-slot="financeiro-assinatura-gateway"]')).toHaveText("•••• aur1");
    await expect(aba.locator('[data-slot="financeiro-cliente-gateway"]')).toHaveText("•••• rora");
    expect(await page.content()).not.toContain("sub_00000000aur1");
    expect(await page.content()).not.toContain("cus_000000aurora");

    const cobrancas = aba.locator('[data-slot="financeiro-cobranca"]');
    await expect(cobrancas).toHaveCount(3);
    await expect(cobrancas.first()).toHaveAttribute("data-status", "OVERDUE");
    await expect(cobrancas.first()).toContainText("Vencida");
    await expect(cobrancas.first()).toContainText("R$ 347");

    // Com assinatura no Asaas: nem vitalício nem troca de plano por aqui; não está em teste.
    // O vitalício mora no controle "Estender teste", e o botão de remover só aparece num vitalício.
    await expect(aba.locator('[data-slot="financeiro-vitalicio-botao"]')).toHaveCount(0);
    // Ação travada NÃO vira botão apagado: o botão nem existe, e a razão aparece numa linha curta.
    await expect(aba.locator('[data-slot="financeiro-plano-botao"]')).toHaveCount(0);
    await expect(aba.locator('[data-slot="financeiro-teste-botao"]')).toHaveCount(0);
    // A razão escrita é a MESMA resposta da rota (acoesDoFinanceiro + RESPOSTA_DO_SQL), e cada motivo UMA vez:
    // "Estender o teste" tem o seu, e "Marcar como vitalício" e "Mudar plano" dividem o da assinatura.
    const recusas = aba.locator('[data-slot="financeiro-recusa"]');
    await expect(recusas).toHaveCount(2);
    await expect(recusas.nth(0)).toHaveAttribute("data-recusa", "nao_em_teste");
    await expect(recusas.nth(0)).toHaveText("Estender o teste: Só dá para estender o teste de quem está em teste.");
    await expect(recusas.nth(1)).toHaveAttribute("data-recusa", "tem_assinatura");
    await expect(recusas.nth(1)).toHaveAttribute("data-acoes", "Marcar como vitalício|Mudar plano");
    await expect(recusas.nth(1)).toContainText("Marcar como vitalício e mudar plano: Este cliente tem assinatura no Asaas.");
    expect((await aba.locator('[data-bloco="financeiro-acoes"]').innerText()).split("tem assinatura no Asaas").length - 1).toBe(1);
    // Provedor com nome de verdade, nunca a chave crua.
    await expect(aba.locator('[data-slot="financeiro-tile-cobranca-valor"]')).toHaveText("Asaas");
    await expect(aba.locator('[data-slot="financeiro-provedor"]')).toHaveText("Asaas");
    await expect(aba.locator('[data-slot="financeiro-bloqueio-botao"]')).toHaveText("Bloquear acesso");
    await semTraco(page);
  });

  test("estender o teste: 7 dias, 15 dias, Personalizado e Vitalício num controle só", async ({ page }) => {
    // Clínica Sorriso: em teste com prazo.
    await page.goto(detalhe(2, "financeiro"));
    const botao = page.locator('[data-slot="financeiro-teste-botao"]');
    await expect(botao).toBeEnabled();
    await botao.click();
    const dialogo = page.locator('[data-slot="dialogo-teste"]');
    await expect(dialogo).toBeVisible();
    const opcoes = dialogo.locator("[data-opcao]");
    await expect(opcoes).toHaveText(["7 dias", "15 dias", "Personalizado", "Vitalício"]);
    const confirmar = dialogo.locator('[data-slot="central-acao-confirmar"]');
    await expect(confirmar).toBeDisabled();
    // Um prazo pronto confirma direto.
    await dialogo.locator('[data-opcao="15"]').click();
    await expect(dialogo.locator('[data-opcao="15"]')).toHaveAttribute("aria-pressed", "true");
    await expect(confirmar).toBeEnabled();
    await expect(confirmar).toHaveText("Estender");
    // Vitalício: a mesma ação de sempre, com o texto dela.
    await dialogo.locator('[data-opcao="vitalicio"]').click();
    await expect(dialogo).toContainText("nunca cobrado");
    await expect(confirmar).toHaveText("Marcar vitalício");
    // Personalizado: só com dias inteiros.
    await expect(dialogo.locator('[data-campo="dias"]')).toHaveCount(0);
    await dialogo.locator('[data-opcao="personalizado"]').click();
    await expect(confirmar).toBeDisabled();
    await dialogo.locator('[data-campo="dias"]').fill("0");
    await expect(confirmar).toBeDisabled();
    await dialogo.locator('[data-campo="dias"]').fill("2,5");
    await expect(confirmar).toBeDisabled();
    await dialogo.locator('[data-campo="dias"]').fill("7");
    await expect(confirmar).toBeEnabled();
    await confirmar.click();
    await expect(dialogo).toHaveCount(0);
    await expect(page.locator('[data-slot="central-recado"]')).toHaveText("Preview: nada foi gravado.");
  });

  test("mudar o plano: só os planos de PLANS, e o mesmo plano não confirma", async ({ page }) => {
    // Barbearia do Zé: plano Essencial, sem assinatura.
    await page.goto(detalhe(1, "financeiro"));
    await page.locator('[data-slot="financeiro-plano-botao"]').click();
    const dialogo = page.locator('[data-slot="dialogo-plano"]');
    const planos = dialogo.locator("[data-plano]");
    await expect(planos).toHaveCount(3);
    await expect(dialogo.locator('[data-plano="essencial"]')).toHaveAttribute("aria-pressed", "true");
    const confirmar = dialogo.locator('[data-slot="central-acao-confirmar"]');
    await expect(confirmar).toBeDisabled();
    await dialogo.locator('[data-plano="profissional"]').click();
    await expect(confirmar).toBeEnabled();
  });

  test("vitalício: marcar pelo Estender teste e remover pedem confirmação", async ({ page }) => {
    await page.goto(detalhe(18, "financeiro"));
    const aba = page.locator('[data-slot="central-aba-financeiro"]');
    await expect(aba.locator('[data-slot="financeiro-situacao"]')).toContainText("Vitalício");
    await expect(aba.locator('[data-slot="financeiro-vitalicio-botao"]')).toHaveText("Remover vitalício");
    // Vitalício não tem teste a estender (nem o que marcar de novo).
    await expect(aba.locator('[data-slot="financeiro-teste-botao"]')).toHaveCount(0);
    await expect(aba.locator('[data-slot="financeiro-recusa"]')).toHaveAttribute("data-recusa", "vitalicio");
    await aba.locator('[data-slot="financeiro-vitalicio-botao"]').click();
    const remover = page.locator('[data-slot="dialogo-vitalicio"]');
    await expect(remover).toContainText("volta a seguir a assinatura gravada");
    await remover.locator('[data-slot="central-acao-confirmar"]').click();
    await expect(page.locator('[data-slot="central-recado"]')).toHaveText("Preview: nada foi gravado.");

    // Barbearia do Zé (sem assinatura): o Vitalício está no controle do teste.
    await page.goto(detalhe(1, "financeiro"));
    await expect(page.locator('[data-slot="financeiro-vitalicio-botao"]')).toHaveCount(0);
    await page.locator('[data-slot="financeiro-teste-botao"]').click();
    const dialogo = page.locator('[data-slot="dialogo-teste"]');
    await dialogo.locator('[data-opcao="vitalicio"]').click();
    await expect(dialogo).toContainText("nunca cobrado");
    await dialogo.locator('[data-slot="central-acao-confirmar"]').click();
    await expect(page.locator('[data-slot="central-recado"]')).toHaveText("Preview: nada foi gravado.");
  });

  test("no celular, sem rolagem lateral", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(detalhe(7, "financeiro"));
    await expect(page.locator('[data-slot="central-aba-financeiro"]')).toBeVisible();
    await semRolagemLateral(page);
  });
});

test.describe("Central: aba Ações, a zona de perigo (/design/clientes/detalhe?aba=acoes)", () => {
  test("cliente ativo: desativar primeiro, e apagar de vez não aparece", async ({ page }) => {
    await page.goto(detalhe(1, "acoes"));
    const aba = page.locator('[data-slot="central-aba-acoes"]');
    await expect(aba.locator('[data-slot="acoes-zona-de-perigo"]')).toBeVisible();
    await expect(aba.locator('[data-slot="acoes-desativar-botao"]')).toHaveText("Desativar cliente");
    await expect(aba.locator('[data-slot="acoes-apagar-bloqueado"]')).toContainText("Desative primeiro");
    await expect(aba.locator('[data-slot="acoes-apagar-botao"]')).toHaveCount(0);

    await aba.locator('[data-slot="acoes-desativar-botao"]').click();
    const dialogo = page.locator('[data-slot="dialogo-desativar"]');
    await expect(dialogo).toContainText("Nada é apagado");
    await dialogo.locator('[data-slot="central-acao-confirmar"]').click();
    await expect(page.locator('[data-slot="central-recado"]')).toHaveText("Preview: nada foi gravado.");
    await semTraco(page);
  });

  test("cliente desativado: reativar, exportar e apagar só com o nome digitado igual", async ({ page }) => {
    await page.goto(detalhe(20, "acoes"));
    const aba = page.locator('[data-slot="central-aba-acoes"]');
    await expect(aba.locator('[data-slot="acoes-desativar-botao"]')).toHaveText("Reativar cliente");
    await expect(aba.locator('[data-slot="acoes-estado"]')).toContainText("Nada foi apagado");
    await expect(aba.locator('[data-slot="acoes-exportar"]')).toContainText("Exportar dados");

    await aba.locator('[data-slot="acoes-apagar-botao"]').click();
    const dialogo = page.locator('[data-slot="dialogo-apagar"]');
    await expect(dialogo.locator('[data-slot="dialogo-apagar-nome"]')).toHaveText("Academia Força");
    const confirmar = dialogo.locator('[data-slot="central-acao-confirmar"]');
    const campo = dialogo.locator('[data-campo="nome-do-cliente"]');
    await expect(confirmar).toBeDisabled();
    await campo.fill("Academia");
    await expect(confirmar).toBeDisabled();
    await campo.fill("academia força");
    await expect(confirmar).toBeDisabled();
    await campo.fill("Academia Força");
    await expect(confirmar).toBeEnabled();
    await confirmar.click();
    await expect(page.locator('[data-slot="central-apagado"]')).toContainText("Preview: nada foi apagado");
    await expect(page.getByRole("link", { name: "Voltar para Clientes" })).toHaveAttribute("href", "/design/clientes");
  });

  test("no celular, sem rolagem lateral", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(detalhe(20, "acoes"));
    await expect(page.locator('[data-slot="central-aba-acoes"]')).toBeVisible();
    await semRolagemLateral(page);
  });
});

test.describe("A tela da conta desativada (/design/conta-desativada)", () => {
  test("diz o que aconteceu, que nada foi apagado, e deixa sair", async ({ page }) => {
    await page.goto("/design/conta-desativada");
    const tela = page.locator('[data-slot="conta-desativada"]');
    await expect(tela.getByRole("heading", { name: "Conta desativada" })).toBeVisible();
    await expect(tela.locator('[data-slot="conta-desativada-nome"]')).toHaveText("Barbearia do Zé");
    await expect(tela).toContainText("Nenhuma conversa nem contato foi apagado");
    await expect(tela.getByRole("button", { name: "Sair" })).toBeVisible();
    await semTraco(page);
  });

  test("anônimo: a página de verdade manda ao login, as rotas novas da central dão 404", async ({ request }) => {
    const r = await request.get("/conta-desativada", { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(r.status());
    expect(r.headers()["location"] ?? "").toContain("/login");
    for (const [metodo, rota] of [
      ["PUT", "conta"],
      ["GET", "cobrancas"],
      ["GET", "pedidos"],
      ["GET", "exportar"],
      ["POST", "apagar"],
    ] as const) {
      const res = await request.fetch(`/api/admin/empresas/${ID(1)}/${rota}`, { method: metodo, data: {} });
      expect(res.status(), `${metodo} ${rota}`).toBe(404);
    }
  });
});
