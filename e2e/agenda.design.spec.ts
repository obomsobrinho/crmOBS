import { test, expect, type Page } from "@playwright/test";

// AGENDA PRÓPRIA (docs/plano-agenda.md, revisão do dono de 28/10/2026): a tela
// de verdade em /design/agenda (grade semanal) e /design/agenda/configuracoes,
// com a fonte em MEMÓRIA (sem banco). Prova layout, textos e o fluxo da tela;
// o banco (sobreposição recusada, RLS, etapa do funil) só com a migration.

async function abrir(page: Page, query = "") {
  await page.goto(`/design/agenda${query}`);
  await expect(page.getByRole("heading", { name: "Agenda", level: 1 })).toBeVisible();
  // A grade abre rolada para o horário de atendimento: espera essa rolagem antes de clicar.
  await expect(page.locator('[data-agenda="grade"][data-centralizada="sim"]')).toHaveCount(1);
}

test.describe("Agenda: grade semanal (dados em memória)", () => {
  test("sete colunas, hoje destacado, sem contador, cartões e bloqueio; a grade enche a altura", async ({ page }) => {
    await abrir(page);
    await expect(page.locator('[data-agenda="cabecalho-dia"]')).toHaveCount(7);
    await expect(page.locator('[data-agenda="cabecalho-dia"][data-hoje="sim"]')).toHaveCount(1);
    await expect(page.locator('[data-agenda="contador"]')).toHaveCount(0);
    // A grade ocupa a altura toda: nada sobra embaixo da última hora.
    const area = await page.locator('[data-agenda="grade"]').boundingBox();
    const coluna = await page.locator('[data-agenda="coluna"]').first().boundingBox();
    expect(coluna!.height).toBeGreaterThanOrEqual(area!.height - 2);
    await expect(page.locator('[data-agenda="cartao"]').first()).toBeVisible();
    await expect(page.locator('[data-agenda="bloqueio"]').first()).toContainText("Almoço");
    // Cancelado não aparece na grade.
    await expect(page.locator('[data-agenda="cartao"]', { hasText: "Rafael Souza" })).toHaveCount(0);
  });

  test("minicalendário: a semana exibida em destaque, clicar leva a grade para outra semana", async ({ page }) => {
    await abrir(page);
    const exibida = page.locator('[data-agenda="mini-semana"][data-exibida="sim"]');
    await expect(exibida).toHaveCount(1);
    const antes = await exibida.first().textContent();
    await page.getByRole("button", { name: "Próxima semana" }).click();
    await expect(exibida.first()).not.toHaveText(antes ?? "");
    await expect(page.locator('[data-agenda="cabecalho-dia"][data-hoje="sim"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Hoje" }).click();
    await expect(page.locator('[data-agenda="cabecalho-dia"][data-hoje="sim"]')).toHaveCount(1);
  });

  test("clique no horário abre o detalhe com contato, serviço, do que se trata e as ações", async ({ page }) => {
    await abrir(page);
    await page.locator('[data-agenda="cartao"]', { hasText: "Juliana Prado" }).click();
    const detalhe = page.locator('[data-agenda="detalhe"]');
    await expect(detalhe).toContainText("Juliana Prado");
    await expect(detalhe).toContainText("Exame de vista");
    await expect(detalhe).toContainText("multifocais");
    await expect(detalhe).toContainText("(11)");
    await expect(detalhe.getByRole("button", { name: "Remarcar" })).toBeVisible();
    await detalhe.getByRole("button", { name: "Cancelar" }).click();
    await page.locator('[data-agenda="cancelar"]').getByRole("button", { name: "Cancelar horário" }).click();
    await expect(page.locator('[data-agenda="cartao"]', { hasText: "Juliana Prado" })).toHaveCount(0);
  });

  test("marcar pelo time: só livres; fora do expediente aparece quando pedido", async ({ page }) => {
    await abrir(page);
    await page.getByRole("button", { name: "Marcar horário" }).click();
    const d = page.locator('[data-agenda="marcar"]');
    // Contato existente pela busca (no app, no servidor, com limite).
    await d.getByLabel("Buscar contato").fill("jul");
    await d.locator('[data-agenda="resultados-contato"]').getByRole("button", { name: /Juliana Prado/ }).click();
    await expect(d.locator('[data-agenda="contato-escolhido"]')).toContainText("Juliana Prado");
    const amanha = await page.evaluate(() =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + 86_400_000))
    );
    await d.getByLabel("Dia").fill(amanha);
    const horarios = d.locator('[data-agenda="horarios"]');
    await expect(horarios.locator("button").first()).toBeVisible();
    await expect(horarios).not.toContainText("12:00");
    const dentro = await horarios.locator("button").count();
    await d.getByText("Mostrar horários fora do expediente").click();
    await expect.poll(() => horarios.locator("button").count()).toBeGreaterThan(dentro);
    await horarios.locator("button").first().click();
    await d.getByRole("button", { name: "Marcar", exact: true }).click();
    await expect(d).toBeHidden();
  });

  test("atendente não vê a engrenagem; estados vazio e antes da migration", async ({ page }) => {
    await abrir(page, "?papel=atendente");
    await expect(page.getByRole("link", { name: "Configurações da agenda" })).toHaveCount(0);
    await abrir(page, "?vazio=1");
    await expect(page.locator('[data-agenda="cartao"]')).toHaveCount(0);
    await page.goto("/design/agenda?indisponivel=1");
    await expect(page.locator('[data-agenda="indisponivel"]')).toContainText("Agenda ainda não disponível");
  });

  test("nenhum texto com travessão", async ({ page }) => {
    await abrir(page);
    expect(await page.locator("body").innerText()).not.toMatch(/[–—]/);
  });
});

test.describe("Agenda: configurações", () => {
  test("ativa abre a configuração; desligada esconde e o menu perde o item", async ({ page }) => {
    await page.goto("/design/agenda/configuracoes");
    await expect(page.locator('[data-agenda="config-aberta"]')).toBeVisible();
    await expect(page.locator('[data-agenda="horario-agenda"]')).toBeVisible();
    await page.getByLabel("Agenda ativa").click();
    await expect(page.locator('[data-agenda="config-aberta"]')).toHaveCount(0);
    await expect(page.locator('[data-agenda="desligada"]')).toContainText("some do menu");
    await page.goto("/design/agenda/configuracoes?desligada=1");
    await expect(page.locator('[data-slot="rail-itens"]').getByRole("link", { name: "Agenda" })).toHaveCount(0);
  });

  test("intervalo mostra a nota; início tem as 3 opções; antecedência explica", async ({ page }) => {
    await page.goto("/design/agenda/configuracoes");
    await expect(page.locator('[data-agenda="nota-intervalo"]')).toHaveCount(0);
    await page.getByLabel("Intervalo entre horários").click();
    await page.getByRole("option", { name: "10 min" }).click();
    await expect(page.locator('[data-agenda="nota-intervalo"]')).toContainText("O intervalo de 10 min entre horários já entra na conta.");
    await page.getByLabel("Os horários começam").click();
    await expect(page.getByRole("option")).toHaveCount(3);
    await expect(page.getByRole("option", { name: /Logo após o anterior/ })).toContainText("8h, 8h40, 9h20");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-agenda="texto-antecedencia"]')).toContainText("pelo menos 2h de antecedência");
  });

  test("serviço sem nome não salva; com um serviço a mais salva", async ({ page }) => {
    await page.goto("/design/agenda/configuracoes");
    await page.getByRole("button", { name: "Adicionar serviço" }).click();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator('[data-agenda="configuracoes"]').getByRole("alert")).toContainText("Todo serviço precisa de nome");
    await page.getByLabel("Nome do serviço 4").fill("Retorno");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator('[data-agenda="configuracoes"]').getByRole("status")).toContainText("Salvo");
  });
});

test.describe("Agenda: marcar com contato novo e campos", () => {
  test("sem achar na busca, segue como contato novo com o telefone já preenchido", async ({ page }) => {
    await abrir(page);
    await page.getByRole("button", { name: "Marcar horário" }).click();
    const d = page.locator('[data-agenda="marcar"]');
    await d.getByLabel("Buscar contato").fill("11 92020");
    await expect(d.locator('[data-agenda="resultados-contato"]')).toContainText("Nenhum contato encontrado");
    await d.getByRole("button", { name: "Contato novo" }).click();
    await expect(d.getByLabel("WhatsApp do contato")).toHaveValue("11 92020");
  });

  test("serviço e data com a mesma altura e largura", async ({ page }) => {
    await abrir(page);
    await page.getByRole("button", { name: "Marcar horário" }).click();
    const d = page.locator('[data-agenda="marcar"]');
    const s = (await d.getByLabel("Serviço").boundingBox())!;
    const t = (await d.getByLabel("Dia").boundingBox())!;
    expect(Math.abs(s.height - t.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.width - t.width)).toBeLessThanOrEqual(1);
  });
});

test.describe("Agenda: dias e horários próprios", () => {
  test("editáveis, com o botão de copiar o horário de atendimento", async ({ page }) => {
    await page.goto("/design/agenda/configuracoes");
    const bloco = page.locator('[data-agenda="horario-agenda"]');
    await expect(bloco).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar o horário de atendimento" })).toBeVisible();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator('[data-agenda="configuracoes"]').getByRole("status")).toContainText("Salvo");
  });

  test("sem horário de atendimento, não há o que copiar", async ({ page }) => {
    await page.goto("/design/agenda/configuracoes?semhorario=1");
    await expect(page.getByRole("button", { name: "Copiar o horário de atendimento" })).toHaveCount(0);
    await expect(page.locator('[data-agenda="configuracoes"]')).toContainText("ainda não tem horário de atendimento para copiar");
  });
});

test("o botão de copiar o horário de atendimento vem antes da lista de dias", async ({ page }) => {
  await page.goto("/design/agenda/configuracoes");
  const botao = (await page.getByRole("button", { name: "Copiar o horário de atendimento" }).boundingBox())!;
  const dias = (await page.locator('[data-agenda="horario-agenda"]').boundingBox())!;
  expect(botao.y).toBeLessThan(dias.y);
});

test("a grade mostra o dia inteiro, de 0h a 24h, com linhas só entre as horas", async ({ page }) => {
  await abrir(page);
  const rotulos = page.locator('[data-agenda="hora"]');
  await expect(rotulos).toHaveCount(25);
  await expect(rotulos.first()).toHaveText("0h");
  await expect(rotulos.last()).toHaveText("24h");
  // 24 horas = 23 linhas internas por coluna; nenhuma no topo nem no fim.
  await expect(page.locator('[data-agenda="coluna"]').first().locator("div.h-px")).toHaveCount(23);
});

// Redesenho de 31/10/2026: a grade só desenhava o horário da agenda (na OBS, 13h às 18h),
// acabava no meio da tela e a linha do agora (~20h) ficava solta embaixo, fora dela.
test.describe("Agenda: a grade tem todas as horas, fora do horário com o visual de dia fechado", () => {
  const grade = (page: Page) => page.locator('[data-agenda="grade"]');
  const alturaDaHora = async (page: Page) => {
    const coluna = (await page.locator('[data-agenda="coluna"]').first().boundingBox())!;
    return coluna.height / 24;
  };

  test("horário da OBS às 20h: a linha do agora fica dentro da grade, na hora certa, e a sexta depois das 18h fica fechada", async ({ page }) => {
    // Sexta, 30/10/2026, 20:05 em São Paulo.
    await abrir(page, "?horario=obs&agora=2026-10-30T23:05:00Z");
    const coluna = page.locator('[data-agenda="coluna"][data-dia="2026-10-30"]');
    const caixa = (await coluna.boundingBox())!;
    const hora = caixa.height / 24;
    // A grade vai até o fim da tela (nunca termina no meio) e cada hora tem a mesma altura.
    const area = (await grade(page).boundingBox())!;
    expect(caixa.height).toBeGreaterThan(area.height);
    const agora = coluna.locator('[data-agenda="agora"]');
    await expect(agora).toHaveCount(1);
    const topoDoAgora = Number((await agora.getAttribute("style"))!.match(/top:\s*([\d.]+)px/)![1]);
    expect(topoDoAgora).toBeCloseTo((20 + 5 / 60) * hora, 0);
    expect(topoDoAgora).toBeLessThan(caixa.height);
    // Fechado: de 0h às 13h e de 18h às 24h, no mesmo desenho do fim de semana.
    const fechados = coluna.locator('[data-agenda="fechado"]');
    await expect(fechados).toHaveCount(2);
    const estilos = await fechados.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.cssText.replace(/\s/g, "")));
    expect(estilos[1]).toContain(`top:${18 * hora}px`);
    expect(estilos[1]).toContain(`height:${6 * hora}px`);
    const sabado = page.locator('[data-agenda="coluna"][data-dia="2026-10-31"] [data-agenda="fechado"]');
    await expect(sabado).toHaveCount(1);
    const classeDoSabado = await sabado.getAttribute("class");
    expect(await fechados.nth(1).getAttribute("class")).toBe(classeDoSabado);
  });

  test("ao abrir, a rolagem fica no meio do horário de atendimento (ou na hora de agora, se estiver dentro dele)", async ({ page }) => {
    // 20h está fora do horário (13h às 18h): centraliza no meio dele, 15h30.
    await abrir(page, "?horario=obs&agora=2026-10-30T23:05:00Z");
    const hora = await alturaDaHora(page);
    const centro = async () => grade(page).evaluate((e) => e.scrollTop + e.clientHeight / 2);
    await expect.poll(centro).toBeGreaterThan(15.5 * hora - hora);
    expect(await centro()).toBeLessThan(15.5 * hora + hora);
    // 16h10 de quinta, dentro do horário: centraliza no agora.
    await abrir(page, "?horario=obs&agora=2026-10-29T19:10:00Z");
    await expect.poll(centro).toBeGreaterThan((16 + 10 / 60) * hora - hora);
    expect(await centro()).toBeLessThan((16 + 10 / 60) * hora + hora);
  });

  test("horário de UMA hora por dia e a quarta fechada no meio da semana: nada quebra", async ({ page }) => {
    await abrir(page, "?horario=curto&agora=2026-10-28T13:00:00Z");
    await expect(page.locator('[data-agenda="hora"]')).toHaveCount(25);
    // Segunda aberta só das 13h às 14h: dois trechos fechados em volta.
    await expect(page.locator('[data-agenda="coluna"][data-dia="2026-10-26"] [data-agenda="fechado"]')).toHaveCount(2);
    // Quarta fechada: o dia inteiro num trecho só, como o sábado e o domingo.
    const quarta = page.locator('[data-agenda="coluna"][data-dia="2026-10-28"] [data-agenda="fechado"]');
    await expect(quarta).toHaveCount(1);
    expect((await quarta.getAttribute("style"))!.replace(/\s/g, "")).toContain(`height:${24 * (await alturaDaHora(page))}px`);
    // O agora (10h de quarta, dia fechado) também aparece dentro da grade.
    await expect(page.locator('[data-agenda="coluna"][data-dia="2026-10-28"] [data-agenda="agora"]')).toHaveCount(1);
  });
});

test.describe("Agenda: decisões finais na grade e nas configurações", () => {
  test("clique num horário vazio abre o Marcar horário com o dia preenchido", async ({ page }) => {
    await abrir(page);
    const coluna = page.locator('[data-agenda="coluna"]').nth(4);
    const dia = await coluna.getAttribute("data-dia");
    await coluna.locator('[data-agenda="vazio"]').click({ position: { x: 10, y: 5 } });
    const d = page.locator('[data-agenda="marcar"]');
    await expect(d).toBeVisible();
    await expect(d.getByLabel("Dia")).toHaveValue(dia!);
  });

  test("bloquear dias inteiros mostra o bloqueio em cada dia do período", async ({ page }) => {
    await abrir(page);
    await page.getByRole("button", { name: "Bloquear" }).click();
    const d = page.locator('[data-agenda="bloquear"]');
    await d.getByText("Dias inteiros").click();
    const dias = page.locator('[data-agenda="coluna"]');
    const de = await dias.nth(5).getAttribute("data-dia");
    const ate = await dias.nth(6).getAttribute("data-dia");
    await d.getByLabel("Do dia").fill(de!);
    await d.getByLabel("Até o dia").fill(ate!);
    await d.getByLabel("Motivo").fill("Recesso");
    await d.getByRole("button", { name: "Bloquear", exact: true }).click();
    await expect(dias.nth(5).locator('[data-agenda="bloqueio"]', { hasText: "Recesso" })).toBeVisible();
    await expect(dias.nth(6).locator('[data-agenda="bloqueio"]', { hasText: "Recesso" })).toBeVisible();
  });

  test("configurações listam os feriados com a opção de atender", async ({ page }) => {
    await page.goto("/design/agenda/configuracoes");
    await expect(page.locator('[data-agenda="feriado-item"]').first()).toBeVisible();
    await expect(page.locator('[data-agenda="feriados"]')).toContainText("Finados");
  });
});

test("a ficha do contato mostra os agendamentos dele (futuro, cancelado e passado), do mais recente para o mais antigo", async ({ page }) => {
  await page.goto("/design/contatos?sel=1");
  const bloco = page.locator('[data-slot="painel-agendamentos"]');
  await expect(bloco).toBeVisible();
  const itens = bloco.locator('[data-slot="agendamento-do-contato"]');
  await expect(itens).toHaveCount(3);
  await expect(itens.nth(0)).toContainText("Marcado");
  await expect(itens.nth(1)).toContainText("Cancelado");
  await expect(itens.nth(2)).toContainText("Realizado");
});

test("horário confirmado pelo contato aparece no cartão e no detalhe", async ({ page }) => {
  await abrir(page);
  const cartao = page.locator('[data-agenda="cartao"]', { hasText: "Juliana Prado" });
  await expect(cartao.locator('[data-agenda="cartao-confirmado"]')).toBeVisible();
  await cartao.click();
  await expect(page.locator('[data-agenda="detalhe-presenca"]')).toContainText("Confirmada pelo contato");
});

test("montagem: o mesmo item Agenda no passo 2, sem pergunta, e marcado pede só os serviços", async ({ page }) => {
  await page.goto("/design/montagem?passo=sabe");
  const item = page.locator('[data-agenda="item-agenda"]');
  await expect(item).toContainText("Para quem atende com horário marcado. Ative para a IA marcar, remarcar e cancelar horários pela conversa.");
  await expect(page.getByText("trabalha com horário marcado?")).toHaveCount(0);
  // Desmarcado: nada abre, e o Continuar segue sem agenda.
  await expect(item.locator('[data-agenda="montagem-servicos"]')).toHaveCount(0);
  await item.getByLabel("Agenda ativa").click();
  const servicos = item.locator('[data-agenda="montagem-servicos"]');
  await expect(servicos).toBeVisible();
  // Só os serviços: nada de horário, intervalo ou antecedência na montagem.
  await expect(item.getByText("Intervalo entre horários")).toHaveCount(0);
  await expect(item.getByText("Antecedência mínima")).toHaveCount(0);
  // Marcada sem serviço: recusa ali mesmo, no passo 2.
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.locator('[data-agenda="montagem-erro"]')).toHaveText("Cadastre pelo menos um serviço para ligar a agenda.");
  await servicos.getByRole("button", { name: "Adicionar serviço" }).click();
  await servicos.getByLabel("Nome do serviço 1").fill("Avaliação");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.locator('[data-slot="montagem-bancada"]')).toBeVisible();
});

test("configurações: serviço com erro fica vermelho, com a mensagem no bloco, e a tela rola até ele", async ({ page }) => {
  await page.goto("/design/agenda/configuracoes");
  await page.getByRole("button", { name: "Adicionar serviço" }).click();
  // Serviço novo sem nome: salvar recusa.
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  const bloco = page.locator('[data-agenda="bloco-servicos"]');
  await expect(bloco.locator('[data-agenda="servicos"]')).toHaveAttribute("data-erro", "");
  await expect(bloco).toContainText("Todo serviço precisa de nome");
  const ultimo = bloco.getByRole("textbox", { name: /Nome do serviço/ }).last();
  await expect(ultimo).toHaveAttribute("aria-invalid", "true");
  await expect(bloco).toBeInViewport();
  // Corrigiu: o vermelho sai.
  await ultimo.fill("Retorno");
  await expect(bloco.locator('[data-agenda="servicos"]')).not.toHaveAttribute("data-erro", "");
});
