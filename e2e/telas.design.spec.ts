import { test, expect } from "@playwright/test";

// Testes de fumaça das telas /design (sem login, sem banco). Garantem que a UT
// renderiza e os elementos-chave da Fase 1 existem.

test.describe("Equipe (/design/equipe)", () => {
  test("mostra convite, membros e papéis", async ({ page }) => {
    await page.goto("/design/equipe");
    await expect(page.getByRole("heading", { name: "Equipe" })).toBeVisible();
    await expect(page.getByText("Convidar por e-mail")).toBeVisible();
    await expect(page.getByText("ana.dona@oticavision.com")).toBeVisible();
    await expect(page.getByText("carlos.silva@oticavision.com")).toBeVisible();
    // Badge de papel (span do membro, não a <option> escondida do select).
    await expect(
      page.locator("span").filter({ hasText: /^Dono$/ }).first()
    ).toBeVisible();
    await expect(
      page.locator("span").filter({ hasText: /^Atendente$/ }).first()
    ).toBeVisible();
  });
});

test.describe("Inbox (/design)", () => {
  test("mostra atribuição, tags, notas e filtros", async ({ page }) => {
    await page.goto("/design");
    // A seção "Atendimento" saiu do painel de contexto na migração de UI: quem
    // atende virou um chip no cabeçalho da conversa, e ter os dois era a mesma
    // decisão em dois lugares. O que ficou é o chip, que abre o seletor.
    await expect(
      page.getByRole("button", { name: /Você|Ninguém assumiu ainda/ }).first()
    ).toBeVisible();
    await expect(page.getByText("Tags", { exact: true })).toBeVisible();
    // "Notas internas" virou só "Notas" no painel, e escrever nota passou a ser
    // uma aba do campo de escrita, em vez de um formulário próprio.
    await expect(page.getByText("Notas", { exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Nota interna/ })).toBeVisible();
    // Os filtros viraram CHIPS em 18/09/2026, no lugar do menu suspenso: o menu
    // escondia a contagem, e dava para ter três conversas esperando por você sem
    // nada na tela dizendo isso. "Precisa de você" virou "Esperando", o mesmo
    // nome do grupo da lista.
    await expect(page.getByRole("button", { name: /Todas/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Esperando/ })
    ).toBeVisible();
  });

  test("busca por nome filtra a lista", async ({ page }) => {
    await page.goto("/design");
    await expect(page.getByRole("link", { name: /Franck/ })).toBeVisible();
    await page.getByPlaceholder("Buscar nome ou mensagem").fill("franck");
    await expect(page.getByRole("link", { name: /Franck/ })).toBeVisible();
    // "Olá, vim pelo qr code!" é de outra conversa; deve sumir no filtro.
    await expect(page.getByText("Olá, vim pelo qr code!")).toHaveCount(0);
  });

  test("contato é editado no lugar, sem passo de abrir formulário", async ({
    page,
  }) => {
    await page.goto("/design");
    // A migração tirou o botão "Editar" que trocava a lista por um formulário
    // com Cancelar e Salvar: eram três cliques para corrigir uma letra. Agora
    // cada linha é o próprio campo e grava ao perder o foco.
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await expect(
      page.getByPlaceholder("Como você chama este contato")
    ).toBeVisible();
    // Sem Cancelar e Salvar: gravar ao perder o foco é o que tirou os cliques.
    await expect(page.getByRole("button", { name: "Salvar" })).toHaveCount(0);
  });
});

test.describe("Agente (/design/agente)", () => {
  test("renderiza as três abas mais a saída para o modo avançado", async ({
    page,
  }) => {
    await page.goto("/design/agente");
    // As abas agora são as três SEÇÕES do formulário, e trocam conteúdo de
    // verdade. O par guiado/avançado deixou de ser aba em 28/08/2026: as três
    // abas são recortes do MESMO formulário e o avançado é outro formulário, e
    // misturar os dois sentidos numa faixa só fazia "prompt à mão" parecer mais
    // uma seção da configuração guiada.
    await expect(page.getByRole("tab", { name: "Quem atende" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "O que ele sabe" })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "O que ele pode fazer" })
    ).toBeVisible();

    await expect(page.getByRole("tab", { name: "Guiado" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Avançado" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Escrever o prompt à mão" })
    ).toBeVisible();
  });
});

test.describe("Bancada de teste (/design/playground)", () => {
  // A bancada deixou de ser tela e virou painel lateral dentro do /agente. O
  // preview abre o painel já aberto, então o que se testa aqui é o painel.
  test("mostra conversa, os 3 painéis e o diagnóstico do turno", async ({
    page,
  }) => {
    await page.goto("/design/playground");
    const painel = page.locator('[data-slot="sheet-content"]');
    await expect(painel).toBeVisible();
    await expect(
      painel.getByRole("heading", { name: "Testar o agente" })
    ).toBeVisible();
    // A promessa que faz o painel existir: testa o que está na tela, sem salvar.
    await expect(painel.getByText(/mesmo sem salvar/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Resetar" })).toBeVisible();
    // Painéis do diagnóstico.
    await expect(page.getByText("Handoff", { exact: true })).toBeVisible();
    await expect(page.getByText("Classificação", { exact: true })).toBeVisible();
    await expect(page.getByText("Resumo", { exact: true })).toBeVisible();
    // A conversa de exemplo termina em handoff aberto: a IA não manda bolha
    // (handoff silencioso), aparece o aviso central e o painel de handoff.
    await expect(
      page.getByText("A IA abriu handoff", { exact: true })
    ).toBeVisible();
    await expect(page.getByText(/não respondeu\. Oriente/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Orientar e responder" })
    ).toBeVisible();
    await expect(page.getByText("Aguardando atendimento")).toBeVisible();
    // Trecho recuperado do RAG aparece no painel de classificação.
    await expect(page.getByText(/Encaixes de urgência/)).toBeVisible();
    // O campo de mensagem existe (fala direto com a IA).
    await expect(
      page.getByPlaceholder("Escreva como um cliente escreveria...")
    ).toBeVisible();
  });
});

test.describe("Assinatura (/design/assinatura)", () => {
  test("conta bloqueada explica o estado sem prometer botão que não existe", async ({
    page,
  }) => {
    await page.goto("/design/assinatura");
    // O mock é o pior caso, que é o que o gate do servidor produz.
    await expect(
      page.getByRole("heading", { name: "Acesso pausado" })
    ).toBeVisible();
    await expect(page.getByText(/teste gratuito terminou/)).toBeVisible();
    await expect(
      page.getByText(/atendimento automático e o envio de mensagens estão parados/)
    ).toBeVisible();
    // O que o dono precisa conferir: estado, plano, atendentes e a conta.
    await expect(page.getByText("Plano", { exact: true })).toBeVisible();
    await expect(page.getByText("nenhum plano escolhido")).toBeVisible();
    await expect(page.getByText("Atendentes", { exact: true })).toBeVisible();
    // O dono não conta como atendente: 3 membros no mock viram 2 atendentes.
    await expect(page.getByText("2 além do dono")).toBeVisible();
    await expect(page.getByText("Teste termina em")).toBeVisible();
    // Sempre dá para sair (a tela é um beco sem saída se não tiver isso).
    await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
  });

  test("é caixa e não vitrine: preço, documento e pagamento, sem propaganda", async ({
    page,
  }) => {
    await page.goto("/design/assinatura");
    // Três linhas secas de plano, com preço e quantos atendentes.
    for (const p of ["Essencial", "Profissional", "Avançado"]) {
      await expect(page.getByText(p, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("R$ 197")).toBeVisible();
    await expect(page.getByText("R$ 597")).toBeVisible();
    // Documento é exigência do gateway para Pix e boleto, e a tela diz isso.
    await expect(page.getByLabel("CPF ou CNPJ de quem paga")).toBeVisible();
    await expect(page.getByText(/Exigido para emitir Pix e boleto/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ir para o pagamento" })
    ).toBeVisible();
    // Sem vitrine: nada de chamariz de marketing dentro do sistema.
    const texto = (await page.locator("body").innerText()).toLowerCase();
    expect(texto).not.toContain("mais popular");
    expect(texto).not.toContain("recomendado");
    expect(texto).not.toContain("melhor custo");
  });
});

// Desenho do atendimento aplicado em 18/09/2026 (pasta "Formulário enviado,
// aguardando respostas"), dentro da estrutura de cartões que já existia: o dono
// pediu para manter cartão de conversas, cartão de chat e cartão de detalhes.
test.describe("Lista de conversas redesenhada", () => {
  test("a lista vem agrupada por estado, com contagem", async ({ page }) => {
    await page.goto("/design");
    const grupos = page.locator('[data-slot="inbox-grupo"]');
    await expect(grupos.first()).toBeVisible();
    // A ordem é a da urgência, e é ela que responde "por onde eu começo?" sem
    // ninguém filtrar nada.
    const textos = (await grupos.allInnerTexts()).join(" | ");
    // Duas mudanças de 18/09/2026 nesta linha, e as duas são do desenho:
    // 1. "IA atendendo" e não "A IA está atendendo": em caixa alta o artigo só
    //    gastava largura.
    // 2. A flag `i`. O rótulo virou `uppercase` no CSS, e `innerText` devolve o
    //    texto COMO É PINTADO ("ESPERANDO VOCÊ"), não como está no JSX. Sem a
    //    flag o teste falharia por causa da caixa, que é justamente o que o
    //    papel `text-rotulo` existe para impor.
    expect(textos).toMatch(/Esperando você/i);
    expect(textos).toMatch(/Assumidas pelo time/i);
    expect(textos).toMatch(/IA atendendo/i);
  });

  // ── O que a fidelidade ao desenho travou (18/09/2026) ────────────────
  // Estes quatro nasceram de um retorno do dono na tela aplicada: "cores que não
  // tem, filtros errados, conversa selecionada não está no tom". Nenhum deles
  // checava nada antes, porque o esqueleto (agrupar, chip, contar) já passava
  // com a cor errada.

  test("cada grupo tem a SUA cor, e as três são diferentes", async ({ page }) => {
    await page.goto("/design");
    const grupos = page.locator('[data-slot="inbox-grupo"]');
    await expect(grupos.first()).toBeVisible();
    const cores = await grupos.evaluateAll((els) =>
      els.map((e) => getComputedStyle(e).color)
    );
    expect(cores.length).toBeGreaterThanOrEqual(3);
    // Eram três cabeçalhos cinza com um ponto âmbar no primeiro, e a lista lia
    // como "uma seção que importa e duas sobras". Cada estado tem dono: âmbar é
    // pendência, verde é humano, roxo é a IA.
    expect(new Set(cores).size).toBe(cores.length);
  });

  test("a conversa aberta tem barra da marca e fundo PRÓPRIO, não o do hover", async ({
    page,
  }) => {
    await page.goto("/design");
    const aberta = page.locator('[data-slot="inbox-item"][aria-current="page"]');
    await expect(aberta).toBeVisible();
    const medida = await aberta.evaluate((el) => {
      const raiz = getComputedStyle(document.documentElement);
      const barra = el.querySelector('[data-slot="inbox-barra"]') as HTMLElement;
      const pinta = (v: string) => {
        // Resolve o token para o mesmo formato que o getComputedStyle devolve.
        const s = document.createElement("span");
        s.style.color = v.trim();
        document.body.appendChild(s);
        const cor = getComputedStyle(s).color;
        s.remove();
        return cor;
      };
      return {
        fundo: getComputedStyle(el).backgroundColor,
        barra: getComputedStyle(barra).backgroundColor,
        selBg: pinta(raiz.getPropertyValue("--sel-bg")),
        selBar: pinta(raiz.getPropertyValue("--sel-bar")),
        activeBg: pinta(raiz.getPropertyValue("--active-bg")),
      };
    });
    // A barra é o roxo da marca, e a largura dela (3px) é o que o desenho pede.
    expect(medida.barra).toBe(medida.selBar);
    // ⚠️ E o fundo NÃO é `--active-bg`. Seleção e hover usavam a mesma cor, e
    // por isso passar o ponteiro em outra linha apagava o "você está aqui".
    expect(medida.fundo).toBe(medida.selBg);
    expect(medida.fundo).not.toBe(medida.activeBg);
  });

  test("quem espera por você tem barra âmbar mesmo com a conversa fechada", async ({
    page,
  }) => {
    await page.goto("/design");
    const barras = page.locator(
      '[data-slot="inbox-item"]:not([aria-current]) [data-slot="inbox-barra"]'
    );
    await expect(barras.first()).toBeVisible();
    const cores = await barras.evaluateAll((els) =>
      els.map((e) => getComputedStyle(e).backgroundColor)
    );
    const pintadas = cores.filter((c) => !c.includes("rgba(0, 0, 0, 0)"));
    // Exatamente uma no mock: a conversa com handoff aberto há 6h. Se TODAS
    // tivessem barra, ela não diria nada; se nenhuma tivesse, a fila só
    // apareceria depois de alguém filtrar.
    expect(pintadas).toHaveLength(1);
    expect(cores.length).toBeGreaterThan(1);
  });

  test("o chip de filtro ativo se distingue por COR, não só por peso", async ({
    page,
  }) => {
    await page.goto("/design");
    const chips = page.locator('[data-slot="inbox-chip"]');
    await expect(chips.first()).toBeVisible();
    const fundos = await chips.evaluateAll((els) =>
      els.map((e) => ({
        ativo: e.getAttribute("data-ativo") === "sim",
        fundo: getComputedStyle(e).backgroundColor,
        tinta: getComputedStyle(e).color,
      }))
    );
    const ativo = fundos.find((f) => f.ativo);
    expect(ativo).toBeTruthy();
    // O ativo inverte: fundo na tinta, rótulo na superfície. Antes ele mudava só
    // `font-weight` e a borda um degrau, o que não se lê a um metro da tela.
    for (const outro of fundos.filter((f) => !f.ativo)) {
      expect(ativo!.fundo).not.toBe(outro.fundo);
    }
  });

  test("o filtro mostra o número junto do rótulo", async ({ page }) => {
    await page.goto("/design");
    const chips = page.locator('[data-slot="inbox-chip"]');
    await expect(chips.first()).toBeVisible();
    // O menu suspenso antigo escondia a contagem atrás de um clique: dava para
    // ter conversas esperando por você sem nada na tela dizendo isso.
    for (const c of await chips.all()) await expect(c).toContainText(/\d+/);
  });

  test("filtrar desliga o agrupamento", async ({ page }) => {
    await page.goto("/design");
    const chip = page.locator('[data-slot="inbox-chip"]').filter({ hasText: /Esperando/ });
    await expect(chip).toBeVisible();
    await page.waitForTimeout(400);
    await chip.click();
    // Com a lista recortada, um cabeçalho repetindo o nome do filtro é ruído: a
    // lista inteira já é daquele grupo.
    await expect(page.locator('[data-slot="inbox-grupo"]')).toHaveCount(0);
  });
});

test.describe("Conversa redesenhada", () => {
  test("o entendimento da IA é a primeira linha da conversa", async ({ page }) => {
    await page.goto("/design");
    const faixa = page.locator('[data-slot="conversa-entendimento"]');
    await expect(faixa).toBeVisible();
    await expect(faixa).toContainText(/O cliente quer/i);
    // ⚠️ Uma vez só na tela. Antes o mesmo texto morava na coluna da direita;
    // ter os dois é a mesma frase duas vezes, e a de cima é a que se lê primeiro.
    await expect(page.getByText("Entendimento", { exact: true })).toHaveCount(0);
  });

  test("os modos do composer dizem PARA ONDE o texto vai", async ({ page }) => {
    await page.goto("/design");
    // Eram abas sublinhadas. Viraram botões porque trocar de modo aqui não troca
    // a vista do mesmo conteúdo: troca o destino, que é o erro caro desta tela
    // (mandar para o cliente o que era nota).
    await expect(page.getByRole("tab", { name: /Responder ao cliente/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Nota interna/ })).toBeVisible();
    await expect(page.getByText("vai para o WhatsApp do cliente")).toBeVisible();
    await page.getByRole("tab", { name: /Nota interna/ }).click();
    await expect(page.getByText("fica só entre vocês")).toBeVisible();
  });

});

// ── O que a fidelidade ao desenho travou na CONVERSA (18/09/2026) ──────
// Estes nasceram da lista do dono olhando a tela aplicada ao lado da prancha:
// "título do nome está diferente, telefone está diferente, chat de conversa as
// tabs estão diferentes". Nenhum dos três checava nada antes, porque a estrutura
// (existe nome, existe telefone, existem três abas) já passava com a tipografia
// e a cor erradas.
//
// ⚠️ DESCRIBE PRÓPRIO COM JANELA PRÓPRIA, e isto não é conveniência: o desenho
// foi aprovado em 1920 e comparado com a tela em 1600, e o cabeçalho da conversa
// esconde por largura o que não cabe (a hora da última mensagem e os rótulos de
// dois controles saem abaixo de 1536px, para o NOME nunca sair). Em 1280, que é
// o `Desktop Chrome` padrão do Playwright, metade destas asserções estaria
// medindo o modo estreito e chamando isso de desenho.
test.describe("Conversa redesenhada: fidelidade ao desenho", () => {
  test.use({ viewport: { width: 1600, height: 950 } });

  test("o nome do contato é tinta principal, e não a cor do avatar", async ({
    page,
  }) => {
    await page.goto("/design");
    const nome = page.locator('[data-slot="conversa-nome"]');
    await expect(nome).toBeVisible();
    const medido = await nome.evaluate((el) => {
      const c = getComputedStyle(el);
      // O avatar do cabeçalho é o vizinho anterior do bloco de texto: é dele que
      // o nome herdava a cor.
      const av = el
        .closest("header")!
        .querySelector('[data-slot="avatar"]') as HTMLElement;
      return {
        cor: c.color,
        fonte: c.fontFamily,
        tamanho: c.fontSize,
        peso: c.fontWeight,
        corDoAvatar: getComputedStyle(av).color,
      };
    });
    // O defeito: o nome saía pintado com a cor do avatar daquele contato. Cor de
    // avatar existe para diferenciar UMA linha das outras numa lista; aqui só há
    // um nome, então ela não distingue nada e ainda tira do nome a autoridade de
    // ser o texto mais forte da faixa.
    expect(medido.cor).not.toBe(medido.corDoAvatar);
    // Tipografia de título da casa, na família de display (medida no desenho).
    expect(medido.fonte).toMatch(/Space Grotesk/);
    expect(medido.tamanho).toBe("18px");
    expect(medido.peso).toBe("600");
  });

  test("o telefone é o endereço de WhatsApp, e não uma nota de rodapé", async ({
    page,
  }) => {
    await page.goto("/design");
    const tel = page.locator('[data-slot="conversa-telefone"]');
    const ultima = page.locator('[data-slot="conversa-ultima"]');
    await expect(tel).toBeVisible();
    await expect(ultima).toBeVisible();
    const corTel = await tel.evaluate((el) => getComputedStyle(el).color);
    const corUltima = await ultima.evaluate((el) => getComputedStyle(el).color);
    // Os dois eram a MESMA linha cinza de 12px, coladas por um ponto médio, e
    // as duas liam como sobra. Agora o telefone tem tratamento próprio (tinta
    // verde, o humano no WhatsApp) e a hora fica em tinta de apoio.
    expect(corTel).not.toBe(corUltima);
    // E o ponto ao lado dele, que é o que faz a cor significar "WhatsApp" em vez
    // de "link".
    await expect(tel.locator("span[aria-hidden]")).toHaveCount(1);
  });

  test("o modo ATIVO do composer é fundo cheio, e cada modo tem a sua cor", async ({
    page,
  }) => {
    await page.goto("/design");
    const abas = page.locator('[data-slot="tabs-trigger"][data-cor]');
    await expect(abas).toHaveCount(3);
    const fundos = await abas.evaluateAll((els) =>
      els.map((el) => ({
        estado: el.getAttribute("data-state"),
        bg: getComputedStyle(el).backgroundColor,
      }))
    );
    // 1. Cada modo carrega o próprio matiz mesmo desligado: é isso que ensina
    //    para onde o texto vai ANTES de a pessoa clicar. Antes os inativos eram
    //    cinzas, todos iguais.
    expect(new Set(fundos.map((f) => f.bg)).size).toBe(3);
    // 2. O ativo é FUNDO CHEIO (cor opaca); os inativos são superfície tingida
    //    (cor com alfa). Era o contrário: o ativo ficava na superfície tingida,
    //    com o mesmo peso visual de um chip qualquer, e o dono não conseguia
    //    dizer qual estava ligado.
    const ativo = fundos.find((f) => f.estado === "active")!;
    expect(ativo.bg).toMatch(/^rgb\(/);
    for (const f of fundos.filter((x) => x.estado !== "active")) {
      expect(f.bg).toMatch(/^rgba\(/);
    }
    // E a troca de modo leva o fundo cheio junto.
    // ⚠️ `expect.poll` e não uma leitura direta: o gatilho tem `transition-colors`
    // e a primeira medida pegava a cor NO MEIO da interpolação
    // (`rgba(124, 54, 240, 0.75)`), que não é nem a de origem nem a de destino.
    const corAtiva = page.getByRole("tab", { name: /Orientar a IA/ });
    await corAtiva.click();
    await expect
      .poll(() => corAtiva.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toMatch(/^rgb\(/);
    const bgOrientar = await corAtiva.evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );
    expect(bgOrientar).not.toBe(ativo.bg);
  });

  test("o separador de dia é VISÍVEL sobre a conversa", async ({ page }) => {
    await page.goto("/design");
    const dia = page.locator('[data-slot="conversa-dia"] [data-slot="badge"]');
    await expect(dia.first()).toBeVisible();
    // ⚠️ O defeito que este teste tranca: a pílula usava `bg-bloco`, e no tema
    // claro `--s-bloco` e `--s-msg` têm o MESMO valor. A pílula era desenhada
    // com borda, raio e respiro, e ficava invisível: na tela sobrava o texto
    // solto "27 DE JULHO DE 2026" no meio do nada. Testar a existência do
    // elemento nunca pegaria isso, porque ele sempre existiu.
    const cores = await dia.first().evaluate((el) => {
      const fundo = el.closest('[data-slot="scroll-area"]') ?? el.parentElement!;
      return {
        pilula: getComputedStyle(el).backgroundColor,
        conversa: getComputedStyle(fundo as HTMLElement).backgroundColor,
      };
    });
    expect(cores.pilula).not.toBe(cores.conversa);
  });

  test("o balão aponta para quem falou, e não cresce com a janela", async ({
    page,
  }) => {
    await page.goto("/design");
    const recebido = page
      .locator('[data-slot="conversa-balao"][data-autor="cliente"]')
      .first();
    const daIa = page
      .locator('[data-slot="conversa-balao"][data-autor="ia"]')
      .first();
    await expect(recebido).toBeVisible();
    await expect(daIa).toBeVisible();
    // O canto recortado (4px) é do AUTOR: em cima à esquerda no recebido, em
    // cima à direita no enviado. Era embaixo, e só no último balão de cada
    // sequência, o que dava geometrias diferentes para balões que dizem a mesma
    // coisa sobre quem falou.
    await expect(recebido).toHaveCSS("border-top-left-radius", "4px");
    await expect(daIa).toHaveCSS("border-top-right-radius", "4px");
    // Largura ABSOLUTA, medida no desenho. Era `min(74%, 560px)`, ou seja, o
    // balão encolhia justamente na tela estreita, onde ele precisa de mais
    // espaço, e a linha de texto crescia sem limite útil na tela larga.
    await expect(recebido).toHaveCSS("max-width", "620px");
  });

  test("a marca de que o time assumiu não inventa quem assumiu", async ({
    page,
  }) => {
    await page.goto("/design");
    const marco = page.locator('[data-slot="conversa-marco"]').first();
    await expect(marco).toBeVisible();
    await expect(marco).toContainText(/O time assumiu a conversa · \d{2}:\d{2}/i);
    // ⚠️ O desenho escreve "Bruna assumiu a conversa · 12:03", e o produto NÃO
    // pode: `chat_messages` não tem coluna de autor, então quem mandou pelo CRM
    // não fica gravado. Pôr aqui o responsável ATUAL da conversa (que o mock
    // tem, e chama Ana) seria afirmar uma coisa que o banco não sabe.
    const texto = await marco.innerText();
    expect(texto).not.toMatch(/Ana|Carlos/);
  });
});
