import { test, expect } from "@playwright/test";

// Resumo de valor percebido. Roda sem login em /design/valor (liberado pelo
// proxy em dev), com mock nos dois estados: com e sem horário configurado.

test.describe("Valor percebido (/design/valor)", () => {
  test("mostra as frases com o número em destaque", async ({ page }) => {
    await page.goto("/design/valor");
    await expect(
      page.getByRole("heading", { name: "O que a IA fez por você" }).first()
    ).toBeVisible();
    // O número mais forte do item: trabalho que humano nenhum teria feito.
    await expect(page.getByText("213", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/mensagens respondidas fora do horário de atendimento/).first()
    ).toBeVisible();
    // Período aparece dentro da frase, não só no título: ela vai virar material
    // de venda fora do produto, então precisa se sustentar sozinha.
    await expect(page.getByText(/em julho de 2026/).first()).toBeVisible();
    // Pico mostra quando ele estaria perdendo cliente.
    await expect(page.getByText("17h", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/pico de mensagens é domingo/).first()).toBeVisible();
  });

  test("a frase mais forte é manchete, com o acumulado embaixo", async ({
    page,
  }) => {
    await page.goto("/design/valor");

    // Manchete: seis blocos iguais não têm hierarquia, e sem hierarquia a pessoa
    // não lê nenhum. A frase mais forte fica em superfície da marca.
    const manchete = page.locator("[data-manchete]").first();
    await expect(manchete).toContainText("213");
    await expect(manchete).toContainText(
      /mensagens respondidas fora do horário de atendimento/
    );
    // O acumulado é o que trava a mão de quem ia cancelar: "213 no mês" convence,
    // "1.876 desde o início" é outra conversa. Vai junto da manchete, não solto.
    await expect(manchete).toContainText("1.876");
    await expect(manchete).toContainText(/desde o início desta conta/);

    // Contexto que já existe no resumo (mensagens recebidas), não métrica nova.
    // Escopado à primeira seção: o mock sem horário herda o mesmo 486.
    await expect(
      page.locator("section").first().getByText(/486 mensagens recebidas/)
    ).toBeVisible();
  });

  test("mês fechado vazio cai no acumulado em vez de mostrar tela vazia", async ({
    page,
  }) => {
    await page.goto("/design/valor");
    // Conta nova não tem mês fechado, e é justo quando o cliente mais duvida da
    // ferramenta. A manchete vira o acumulado, e o rótulo do período vai junto:
    // as frases dizem "desde o início", então o título não pode dizer julho.
    const secao = page
      .locator("section")
      .filter({ hasText: /desde o início, sem ninguém do time/ });
    await expect(secao.locator("[data-manchete]")).toContainText("1876");
    // E o estado vazio não aparece junto do acumulado.
    await expect(secao.getByText("Ainda sem movimento no período")).toHaveCount(0);
  });

  test("sem horário configurado, omite o número em vez de estimar", async ({
    page,
  }) => {
    await page.goto("/design/valor");
    await expect(page.getByText("Falta o horário de atendimento")).toBeVisible();
    // ⚠️ ATUALIZADO EM 21/09/2026: o aviso foi resumido de tres frases para uma,
    // a pedido do dono. O que o teste afirma continua sendo o mesmo e e o que
    // importa: a tela declara que NAO ESTIMA, em vez de mostrar numero
    // aproximado. Se essa promessa cair, o resumo inteiro perde o eixo.
    await expect(page.getByText(/não estimamos/)).toBeVisible();
    // A regra que não se negocia: inventar número quebra a confiança, que é o
    // eixo de competição do produto. Só a seção com horário tem o 213.
    await expect(page.getByText("213", { exact: true })).toHaveCount(1);
    // Sem horário a manchete é a próxima frase mais forte, e não um buraco.
    const semHorario = page
      .locator("section")
      .filter({ hasText: "Falta o horário de atendimento" });
    await expect(semHorario.locator("[data-manchete]")).toContainText(
      /fim de semana ou feriado/
    );
  });

  test("não usa travessão em texto visível", async ({ page }) => {
    await page.goto("/design/valor");
    const texto = await page.locator("body").innerText();
    expect(texto).not.toContain("—");
    expect(texto).not.toContain("–");
  });
});

test.describe("Antídoto do cancelamento (/design/cancelamento)", () => {
  test("mostra o acumulado antes de confirmar o cancelamento", async ({ page }) => {
    await page.goto("/design/cancelamento");
    await page.getByRole("button", { name: "Cancelar assinatura" }).click();

    // O acumulado aparece ANTES do campo de motivo: é o único momento em que a
    // pessoa para para olhar o que a ferramenta fez por ela.
    await expect(page.getByText("O que a IA já fez nesta conta")).toBeVisible();
    await expect(page.getByText("1876", { exact: true })).toBeVisible();
    await expect(page.getByText(/desde o início/).first()).toBeVisible();
    await expect(page.getByLabel(/O que motivou/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirmar cancelamento" })
    ).toBeVisible();
  });

  test("cancelar não fica preso atrás do acumulado", async ({ page }) => {
    await page.goto("/design/cancelamento");
    await page.getByRole("button", { name: "Cancelar assinatura" }).click();
    // Motivo é opcional e confirmar não depende dele: segurar quem já decidiu
    // sair só gera reclamação.
    await expect(
      page.getByRole("button", { name: "Confirmar cancelamento" })
    ).toBeEnabled();
    await expect(page.getByRole("button", { name: "Voltar" })).toBeVisible();
  });
});
