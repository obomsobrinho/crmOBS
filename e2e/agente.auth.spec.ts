import { test, expect } from "@playwright/test";

// Testes COM LOGIN (sessão de dono do tenant de teste, reusada de auth.setup.ts;
// desde 17/09/2026 esse tenant é a OBS, que está em modo avançado).
//
// Estes testes falam com o cérebro REAL: chamam o modelo de verdade via
// /api/playground em dryRun. É de propósito, porque o que precisa ser provado
// aqui não é a interface, é o comportamento: que o teste roda contra a
// configuração que está NA TELA e não contra a que está salva. Um mock provaria
// que o mock funciona.
//
// Nada é gravado: o /api/playground trava dryRun (sem chat_messages, sem mover
// card; a linha de medição em agent_turns sai marcada dry_run). E estes testes
// NUNCA clicam em Salvar, então clients.persona não é tocada, o que importa
// porque salvar já é publicar (o n8n lê a persona ao vivo).

// O modelo demora alguns segundos por turno.
test.setTimeout(150_000);

/** Nome improvável de sair do modelo por acaso: é a prova de que veio do campo. */
const NOME_NOVO = "Zerbina";

test.describe("Bancada de teste dentro do /agente", () => {
  test("testa a configuração que está na tela, sem salvar", async ({ page }) => {
    // Vigia a rede: se um PUT de agent-config escapar, o teste teria salvado, e
    // salvar é publicar. É a asserção mais importante do arquivo.
    const salvamentos: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PUT" && r.url().includes("/agent-config")) {
        salvamentos.push(r.url());
      }
    });

    await page.goto("/agente");

    // ⚠️ O tenant de teste pode estar nos DOIS modos, e o campo que carrega a
    // marca é outro em cada um. Este teste travava o guiado e quebrou quando o
    // tenant de teste virou a OBS, que escreve o prompt à mão. A prova é a mesma
    // nos dois: escrever algo na tela, NÃO salvar, e ver aquilo aparecer na
    // resposta do modelo. Trocar de modo aqui seria pior que tratar os dois: no
    // avançado o tenant pode não ter `agent_config`, e o formulário guiado
    // abriria vazio, reprovando no 400 de configuração incompleta.
    const paraGuiado = page.getByRole("button", {
      name: "Voltar ao formulário guiado",
    });
    const paraAvancado = page.getByRole("button", {
      name: "Escrever o prompt à mão",
    });
    await expect(paraGuiado.or(paraAvancado)).toBeVisible();
    const noAvancado = await paraGuiado.isVisible();

    if (noAvancado) {
      // Uma instrução no FIM do texto do tenant, onde a recência ajuda: pedir um
      // nome brigaria com a identidade que a persona dele já declara no começo.
      const campo = page.locator("textarea").first();
      await expect(campo).toBeVisible();
      const atual = await campo.inputValue();
      await campo.fill(
        atual +
          `

Inclua sempre a palavra ${NOME_NOVO} em qualquer resposta que você der.`
      );
    } else {
      // A aba "Quem atende" é a que abre, e é onde mora o nome do agente.
      await expect(page.getByRole("tab", { name: "Quem atende" })).toBeVisible();

      // Troca o nome do agente e NÃO salva.
      //
      // Localizado pela estrutura, e não por getByLabel: o helper `Field` do
      // formulário desenha o rótulo como <label> SEM htmlFor, e os inputs não têm
      // id, então rótulo e controle não estão associados. É um defeito de
      // acessibilidade de verdade (o leitor de tela anuncia campo sem nome), mas
      // consertar direito exige fieldset/legend nos grupos de caixas de marcar, o
      // que é trabalho próprio e não passageiro deste teste.
      // Sem `exact`: o rótulo de campo obrigatório carrega um asterisco junto.
      const campoNome = page
        .getByText("Nome do agente")
        .locator("xpath=following::input[1]");
      await expect(campoNome).toBeVisible();
      await campoNome.fill(NOME_NOVO);
    }

    await page.getByRole("button", { name: "Testar o agente" }).click();
    const painel = page.locator('[data-slot="sheet-content"]');
    await expect(painel).toBeVisible();

    await painel
      .getByPlaceholder("Escreva como um cliente escreveria...")
      .fill("Oi! Com quem eu falo?");
    await painel.getByRole("button", { name: "Enviar" }).click();

    // A resposta tem que trazer o nome que está no CAMPO, não o que está salvo.
    // Se a rota usasse a persona do banco, aqui viria o nome antigo.
    await expect(painel.getByText(new RegExp(NOME_NOVO, "i")).first()).toBeVisible({
      timeout: 90_000,
    });

    expect(salvamentos).toEqual([]);
  });

  test("o prompt enviado ao modelo carrega o rabo invariante da base", async ({
    page,
  }) => {
    await page.goto("/agente");
    // O painel do prompt mostra o texto EXATO que a IA recebe. As quatro seções
    // finais são o contrato: sem elas o teste (e o agente) não valeriam nada, e é
    // o servidor que as recola, inclusive no modo avançado.
    await page.getByRole("button", { name: "Ver prompt" }).click();
    const painel = page.locator('[data-slot="sheet-content"]');
    await expect(painel).toContainText("### PRECEDÊNCIA");
    await expect(painel).toContainText("### QUANDO CHAMAR UM HUMANO");
    await expect(painel).toContainText("### ANTI-MANIPULAÇÃO");
    await expect(painel).toContainText("### OUTPUT");
    // A regra de handoff que produção obrigou a rever: pausar não encerra.
    await expect(painel).toContainText("Pausar NÃO encerra a conversa");
  });

  test("a tela própria do playground não existe mais", async ({ page }) => {
    // A bancada virou painel dentro do /agente. A rota antiga sai de circulação
    // junto, senão fica um caminho velho fazendo a mesma coisa pior (testar só o
    // que já foi salvo).
    const res = await page.goto("/playground");
    expect(res?.status()).toBe(404);
    // E o menu não oferece mais o item.
    await page.goto("/agente");
    await expect(page.getByRole("link", { name: "Playground" })).toHaveCount(0);
  });
});

test.describe("Painel com dados reais", () => {
  test("o valor percebido aparece como manchete", async ({ page }) => {
    await page.goto("/painel");
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "O que a IA fez por você" })
    ).toBeVisible();

    // ⚠️ Esta asserção JÁ QUEBROU DUAS VEZES por renomeação de cabeçalho, nas
    // duas vezes porque a suíte com login não foi rodada no passo que renomeou.
    // Na rodada 3 do desenho (29/08/2026) "A IA está dando conta?" virou "A
    // operação" e "Está crescendo?" virou o cartão "Movimento".
    await expect(
      page.getByRole("heading", { name: "A operação" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Movimento" })).toBeVisible();
    // Dois seletores, um por bloco: não existe mais seletor global. O da
    // operação prova que os quatro períodos foram calculados no servidor.
    await expect(page.getByRole("tablist", { name: "Período" })).toBeVisible();
    await expect(
      page.getByRole("tablist", { name: "Janela do movimento" })
    ).toBeVisible();

    // ⚠️ A IGUALDADE, CONTRA DADO REAL. Na Loja Teste o horário está
    // configurado, então o gráfico de hora pode aparecer. Quando aparece, a soma
    // das partes roxas TEM que ser o número da manchete: é o mesmo conjunto de
    // linhas, contado pela mesma regra. Quando a manchete do período é outra
    // frase, o gráfico não é renderizado, e aí não há o que comparar.
    const grafico = page.locator('[data-slot="painel-horas"]');
    if ((await grafico.count()) > 0) {
      const { soma, manchete } = await page.evaluate(() => {
        const horas = [
          ...document.querySelectorAll(
            '[data-slot="painel-horas"] .painel-hora'
          ),
        ];
        return {
          soma: horas.reduce(
            (s, h) => s + Number((h as HTMLElement).dataset.fora ?? 0),
            0
          ),
          manchete: document
            .querySelector('[data-slot="stat-valor"]')
            ?.textContent?.trim(),
        };
      });
      expect(String(soma)).toBe(manchete);
    }

    // A tela pode legitimamente não ter frase nenhuma (tenant sem movimento no
    // mês fechado E sem acumulado), e aí o estado vazio é a resposta certa. O que
    // NÃO pode é quebrar nem inventar número: se existe manchete, ela tem
    // conteúdo; se não existe, o aviso de vazio está lá.
    const manchete = page.locator("[data-manchete]");
    if ((await manchete.count()) > 0) {
      await expect(manchete.first()).not.toBeEmpty();
    } else {
      await expect(page.getByText("Ainda sem movimento no período")).toBeVisible();
    }

    const texto = await page.locator("body").innerText();
    expect(texto).not.toContain("—");
    expect(texto).not.toContain("–");
  });

  test("sem assunto classificado, o bloco diz XX e não inventa", async ({
    page,
  }) => {
    await page.goto("/painel");

    // ⚠️ ESTE É O LUGAR CERTO PARA ESTA ASSERÇÃO. O preview `/design/painel` é
    // réplica da prancha e mostra assuntos MOCKADOS; quem não tem assunto
    // nenhum é o tenant real, porque classificar o assunto de um turno exige
    // instrumentação que não existe (`conversation_qualifications` só guarda
    // action, summary e preferência de horário).
    //
    // As três regras que tornam o vazio honesto: número literalmente `XX`,
    // rótulo POSICIONAL e barra CINZA. Um valor plausível, mesmo borrado, é
    // indistinguível de medição num print ampliado, e "a IA não inventa" é o
    // eixo do produto.
    const assuntos = page.locator('[data-slot="painel-assuntos"]');
    await expect(assuntos).toBeVisible();
    await expect(assuntos.getByText("XX")).toHaveCount(3);
    await expect(assuntos.getByText("1º assunto mais perguntado")).toBeVisible();
    await expect(assuntos).toContainText("Em breve");
    await expect(assuntos).toContainText(/preferimos não mostrar número/);

    // Roxo é a cor de dado REAL nesta tela: barra roxa leria como medição.
    const roxas = await page.evaluate(
      () =>
        [
          ...document
            .querySelector('[data-slot="painel-assuntos"]')!
            .querySelectorAll("div"),
        ].filter((d) => d.className.includes("bg-brand")).length
    );
    expect(roxas).toBe(0);
  });
});
