import { test, expect } from "@playwright/test";

// O assistente de montagem (`/montagem`), previsto em `/design/montagem`.
//
// Roda uma vez na vida da conta e some depois da primeira ativação. O que estes
// testes prendem não é o pixel: é que ele pede POUCO, que existe um contador só
// na conta, que nenhum texto fixo assume um segmento, e que a saída não perde
// nada.

// ⚠️ ORDEM INVERTIDA EM 24/09/2026 (decisão do dono). Era conectar, quem, sabe,
// "testar e ativar"; virou quem, sabe, testar, "conectar e ativar". Motivo: pedir
// o WhatsApp no primeiro passo passava a impressão de que o agente sairia
// respondendo antes de a pessoa terminar de configurar. A lista abaixo é a ordem
// nova, e o teste "a ordem é esta" prende ela.
const PASSOS = [
  { key: "quem", titulo: "Quem atende" },
  { key: "sabe", titulo: "O que ele sabe" },
  // "Testar" virou "Converse com o seu agente" em 26/09/2026 (dono: pobre).
  { key: "testar", titulo: "Converse com o seu agente" },
  { key: "conectar", titulo: "Conectar e ativar" },
];

test.describe("Assistente de montagem (/design/montagem)", () => {
  test("são quatro passos, cada um com o seu numeral", async ({ page }) => {
    for (const [i, p] of PASSOS.entries()) {
      await page.goto(`/design/montagem?passo=${p.key}`);
      await expect(page.getByRole("heading", { name: p.titulo })).toBeVisible();
      // O numeral é PASSO, e não porcentagem: os passos levam tempos muito
      // diferentes (escanear um código contra digitar um nome), e barra de
      // porcentagem que parece travada logo no começo é medidamente pior do que
      // não ter indicador nenhum.
      await expect(page.getByText(`Passo ${i + 1} de 4`)).toBeVisible();
      await expect(page.locator('[data-slot="montagem-trilho"]')).toHaveCount(4);
    }
  });

  test("a ordem é quem, sabe, testar e conectar, e abre em quem", async ({
    page,
  }) => {
    // Sem `?passo=` o preview abre onde uma conta nova abre: no primeiro passo.
    await page.goto("/design/montagem");
    await expect(page.getByRole("heading", { name: "Quem atende" })).toBeVisible();

    // Andando pelo Continuar, e não por URL: é o caminho que a pessoa faz. O
    // preview não grava, então sair de "sabe" não depende de banco.
    const continuar = page.getByRole("button", { name: "Continuar", exact: true });
    await page.waitForLoadState("networkidle");
    for (const p of PASSOS.slice(1)) {
      await continuar.click();
      await expect(page.getByRole("heading", { name: p.titulo })).toBeVisible();
    }
  });

  test("testar vem antes de conectar e não é obrigatório", async ({ page }) => {
    await page.goto("/design/montagem?passo=testar");
    // A bancada está aqui, e não no último passo: ela não precisa de WhatsApp.
    // ⚠️ DESDE 26/09/2026 A CONVERSA ESTÁ NO PASSO, sem botão para abrir um
    // painel (pedido do dono): o cartão "Fale com ele antes" repetia o subtítulo
    // e punha um clique a mais no único gesto que o passo existe para pedir.
    const bancada = page.locator('[data-slot="montagem-bancada"]');
    await expect(bancada.getByRole("textbox")).toBeVisible();
    await expect(page.getByRole("button", { name: "Testar o agente" })).toHaveCount(0);
    await expect(page.getByText("Fale com ele antes")).toHaveCount(0);
    // Sem diagnóstico na montagem: quem monta a conta quer ver a resposta.
    await expect(page.getByRole("tab", { name: "Diagnóstico" })).toHaveCount(0);
    // Opcional: o Continuar funciona sem mensagem nenhuma.
    await expect(
      page.getByRole("button", { name: "Continuar", exact: true })
    ).toBeEnabled();
  });

  test("conectar não liga o agente: ativar fica travado até conectar", async ({
    page,
  }) => {
    await page.goto("/design/montagem?passo=conectar");
    // ⚠️ Desde 26/09/2026 a frase mora UMA vez, no subtítulo do passo: a caixa
    // "Conectar não liga o agente" e a linha "Conecte o WhatsApp para ativar"
    // saíram por repetir o subtítulo (dono). O subtítulo virou a razão do
    // botão desabilitado.
    const porque = page.locator('[data-slot="montagem-porque"]');
    await expect(porque).toHaveText(
      "Conectar não liga o agente: ele só começa a responder quando você ativar."
    );
    await expect(page.getByText(/Conectar não liga o agente/)).toHaveCount(1);
    const ativar = page.getByRole("button", { name: "Ativar o agente" });
    await expect(ativar).toBeDisabled();
    await expect(ativar).toHaveAttribute("aria-describedby", "razao-ativar");
    await expect(porque).toHaveAttribute("id", "razao-ativar");
    // O que acontece ao ativar só aparece depois de conectar.
    await expect(page.getByText("Ao ativar, o que acontece")).toHaveCount(0);

    await page.goto("/design/montagem?passo=conectar&conectado=1");
    await expect(page.locator('[data-slot="whatsapp-conectado"]')).toBeVisible();
    await expect(page.getByText("Ao ativar, o que acontece")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ativar o agente" })
    ).toBeEnabled();
    // Conectado, o QR sai da frente: a tela passa a ser sobre ativar.
    await expect(page.locator('[data-slot="passos-conexao"]')).toHaveCount(0);
  });

  test("um contador só, e ele é este", async ({ page }) => {
    await page.goto("/design/montagem?passo=quem");
    const texto = await page.locator("main").innerText();
    expect((texto.match(/\d+\s+de\s+\d+/g) ?? []).length).toBe(1);
  });

  test("pede TRÊS campos digitados, e nada além disso", async ({ page }) => {
    await page.goto("/design/montagem?passo=quem");

    // Lê os rótulos dos campos direto, e não por `getByText`: o rótulo de campo
    // obrigatório traz um `*` colado, então comparação exata por texto nunca
    // bateria.
    const rotulos = await page.evaluate(() =>
      [...document.querySelectorAll("main label")].map((l) =>
        (l as HTMLElement).innerText.replace(/\*/g, "").trim()
      )
    );

    // Os três que `validateConfig` exige e que só a pessoa sabe. `goals` já vem
    // preenchido, então não aparece aqui.
    expect(rotulos).toEqual([
      "Nome da empresa",
      "O que a empresa faz",
      "Nome do agente",
      "Tom de voz",
    ]);

    // ⚠️ O QUE NÃO PODE APARECER. Um assistente que mostrasse os mesmos campos
    // da tela permanente fatiados em quatro telas não tiraria o medo dos "20
    // campos", só o parcelaria. Estes quatro vivem só nas abas.
    for (const rotulo of ["Site", "Endereço", "Função (opcional)", "Objetivos"]) {
      expect(rotulos).not.toContain(rotulo);
    }

    await page.goto("/design/montagem?passo=sabe");
    await expect(page.getByText("Detalhes do negócio")).toBeVisible();
    // Horário alimenta a frase de valor do painel, não a primeira resposta.
    await expect(page.getByText("Horário de atendimento")).toHaveCount(0);
  });

  test("o modelo do segmento é convite, e vem antes dos campos", async ({
    page,
  }) => {
    await page.goto("/design/montagem?passo=quem");
    const convite = page.locator('[data-slot="preset-convite"]');
    await expect(convite).toBeVisible();
    // Na tela permanente ele é ação destrutiva e mora num menu na linha das
    // abas (22/09/2026); aqui é convite e abre o passo.
    await expect(page.locator("[data-preset-menu]")).toHaveCount(0);

    const antes = await page.evaluate(() => {
      const c = document.querySelector('[data-slot="preset-convite"]')!;
      const primeiroCampo = document.querySelector("main input")!;
      return (
        (c.compareDocumentPosition(primeiroCampo) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
        0
      );
    });
    expect(antes).toBe(true);
  });

  test("não existe \"Deixar para depois\" em passo nenhum", async ({ page }) => {
    // ⚠️ MUDOU EM 26/09/2026. Ele existia só em "o que ele sabe" e fazia o
    // mesmo que o Continuar (os dois gravam e avançam; nada ali é obrigatório,
    // e o passo diz isso). Com a saída do assistente indo para o rodapé, seriam
    // três botões com "depois" em dois. O Continuar livre é o pular.
    for (const key of ["quem", "sabe", "testar", "conectar"]) {
      await page.goto(`/design/montagem?passo=${key}`);
      await expect(
        page.getByRole("button", { name: "Deixar para depois" })
      ).toHaveCount(0);
    }
  });

  test("no passo de conectar não existe Continuar, e o aviso de risco fica", async ({
    page,
  }) => {
    await page.goto("/design/montagem?passo=conectar");
    // ⚠️ O MOTIVO MUDOU EM 24/09/2026. Antes: quem avançava era a conexão,
    // sozinha, para o passo seguinte. Agora conectar é o ÚLTIMO passo, e o botão
    // da direita é "Ativar o agente" (desabilitado até conectar, provado no
    // teste acima). Continuar aqui não teria para onde ir.
    //
    // `exact` é obrigatório: sem ele o Playwright casa por SUBSTRING no nome
    // acessível, e "Continuar" poderia casar com outro botão.
    await expect(
      page.getByRole("button", { name: "Continuar", exact: true })
    ).toHaveCount(0);

    // O aviso de risco do QR vem junto, com as mesmas regras de conteúdo da tela
    // `/connect`: nada de prometer proteção contra bloqueio.
    // Desde 24/09/2026 o risco mora atrás de "Entenda os riscos" (uma linha à
    // vista, pedido do dono). Continua na tela, a um toque.
    await expect(page.getByText(/Use um número dedicado ao atendimento/)).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Entenda os riscos/ }).click();
    await expect(page.getByText(/Existe risco de bloqueio/)).toBeVisible();
    await expect(page.getByText(/Não é a API Oficial da Meta/)).toBeVisible();
    const texto = (await page.locator("body").innerText()).toLowerCase();
    expect(texto).not.toContain("não pague a api");
    expect(texto).not.toContain("proteção contra banimento");
    expect(texto).not.toContain("anti-ban");
  });

  test("a saída existe em todo passo e diz o que fica para depois", async ({
    page,
  }) => {
    // ⚠️ MUDOU EM 26/09/2026 (dono). Era "Sair e continuar depois", no alto, em
    // todo passo: soava como sair de tudo, e era mais um lugar para clicar
    // longe da ação. Agora o nome acompanha o progresso e, no computador, ela
    // mora no rodapé ao lado da ação principal. No celular volta ao alto.
    const ROTULO: Record<string, string> = {
      quem: "Terminar depois",
      sabe: "Terminar depois",
      testar: "Testar depois",
      conectar: "Conectar depois",
    };
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const p of PASSOS) {
      await page.goto(`/design/montagem?passo=${p.key}`);
      const saida = page.getByRole("button", { name: ROTULO[p.key], exact: true });
      await expect(saida).toBeVisible();
      // No computador, no rodapé.
      await expect(page.locator("footer").getByRole("button", { name: ROTULO[p.key] })).toBeVisible();
      await expect(page.getByText("Sair e continuar depois")).toHaveCount(0);
    }
    // Conectado, o que fica para depois é ativar.
    await page.goto("/design/montagem?passo=conectar&conectado=1");
    await expect(page.getByRole("button", { name: "Ativar depois" })).toBeVisible();

    // No celular a saída sobe para o cabeçalho.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/design/montagem?passo=conectar");
    await expect(
      page.locator("header").getByRole("button", { name: "Conectar depois" })
    ).toBeVisible();
    await expect(
      page.locator("footer").getByRole("button", { name: "Conectar depois" })
    ).toBeHidden();
  });

  test("nenhum texto fixo assume um único segmento", async ({ page }) => {
    // ⚠️ Os testadores do beta são advogado, pediatra, barbeiro, engenheiro,
    // clínica e loja. Quem carrega a linguagem do segmento é o MODELO, nunca o
    // texto fixo da tela: um placeholder que diz "clínica" faz o barbeiro achar
    // que o produto não é para ele.
    const MODELOS =
      /advocacia|clínica odontológica|pediatria|engenharia e projetos|clínica de estética|restaurante ou pizzaria|loja ou varejo|imobiliária|salão de beleza ou barbearia/g;

    for (const p of PASSOS) {
      await page.goto(`/design/montagem?passo=${p.key}`);
      // Tira os NOMES dos modelos antes de procurar: eles são pílulas de
      // escolha, e é exatamente ali que a linguagem de segmento deve morar.
      const texto = (await page.locator("main").innerText())
        .toLowerCase()
        .replace(MODELOS, "");

      // ⚠️ Padrões com fronteira de palavra, e não `toContain`. "Consulta" é
      // substantivo de clínica MAS também é verbo comum ("o agente consulta
      // estes arquivos"), e a primeira versão deste teste reprovou justamente a
      // frase certa. O que se procura é o substantivo, que vem com determinante
      // ou no plural.
      const PROIBIDOS: [string, RegExp][] = [
        ["consulta (substantivo)", /\bconsultas\b|\b(a|sua|da|na|uma) consulta\b/],
        ["paciente", /\bpacientes?\b/],
        ["agendamento", /\bagendamentos?\b/],
        ["procedimento", /\bprocedimentos?\b/],
        ["processo", /\bprocessos?\b/],
        ["estoque", /\bestoques?\b/],
        ["obra", /\bobras?\b/],
      ];
      for (const [nome, re] of PROIBIDOS) {
        expect(texto, `passo ${p.key}: "${nome}"`).not.toMatch(re);
      }
    }
  });

  test("não usa travessão em texto visível", async ({ page }) => {
    for (const p of PASSOS) {
      await page.goto(`/design/montagem?passo=${p.key}`);
      const texto = await page.locator("body").innerText();
      expect(texto, `passo ${p.key}`).not.toContain("—");
      expect(texto, `passo ${p.key}`).not.toContain("–");
    }
  });

  test("é usável no celular: uma coluna e o rodapé alcançável", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/design/montagem?passo=quem");

    const m = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll("main input")].filter(
        (i) => (i as HTMLElement).offsetParent !== null
      );
      const rodape = document.querySelector("footer")!;
      const cortados = [...document.querySelectorAll("main *")].filter(
        (e) => e.scrollWidth - e.clientWidth > 1
      ).length;
      return {
        // Uma coluna: todo campo começa no mesmo x.
        colunas: new Set(
          inputs.map((i) => Math.round(i.getBoundingClientRect().left))
        ).size,
        rodapeGrudado: getComputedStyle(rodape).position === "sticky",
        rodapeVisivel: rodape.getBoundingClientRect().bottom <= innerHeight + 1,
        cortados,
      };
    });

    expect(m.colunas).toBe(1);
    expect(m.rodapeGrudado).toBe(true);
    expect(m.rodapeVisivel).toBe(true);
    expect(m.cortados).toBe(0);
  });
});

test("trocar de modelo com o formulário preenchido pede confirmação e troca", async ({
  page,
}) => {
  // Regressão de 26/09/2026 (achada pelo dono): o assistente não desenhava o
  // diálogo de confirmação, e a segunda escolha de modelo ficava pendurada sem
  // fazer nada.
  await page.goto("/design/montagem?passo=quem");
  await page.waitForLoadState("networkidle");
  const convite = page.locator('[data-slot="preset-convite"]');
  const advocacia = convite.getByRole("button", { name: "Advocacia" });
  const pediatria = convite.getByRole("button", { name: "Pediatria" });

  await pediatria.click();
  await expect(pediatria).toHaveAttribute("aria-pressed", "true");

  await advocacia.click();
  await page.getByRole("button", { name: "Aplicar modelo" }).click();
  await expect(advocacia).toHaveAttribute("aria-pressed", "true");
  await expect(pediatria).toHaveAttribute("aria-pressed", "false");
});

test("conectar no molde do WhatsApp Web: três passos, o código ao lado", async ({
  page,
}) => {
  // Pedido do dono com print do WhatsApp Web (26/09/2026): direto, pouco texto.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/design/montagem?passo=conectar");
  await page.waitForLoadState("networkidle");
  const passos = page.locator('[data-slot="passos-conexao"] > li');
  await expect(passos).toHaveCount(3);
  await expect(passos.nth(1)).toContainText("Aparelhos conectados");
  // O botão diz o que faz: gera o QR. Nunca mais "Conectar WhatsApp".
  await expect(page.getByRole("button", { name: "Gerar QR code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Conectar WhatsApp" })).toHaveCount(0);
  // Sem as frases soltas de antes.
  await expect(page.getByText(/escaneie o QR code abaixo/)).toHaveCount(0);
  await expect(page.getByText(/Clique em Conectar/)).toHaveCount(0);

  // Troca de modo: pelo número, com os mesmos três passos.
  await page.locator('[data-slot="trocar-modo-conexao"]').click();
  await expect(passos).toHaveCount(3);
  await expect(page.getByRole("textbox", { name: "Número do WhatsApp" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar código" })).toBeDisabled();
  await expect(page.locator('[data-slot="trocar-modo-conexao"]')).toHaveText(
    "Conectar com QR code"
  );
});
