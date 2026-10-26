import { test, expect } from "@playwright/test";
import { ITENS_DA_REVISAO, PASSOS_MONTAGEM as PASSOS_DA_LIB, revisaoAntesDeAtivar } from "../lib/onboarding";
import { EMPTY_CONFIG, validateConfig } from "../lib/agent-prompt";
import { horarioCadastrado, horarioDaConfig } from "../lib/horarios";

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
  // "Testar" virou "Converse com o seu agente" em 26/09/2026 (dono: pobre), e
  // "Teste o seu agente" em 23/10/2026 (dono).
  { key: "testar", titulo: "Teste o seu agente" },
  // "Conectar e ativar" virou dois passos em 23/10/2026 (dono): conectar, e
  // "Quem a IA chama" (o destino dos avisos) com o Ativar no fim.
  { key: "conectar", titulo: "Conectar o WhatsApp" },
  { key: "avisos", titulo: "Quem a IA chama" },
];

test.describe("Assistente de montagem (/design/montagem)", () => {
  test("são cinco passos, cada um com o seu numeral", async ({ page }) => {
    for (const [i, p] of PASSOS.entries()) {
      await page.goto(`/design/montagem?passo=${p.key}`);
      await expect(page.getByRole("heading", { name: p.titulo })).toBeVisible();
      // O numeral é PASSO, e não porcentagem: os passos levam tempos muito
      // diferentes (escanear um código contra digitar um nome), e barra de
      // porcentagem que parece travada logo no começo é medidamente pior do que
      // não ter indicador nenhum.
      await expect(page.getByText(`Passo ${i + 1} de 5`)).toBeVisible();
      await expect(page.locator('[data-slot="montagem-trilho"]')).toHaveCount(5);
    }
  });

  test("a ordem é quem, sabe, testar, conectar e avisos, e abre na abertura", async ({
    page,
  }) => {
    // Sem `?passo=` o preview abre onde uma conta nova abre. Desde 23/10/2026
    // é a ABERTURA (o mapa dos passos e o computador), e "Começar" leva ao 1.
    await page.goto("/design/montagem");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-slot="montagem-abertura"]')).toBeVisible();
    await page.getByRole("button", { name: "Começar" }).click();
    await expect(page.getByRole("heading", { name: "Quem atende" })).toBeVisible();

    // Andando pelo Continuar, e não por URL: é o caminho que a pessoa faz. O
    // preview não grava, então sair de "sabe" não depende de banco.
    const continuar = page.getByRole("button", { name: "Continuar", exact: true });
    for (const p of PASSOS.slice(1, 4)) {
      await continuar.click();
      await expect(page.getByRole("heading", { name: p.titulo })).toBeVisible();
    }
    // Do 4 para o 5 só conectado: sem conexão (o preview não tem), o Continuar
    // espera, com a razão escrita.
    await expect(continuar).toBeDisabled();
    await expect(continuar).toHaveAttribute("aria-describedby", "razao-continuar");

    // Conectado, segue para o 5.
    await page.goto("/design/montagem?passo=conectar&conectado=1");
    await page.waitForLoadState("networkidle");
    await continuar.click();
    await expect(page.getByRole("heading", { name: "Quem a IA chama" })).toBeVisible();
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

  test("conectar não liga o agente: o 4 só conecta, e ativar mora no 5", async ({
    page,
  }) => {
    await page.goto("/design/montagem?passo=conectar");
    // ⚠️ Desde 26/09/2026 a frase mora UMA vez, no subtítulo do passo: a caixa
    // "Conectar não liga o agente" e a linha "Conecte o WhatsApp para ativar"
    // saíram por repetir o subtítulo (dono).
    const porque = page.locator('[data-slot="montagem-porque"]');
    await expect(porque).toHaveText(
      "Conectar não liga o agente: ele só começa a responder quando você ativar."
    );
    await expect(page.getByText(/Conectar não liga o agente/)).toHaveCount(1);
    // Desde 23/10/2026 o 4 não tem Ativar nem avisos: só a conexão.
    await expect(page.getByRole("button", { name: "Ativar o agente" })).toHaveCount(0);
    await expect(page.locator('[data-slot="montagem-avisos"]')).toHaveCount(0);
    await expect(page.getByText("Ao ativar, o que acontece")).toHaveCount(0);
    await expect(page.locator("#razao-continuar")).toHaveText(
      "O Continuar libera quando o WhatsApp conectar."
    );

    // Conectado, o QR sai da frente e o Continuar libera.
    await page.goto("/design/montagem?passo=conectar&conectado=1");
    await expect(page.locator('[data-slot="whatsapp-conectado"]')).toBeVisible();
    await expect(page.locator('[data-slot="passos-conexao"]')).toHaveCount(0);
    await expect(page.locator("#razao-continuar")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continuar", exact: true })).toBeEnabled();

    // No 5, o Ativar só libera com destino salvo.
    await page.goto("/design/montagem?passo=avisos");
    const ativar = page.getByRole("button", { name: "Ativar o agente" });
    await expect(ativar).toBeDisabled();
    await expect(ativar).toHaveAttribute("aria-describedby", "razao-avisos");
    await page.goto("/design/montagem?passo=avisos&avisos=1");
    await expect(page.getByText("Ao ativar, o que acontece")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ativar o agente" })).toBeEnabled();
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
      // Fora dos destaques: horário e avisos são opcionais e têm o próprio
      // teste ("Montagem mais clara"); aqui contam os campos que se DIGITAM.
      [...document.querySelectorAll("main label")].filter((l) => !l.closest('[data-slot="montagem-destaque"]')).map((l) =>
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
    for (const key of ["quem", "sabe", "testar", "conectar", "avisos"]) {
      await page.goto(`/design/montagem?passo=${key}`);
      await expect(
        page.getByRole("button", { name: "Deixar para depois" })
      ).toHaveCount(0);
    }
  });

  test("no passo de conectar o Continuar espera a conexão, e o aviso de risco fica", async ({
    page,
  }) => {
    await page.goto("/design/montagem?passo=conectar");
    // ⚠️ MUDOU DE NOVO EM 23/10/2026. De 24/09 até ali conectar era o último
    // passo e não tinha Continuar. Agora o 5 (avisos e ativar) vem depois, e o
    // Continuar do 4 existe mas espera a conexão: quem avança é a pessoa,
    // depois de conectar, nunca a conexão sozinha.
    //
    // `exact` é obrigatório: sem ele o Playwright casa por SUBSTRING no nome
    // acessível, e "Continuar" poderia casar com outro botão.
    await expect(
      page.getByRole("button", { name: "Continuar", exact: true })
    ).toBeDisabled();

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
      avisos: "Ativar depois",
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
    // Conectado, o passo 4 já não deixa "conectar" para depois.
    await page.goto("/design/montagem?passo=conectar&conectado=1");
    await expect(page.locator("footer").getByRole("button", { name: "Terminar depois" })).toBeVisible();

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
    // ⚠️ Os clientes são advogado, pediatra, barbeiro, engenheiro,
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
      const inputs = [...document.querySelectorAll("main input")].filter((i) => !i.closest('[data-slot="montagem-destaque"]')).filter(
        (i) => (i as HTMLElement).offsetParent !== null
      );
      const rodape = document.querySelector("footer")!;
      // A linha "Segunda a sexta / Editar" do editor de horário (no passo 1
      // desde 23/10/2026) recua o botão fantasma 8px de propósito (`-mr-2`,
      // alinha o texto à borda): sobra visível, nada cortado.
      const cortados = [...document.querySelectorAll("main *")].filter(
        (e) => e.scrollWidth - e.clientWidth > 1 && !e.closest('[data-slot="horario-semana"]')
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

// ⚠️ MONTAGEM MAIS CLARA (23/10/2026, dono). Dos oito cadastros de testadores,
// cinco configuraram e pararam antes de ativar: ninguém sabia antes que o QR
// pede um computador, e o destino dos avisos (o diferencial) só aparecia no fim.
// Os testes abaixo prendem a abertura, os destaques, o horário conferido, o
// passo 5 dos avisos, a revisão antes de ativar e a dica do cadastro. A parada
// do passo 4 no celular está em `entrada.mobile.spec.ts`.
test.describe("Montagem mais clara", () => {
  const COMPUTADOR =
    "Precisa de um computador: você lê o QR com o celular da empresa.";

  test("a abertura mostra os cinco passos e o computador antes de começar", async ({ page }) => {
    await page.goto("/design/montagem");
    const abertura = page.locator('[data-slot="montagem-abertura"]');
    await expect(abertura.getByRole("heading", { name: "Vamos montar o seu agente" })).toBeVisible();
    const passos = abertura.locator('[data-slot="abertura-passo"]');
    await expect(passos).toHaveCount(5);
    for (const [i, p] of PASSOS.entries()) await expect(passos.nth(i)).toContainText(p.titulo);
    await expect(passos.nth(3)).toContainText("celular da empresa");
    // O pedido de ajuda é o passo 5, com a etiqueta dos destaques.
    await expect(passos.nth(4)).toContainText("O número ou o grupo que a IA avisa quando precisa de alguém");
    await expect(passos.nth(4).locator('[data-slot="abertura-faz-diferenca"]')).toHaveText("Faz diferença");
    // O alerta do computador mora no passo 4 do mapa, e só nele (dono).
    await expect(abertura.locator('[data-slot="abertura-computador"]')).toHaveCount(1);
    await expect(passos.nth(3).locator('[data-slot="abertura-computador"]')).toHaveText(COMPUTADOR);
    // Não é um passo a mais: sem contador, sem trilho e sem "Continuar".
    await expect(page.getByText(/Passo \d de 5/)).toHaveCount(0);
    await expect(page.locator('[data-slot="montagem-trilho"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continuar", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Voltar" })).toBeDisabled();
    // Sem tempo estimado (decisão do dono: pouco dado para prometer).
    await expect(abertura).not.toContainText(/minuto/);
    // Quem abre um passo direto não vê a abertura.
    await page.goto("/design/montagem?passo=quem");
    await expect(page.locator('[data-slot="montagem-abertura"]')).toHaveCount(0);
  });

  test("a abertura tem um ícone colorido por passo", async ({ page }) => {
    await page.goto("/design/montagem");
    const icones = page.locator('[data-slot="abertura-icone"]');
    await expect(icones).toHaveCount(5);
    // Cores da paleta de rótulos, uma por passo, nenhuma repetida.
    const fundos = await icones.evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    expect(new Set(fundos).size).toBe(5);
    for (const f of fundos) expect(f).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("o modelo do segmento, o horário, os documentos e os avisos estão em destaque", async ({ page }) => {
    const destaque = (chave: string) => page.locator(`[data-slot="montagem-destaque"][data-destaque="${chave}"]`);
    await page.goto("/design/montagem?passo=quem");
    // As pílulas do modelo moram DENTRO do destaque.
    await expect(destaque("modelo").getByRole("button", { name: "Advocacia" })).toBeVisible();
    await expect(destaque("horario")).toContainText("é por este horário que ela diz quando a empresa atende e se está aberta agora");
    // Os avisos não estão no passo 1: dependem da conexão (passo 5).
    await expect(page.locator('[data-slot="montagem-avisos"]')).toHaveCount(0);

    await page.goto("/design/montagem?passo=sabe");
    await expect(destaque("documentos")).toContainText("Quanto mais ela sabe, menos ela precisa te chamar.");

    await page.goto("/design/montagem?passo=avisos");
    await expect(page.locator('[data-slot="montagem-porque"]')).toHaveText(
      "Quando a IA precisa de alguém, ela chama o time e avisa num número ou grupo do WhatsApp, e segue atendendo."
    );
    const avisos = page.locator('[data-slot="montagem-avisos"]');
    await expect(avisos.locator('[data-destaque="avisos"]')).toBeVisible();
    await expect(avisos.locator('[data-slot="destaque-exemplo"]')).toBeVisible();
  });

  test("conectar não liga o agente fica em destaque no passo 4, uma vez só", async ({ page }) => {
    await page.goto("/design/montagem?passo=conectar");
    const porque = page.locator('[data-slot="montagem-porque"]');
    await expect(porque).toHaveAttribute("data-destaque", "");
    await expect(porque).toHaveClass(/bg-brand-surface/);
    await expect(page.getByText(/Conectar não liga o agente/)).toHaveCount(1);
    // Nos outros passos o subtítulo continua discreto.
    await page.goto("/design/montagem?passo=quem");
    await expect(page.locator('[data-slot="montagem-porque"]')).not.toHaveAttribute("data-destaque", "");
  });

  test("o passo 5 tem o número E o grupo, e o teste, porque já está conectado", async ({ page }) => {
    await page.goto("/design/montagem?passo=avisos");
    await page.waitForLoadState("networkidle");
    const bloco = page.locator('[data-slot="montagem-avisos"]');
    await bloco.getByRole("tab", { name: "Um grupo" }).click();
    await expect(bloco.getByRole("combobox", { name: "Grupo que recebe os avisos" })).toBeVisible();
    await bloco.getByRole("tab", { name: "Um número" }).click();
    await bloco.locator('[data-slot="avisos-numero"]').fill("11 91234-5678");
    await bloco.locator('[data-slot="avisos-salvar"]').click();
    await expect(bloco.locator('[data-slot="avisos-destino"]')).toContainText("91234-5678");
    await expect(bloco.locator('[data-slot="avisos-teste"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Ativar o agente" })).toBeEnabled();
  });

  test("a revisão antes de ativar diz o que está valendo e não bloqueia", async ({ page }) => {
    await page.goto("/design/montagem?passo=conectar&conectado=1");
    // Só no passo 5, onde a ativação mora.
    await expect(page.locator('[data-slot="montagem-revisao"]')).toHaveCount(0);

    await page.goto("/design/montagem?passo=avisos&avisos=1");
    const revisao = page.locator('[data-slot="montagem-revisao"]');
    const item = (k: string) => revisao.locator(`[data-slot="revisao-item"][data-item="${k}"]`);
    // Os avisos são o próprio passo, logo acima: não repetem na revisão.
    await expect(revisao.locator('[data-slot="revisao-item"]')).toHaveCount(4);
    await expect(item("avisos")).toHaveCount(0);
    await expect(item("regras")).toHaveAttribute("data-estado", "vazio");
    await expect(item("documentos")).toHaveAttribute("data-estado", "vazio");
    // O horário pronto é sugestão: não conferido, ele não vale (hoursConfirmed).
    await expect(item("horario")).toHaveAttribute("data-estado", "nao_conferido");
    await expect(item("horario")).toContainText("Não conferido");
    await expect(item("horario").getByRole("button", { name: "Conferir" })).toBeVisible();
    await expect(item("mensagem")).toHaveAttribute("data-estado", "padrao");
    await expect(item("mensagem")).toContainText("Padrão");
    // Uma linha por item, sem porquê nem exemplo (dono, 26/10/2026).
    await expect(item("regras")).toContainText("Recomendado");
    await expect(item("regras")).not.toContainText("Exemplo");
    // Não bloqueia: com os avisos salvos o Ativar libera, com tudo o resto vazio.
    await expect(page.getByRole("button", { name: "Ativar o agente" })).toBeEnabled();
    // Ordem: avisos, revisão, o que acontece ao ativar.
    const ordem = await page.evaluate(() => {
      const a = document.querySelector('[data-slot="montagem-avisos"]')!;
      const r = document.querySelector('[data-slot="montagem-revisao"]')!;
      const d = [...document.querySelectorAll("p")].find((p) => p.textContent === "Ao ativar, o que acontece")!;
      const segue = (x: Element, y: Element) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      return segue(a, r) && segue(r, d);
    });
    expect(ordem).toBe(true);
  });

  test("Adicionar regras abre os campos ali mesmo, e fechar salva", async ({ page }) => {
    await page.goto("/design/montagem?passo=avisos&avisos=1");
    await page.waitForLoadState("networkidle");
    const regras = page.locator('[data-slot="revisao-item"][data-item="regras"]');
    await regras.getByRole("button", { name: "Adicionar" }).click();
    const painel = page.locator('[data-slot="sheet-content"]');
    await expect(painel).toHaveAttribute("data-painel", "limites");
    // Os MESMOS campos do /agente.
    const campo = painel.getByPlaceholder("Ex.: nunca dar desconto por conta própria");
    await campo.fill("nunca prometer prazo sem confirmar");
    await campo.press("Enter");
    await painel.getByRole("button", { name: "Salvar" }).click();
    await expect(painel).toHaveCount(0);
    await expect(regras).toHaveAttribute("data-estado", "preenchido");
    await expect(regras).toContainText("1 regra");
    // Ainda na montagem, no mesmo passo.
    await expect(page.getByRole("heading", { name: "Quem a IA chama" })).toBeVisible();

    // O horário abre o editor de horário; documentos voltam ao passo 2.
    await page.locator('[data-item="horario"]').getByRole("button", { name: "Conferir" }).click();
    await expect(page.locator('[data-slot="sheet-content"]')).toHaveAttribute("data-painel", "horario");
    await expect(page.locator('[data-slot="sheet-content"]').getByText("Segunda a sexta")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
    await page.locator('[data-item="documentos"]').getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByRole("heading", { name: "O que ele sabe" })).toBeVisible();
  });

  test("o texto novo não tem travessão nem assume segmento", async ({ page }) => {
    for (const url of [
      "/design/montagem",
      "/design/montagem?passo=quem",
      "/design/montagem?passo=sabe",
      "/design/montagem?passo=conectar&conectado=1",
      "/design/montagem?passo=avisos",
    ]) {
      await page.goto(url);
      const texto = (await page.locator("main").innerText())
        .toLowerCase()
        .replace(/advocacia|clínica odontológica|pediatria|engenharia e projetos|clínica de estética|restaurante ou pizzaria|loja ou varejo|imobiliária|salão de beleza ou barbearia/g, "");
      expect(texto, url).not.toMatch(/[—–]/);
      expect(texto, url).not.toMatch(/\bconsultas\b|\b(a|sua|da|na|uma) consulta\b|\bpacientes?\b|\bagendamentos?\b|\bprocedimentos?\b|\bprocessos?\b|\bestoques?\b|\bobras?\b/);
    }
  });

  test("a regra da revisão: vazio, preenchido, padrão, não conferido e conferindo", async () => {
    const base = { nuncaFaz: 0, chamaQuando: 0, documentos: 0, horarioConferido: false, mensagem: false };
    expect(revisaoAntesDeAtivar(base)).toEqual({
      regras: "vazio",
      documentos: "vazio",
      horario: "nao_conferido",
      mensagem: "padrao",
    });
    expect(
      revisaoAntesDeAtivar({ nuncaFaz: 0, chamaQuando: 2, documentos: 3, horarioConferido: true, mensagem: true })
    ).toEqual({ regras: "preenchido", documentos: "preenchido", horario: "preenchido", mensagem: "preenchido" });
    expect(revisaoAntesDeAtivar({ ...base, documentos: null }).documentos).toBe("conferindo");
    // Cada item com título; cada passo com o seu resumo para a abertura.
    for (const i of ITENS_DA_REVISAO) expect(i.titulo, i.key).toBeTruthy();
    for (const p of PASSOS_DA_LIB) expect(p.resumo, p.key).toBeTruthy();
    expect(PASSOS_DA_LIB.map((p) => p.key)).toEqual(["quem", "sabe", "testar", "conectar", "avisos"]);
  });

  test("horário não conferido não vale: nem no prompt, nem no calendário, nem no Painel", async () => {
    // Configuração nova nasce com a sugestão de segunda a sexta NÃO conferida.
    expect(EMPTY_CONFIG.hoursConfirmed).toBe(false);
    const nova = { ...EMPTY_CONFIG, companyName: "Ótica Vision", companyWhat: "vende óculos", agentName: "Alê" };
    const r = validateConfig(nova);
    expect(r.ok && r.value.hoursConfirmed).toBe(false);
    expect(horarioDaConfig(nova)).toBeNull();
    expect(horarioCadastrado(nova)).toBeNull();
    // Conferida, vale.
    expect(horarioCadastrado({ ...nova, hoursConfirmed: true })).not.toBeNull();
    // Configuração de antes de 23/10/2026, sem a marca: conta como conferida.
    const { hoursConfirmed: _semMarca, ...antiga } = { ...nova, hoursConfirmed: true };
    void _semMarca;
    const ra = validateConfig(antiga);
    expect(ra.ok && ra.value.hoursConfirmed).toBe(true);
    expect(horarioDaConfig(antiga)).not.toBeNull();
  });

  test("no passo 1, o horário pede conferência", async ({ page }) => {
    await page.goto("/design/montagem?passo=quem");
    await page.waitForLoadState("networkidle");
    const horario = page.locator('[data-slot="montagem-destaque"][data-destaque="horario"]');
    await expect(horario.locator('[data-slot="horario-nao-conferido"]')).toBeVisible();
    await horario.locator('[data-slot="horario-confirmar"]').click();
    await expect(horario.locator('[data-slot="horario-nao-conferido"]')).toHaveCount(0);
  });

  test("conferido no passo 1, o horário chega conferido à revisão", async ({ page }) => {
    // `conectado=1` deixa o passo 4 já conectado; o caminho é pelo Continuar.
    await page.goto("/design/montagem?passo=quem&conectado=1&avisos=1");
    await page.waitForLoadState("networkidle");
    await page.locator('[data-slot="horario-confirmar"]').click();
    const continuar = page.getByRole("button", { name: "Continuar", exact: true });
    for (const titulo of ["O que ele sabe", "Teste o seu agente", "Conectar o WhatsApp", "Quem a IA chama"]) {
      await continuar.click();
      await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
    }
    await expect(page.locator('[data-slot="revisao-item"][data-item="horario"]')).toHaveAttribute("data-estado", "preenchido");
    await expect(page.getByRole("button", { name: "Ativar o agente" })).toBeEnabled();
  });

  test("o cadastro dá a dica do computador", async ({ page }) => {
    await page.goto("/cadastro");
    await expect(page.locator('[data-slot="cadastro-dica-computador"]')).toHaveText(
      "Dica: faça pelo computador. No final você conecta o WhatsApp lendo um QR code."
    );
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

  // Sem troca de modo (17/10/2026): o código de pareamento está desligado
  // (docs/adr/2026-10-17-pairing-code-off-qr-only.md). No computador também não
  // aparece o aviso de abrir no computador.
  await expect(page.locator('[data-slot="trocar-modo-conexao"]')).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Número do WhatsApp" })).toHaveCount(0);
  await expect(page.locator('[data-slot="conectar-pelo-computador"]')).toHaveCount(0);
});
