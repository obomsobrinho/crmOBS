import { test, expect } from "@playwright/test";

// O assistente de montagem (`/montagem`), previsto em `/design/montagem`.
//
// Roda uma vez na vida da conta e some depois da primeira ativação. O que estes
// testes prendem não é o pixel: é que ele pede POUCO, que existe um contador só
// na conta, que nenhum texto fixo assume um segmento, e que a saída não perde
// nada.

const PASSOS = [
  { key: "conectar", titulo: "Conectar o WhatsApp" },
  { key: "quem", titulo: "Quem atende" },
  { key: "sabe", titulo: "O que ele sabe" },
  { key: "ativar", titulo: "Testar e ativar" },
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
    // Na tela permanente ele é ação destrutiva e mora no pé da aba; aqui é
    // convite e abre o passo.
    await expect(page.locator('[data-slot="preset-rodape"]')).toHaveCount(0);

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

  test("pular existe só onde o passo é mesmo opcional", async ({ page }) => {
    await page.goto("/design/montagem?passo=sabe");
    await expect(
      page.getByRole("button", { name: "Deixar para depois" })
    ).toBeVisible();

    for (const key of ["conectar", "quem", "ativar"]) {
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
    // Quem avança é a conexão, sozinha. Um Continuar aqui levaria a pessoa para
    // um agente que não tem de onde responder.
    //
    // `exact` é obrigatório: sem ele o Playwright casa por SUBSTRING no nome
    // acessível, e "Continuar" encontraria "Sair e continuar depois".
    await expect(
      page.getByRole("button", { name: "Continuar", exact: true })
    ).toHaveCount(0);

    // O aviso de risco do QR vem junto, com as mesmas regras de conteúdo da tela
    // `/connect`: nada de prometer proteção contra bloqueio.
    await expect(page.getByText(/Não é a API Oficial da Meta/)).toBeVisible();
    await expect(page.getByText(/Existe risco de bloqueio/)).toBeVisible();
    const texto = (await page.locator("body").innerText()).toLowerCase();
    expect(texto).not.toContain("não pague a api");
    expect(texto).not.toContain("proteção contra banimento");
    expect(texto).not.toContain("anti-ban");
  });

  test("a saída de continuar depois existe em todo passo", async ({ page }) => {
    for (const p of PASSOS) {
      await page.goto(`/design/montagem?passo=${p.key}`);
      await expect(
        page.getByRole("button", { name: "Sair e continuar depois" })
      ).toBeVisible();
    }
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
