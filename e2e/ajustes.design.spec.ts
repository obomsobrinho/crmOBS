import { test, expect } from "@playwright/test";

// Os 8 ajustes pedidos em 22/08/2026, um teste por item, na ordem da lista do
// dono do produto. Roda sem login, nas telas /design.
//
// Um arquivo só, e não espalhado pelos specs por tela, de propósito: ele existe
// para a validação item a item. Depois de aprovado, cada teste pode migrar para
// o spec da tela a que pertence.

test.describe("Item 1: horário sai do modo avançado", () => {
  test("avançado mostra só o prompt; guiado mantém o horário", async ({ page }) => {
    await page.goto("/design/agente");

    // No guiado o horário É dado da empresa e continua lá. Virou sub-bloco (h3)
    // dentro da aba "O que ele sabe" na reorganização de 26/08.
    await page.getByRole("tab", { name: "O que ele sabe" }).click();
    await expect(
      page.getByRole("heading", { name: "Horário de atendimento", level: 3 })
    ).toBeVisible();

    await page.getByRole("button", { name: "Escrever o prompt à mão" }).click();

    // No avançado sobra o prompt e mais nada. O motivo é coerência: nome da
    // empresa também é dado da empresa e nunca esteve aqui.
    await expect(page.getByText("Prompt escrito à mão")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Horário de atendimento", level: 3 })
    ).toHaveCount(0);
    // E as três abas do guiado somem junto: o avançado é OUTRO formulário, não
    // mais uma seção deste.
    await expect(page.getByRole("tab")).toHaveCount(0);
  });
});

test.describe("Item 2: aviso de tamanho do prompt", () => {
  test("prompt de ~10 mil caracteres não é chamado de longo", async ({ page }) => {
    await page.goto("/design/agente");
    await page.getByRole("button", { name: "Ver prompt" }).click();
    const painel = page.locator('[data-slot="sheet-content"]');

    await expect(painel.getByText(/caracteres · ~/)).toBeVisible();
    // O limiar era 9.500, calibrado quando o esqueleto tinha ~5 KB. O esqueleto
    // passou de 7.900, então um formulário quase vazio já levava o aviso.
    await expect(painel.getByText(/prompt longo/)).toHaveCount(0);
    await expect(painel.getByText(/perto do teto/)).toHaveCount(0);
  });
});

test.describe("Item 3: Resetar no cabeçalho da bancada", () => {
  test("Resetar fica no cabeçalho, e não numa linha acima da conversa", async ({
    page,
  }) => {
    await page.goto("/design/playground");
    const painel = page.locator('[data-slot="sheet-content"]');
    await expect(painel).toBeVisible();

    // Cabeçalho = primeiro filho do painel. Resetar tem que estar nele.
    const cabecalho = painel.locator("> div").first();
    await expect(cabecalho.getByRole("button", { name: "Resetar" })).toBeVisible();

    // E o vão entre o cabeçalho e a conversa é só o respiro do painel. Era a
    // linha do Resetar que abria o espaço grande que o dono reportou.
    const vao = await page.evaluate(() => {
      const p = document.querySelector('[data-slot="sheet-content"]');
      const cab = p?.firstElementChild;
      const conversa = p?.querySelector(".bg-msg");
      if (!cab || !conversa) return null;
      return Math.round(
        conversa.getBoundingClientRect().top - cab.getBoundingClientRect().bottom
      );
    });
    expect(vao).not.toBeNull();
    expect(vao!).toBeLessThanOrEqual(24);
  });
});

// Item 4 foi REFEITO em 26/08. A primeira tentativa columnizou no nível da
// SEÇÃO, e isso quebrou a tela em 1024px, porque `Par` usa prefixo de viewport
// dentro de um container de 348px. A estrutura aprovada (variante A) é: uma
// coluna de seções, três grupos com nome, e colunas no nível do CAMPO.
test.describe("Item 4: guiado em três grupos, colunas no nível do campo", () => {
  const LARGURAS = [1440, 1280, 1024, 768];

  test("os três grupos viraram abas de verdade, que trocam o conteúdo", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto("/design/agente");

    // Os nomes seguem sendo a hierarquia (seis seções de peso igual era o que
    // produzia a sensação de caos), mas viraram ABAS em 28/08/2026, porque a
    // rolagem única de 2,6 telas era o problema que nenhum título resolvia.
    const abas = await page.getByRole("tab").allInnerTexts();
    expect(abas).toEqual([
      "Quem atende",
      "O que ele sabe",
      "O que ele pode fazer",
    ]);

    // ⚠️ TROCA DE VERDADE, e não índice de âncora, que já tinha sido rejeitado:
    // um painel visível por vez.
    //
    // Mede por LAYOUT (`offsetParent`), e não pelo atributo `hidden`: com
    // `forceMount` o Radix nunca põe `hidden`, e quem esconde é o
    // `data-[state=inactive]:hidden` da camada base. Testar o atributo passaria
    // a mentir no dia em que o CSS caísse.
    const visiveis = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('[data-slot="tabs-content"]')].filter(
            (p) => (p as HTMLElement).offsetParent !== null
          ).length
      );
    expect(await visiveis()).toBe(1);

    await expect(page.locator("#grupo-quem")).toBeVisible();
    await expect(page.locator("#grupo-sabe")).toBeHidden();

    await page.getByRole("tab", { name: "O que ele sabe" }).click();
    expect(await visiveis()).toBe(1);
    await expect(page.locator("#grupo-sabe")).toBeVisible();
    await expect(page.locator("#grupo-quem")).toBeHidden();

    // ⚠️ Os TRÊS painéis continuam MONTADOS (`forceMount`), mesmo escondidos.
    // Não é detalhe: `AgentBulletList` guarda o rascunho não adicionado no pai, e
    // desmontar faria o texto sumir da tela continuando a ser salvo.
    const montados = await page.locator('[data-slot="tabs-content"]').count();
    expect(montados).toBe(3);

    // Uma coluna em toda largura, como antes.
    for (const width of LARGURAS) {
      await page.setViewportSize({ width, height: 1200 });
      const xs = await page.evaluate(() => [
        ...new Set(
          [...document.querySelectorAll('[data-slot="tabs-content"]')]
            .filter((p) => (p as HTMLElement).offsetParent !== null)
            .map((p) => Math.round(p.getBoundingClientRect().left))
        ),
      ]);
      expect(xs, `largura ${width}`).toHaveLength(1);
    }
  });

  test("nenhum campo colapsa e nada é cortado, em nenhuma largura", async ({
    page,
  }) => {
    await page.goto("/design/agente");

    for (const width of LARGURAS) {
      await page.setViewportSize({ width, height: 1200 });

      // O defeito que originou tudo: campo de regra com 34px de largura para um
      // placeholder de 41 caracteres, e as 7 linhas de horário perdendo 26px.
      const m = await page.evaluate(() => {
        // Só campo de texto VISÍVEL: o input de arquivo do bloco de documentos é
        // `hidden` (um input só, dois gatilhos), e os campos dentro do bloco
        // recolhido de limites são escondidos por CSS, então os três medem 0.
        const inputs = [...document.querySelectorAll("input")].filter(
          (i) =>
            i.type !== "time" &&
            i.type !== "checkbox" &&
            i.type !== "file" &&
            (i as HTMLElement).offsetParent !== null
        );
        const cortados = [...document.querySelectorAll("section, section div")]
          .filter((e) => e.scrollWidth - e.clientWidth > 1)
          .map((e) => (e as HTMLElement).innerText.slice(0, 30));
        return {
          menor: Math.min(...inputs.map((i) => Math.round(i.getBoundingClientRect().width))),
          cortados,
        };
      });

      expect(m.cortados, `largura ${width}`).toEqual([]);
      expect(m.menor, `largura ${width}`).toBeGreaterThanOrEqual(200);
    }
  });

  test("a aba 'O que ele sabe' abre pelo horário, e os documentos ficam ao lado dele", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto("/design/agente");
    await page.getByRole("tab", { name: "O que ele sabe" }).click();

    // ⚠️ A ORDEM MUDOU EM 22/09/2026. Era Detalhes → Documentos → Horário (este
    // último atrás de um recolher), e o dono pediu o horário primeiro ("deveria
    // ser o primeiro dessa sessão"). O argumento é o mesmo que um dia pôs os
    // Detalhes na frente: quem abre esta aba quer o dado que o agente REPETE
    // para o cliente, e o horário é o único que ele repete palavra por palavra.
    // ⚠️ E MUDOU DE NOVO no mesmo dia: Documentos subiu para o LADO do horário,
    // e Detalhes desceu para a largura inteira (pedido do dono: "o documentos
    // pode ficar lado a lado com a sessão de horário e deixa por baixo o
    // detalhes do negócio"). A geometria é conferida no teste do arranjo; aqui
    // fica a ordem de leitura que sai disso.
    const pos = await page.evaluate(() => {
      const grupo = document.getElementById("grupo-sabe")!;
      const antes = (a: Element, b: Element) =>
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      const h3 = (re: RegExp) =>
        [...grupo.querySelectorAll("h3")].find((h) => re.test(h.textContent ?? ""))!;
      const horario = h3(/Horário de atendimento/);
      const docs = h3(/Documentos/i);
      const ta = grupo.querySelector("textarea")!;
      const abas = [...document.querySelectorAll('[data-slot="tabs-content"]')];
      return {
        horarioPrimeiro: !!horario && antes(horario, ta),
        docsAntesDosDetalhes: !!docs && antes(docs, ta),
        // Segunda aba das três, e não a última.
        indice: abas.indexOf(grupo),
        total: abas.length,
      };
    });
    expect(pos.horarioPrimeiro).toBe(true);
    expect(pos.docsAntesDosDetalhes).toBe(true);
    expect(pos.indice).toBe(1);
    expect(pos.total).toBe(3);
  });

  test("Objetivos perdem a pintura de marca", async ({ page }) => {
    await page.goto("/design/agente");
    // Eram três cartões em bg-brand-surface: o maior peso do corpo da tela para
    // a escolha que já vem com default e quase ninguém mexe.
    const pintados = await page.evaluate(
      () =>
        [...document.querySelectorAll("#grupo-pode label")].filter(
          (l) => l.querySelector('[role="checkbox"]') && /brand/.test(l.className)
        ).length
    );
    expect(pintados).toBe(0);
  });

  test("Salvar fica grudado no rodapé e avisa que salvar publica", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/design/agente");

    await expect(page.getByText("Salvar já publica no WhatsApp.")).toBeVisible();

    // Estava a 1.862px de rolagem, sem sticky: voltar para trocar um campo
    // custava rolar até o fim para confirmar.
    //
    // A asserção mede a FOLGA entre o fim do rodapé e o fim do cartão, e conta
    // elementos que aparecem nessa fresta. A primeira versão deste teste só
    // conferia `bottom <= innerHeight`, e por isso passou com o rodapé parado
    // 48px acima do fim, com conteúdo visível por baixo dele: `bottom: 0` cola
    // no fim da CONTENT box, e o cartão tinha `p-6`.
    const r = await page.evaluate(() => {
      const rodape = [...document.querySelectorAll("div")].find(
        (d) => getComputedStyle(d).position === "sticky"
      );
      if (!rodape) return null;
      const card = [...document.querySelectorAll("div")].find(
        (d) => getComputedStyle(d).overflowY === "auto"
      )!;
      const medir = () => {
        const c = card.getBoundingClientRect();
        const f = rodape.getBoundingClientRect();
        return {
          folga: Math.round(c.bottom - f.bottom),
          naFresta: [...card.querySelectorAll("section, section *")].filter(
            (e) => {
              const b = e.getBoundingClientRect();
              return b.top < c.bottom - 1 && b.top > f.bottom + 1;
            }
          ).length,
        };
      };
      card.scrollTop = 0;
      const topo = medir();
      card.scrollTop = card.scrollHeight;
      const fim = medir();
      return { topo, fim, temSalvar: /Salvar/.test(rodape.innerText) };
    });
    expect(r).not.toBeNull();
    expect(r!.temSalvar).toBe(true);
    for (const [onde, m] of Object.entries({ topo: r!.topo, fim: r!.fim })) {
      expect(m.folga, `folga no ${onde}`).toBeLessThanOrEqual(2);
      expect(m.naFresta, `conteúdo por baixo do rodapé no ${onde}`).toBe(0);
    }
  });

  test("a base de conhecimento mora no grupo 'O que ele sabe'", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/design/agente");
    await page.getByRole("tab", { name: "O que ele sabe" }).click();

    const grupo = page.locator("#grupo-sabe");
    await expect(grupo.getByRole("heading", { name: "Documentos" })).toBeVisible();
    await expect(
      grupo.getByRole("button", { name: /Enviar documento/ })
    ).toBeVisible();

    // Inventário curto: 3 documentos mais o "Ver todos", e não a lista inteira.
    // A área de arraste grande (py-8) vive no painel, senão somaria uns 400px.
    // Só os `li` fora do horário: o resumo do horário também é uma lista.
    const itens = grupo.locator("ul:not([data-slot=horario] ul) > li");
    await expect(itens).toHaveCount(3);
    await expect(grupo.getByRole("button", { name: "Ver todos (4)" })).toBeVisible();

    // Upload não passa pelo Salvar, e isso tem que estar ESCRITO: as 3 chamadas
    // do envio gravam na hora, enquanto o Salvar desta tela publica o prompt.
    // ⚠️ ATUALIZADO EM 21/09/2026: a frase perdeu a metade "sem precisar
    // salvar" quando o bloco de documentos encolheu, a pedido do dono. O que o
    // teste afirma continua sendo o mesmo: a tela DIZ que o upload nao passa
    // pelo Salvar, porque as tres chamadas do envio gravam na hora enquanto o
    // Salvar desta tela publica o prompt.
    await expect(
      grupo.getByText(/[Ee]ntra no ar quando termina de processar/)
    ).toBeVisible();
  });

  test("o painel de documentos é a mesma instância, com a área de arraste", async ({
    page,
  }) => {
    await page.goto("/design/agente");
    await page.getByRole("tab", { name: "O que ele sabe" }).click();
    await page.getByRole("button", { name: "Ver todos (4)" }).click();

    const painel = page.locator('[data-slot="sheet-content"]');
    await expect(painel).toBeVisible();
    // No painel a lista é INTEIRA (4), e a área de arraste aparece.
    await expect(painel.locator("ul > li")).toHaveCount(4);
    await expect(painel.getByText(/Arraste um arquivo ou clique/)).toBeVisible();
  });

  test("horário e limites não recolhem: os campos estão na tela", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/design/agente");

    // ⚠️ ATUALIZADO EM 22/09/2026, e o teste mudou de afirmação. Ele provava a
    // regra do recolher (fechado, a linha do título mostra o VALOR, então quem
    // volta para conferir lê sem abrir), e essa regra continua válida para
    // quem usar `Recolhivel`. O que mudou é que estes DOIS blocos deixaram de
    // recolher, a pedido do dono: "horário de atendimento não deveria ficar
    // colapsado" e "limites e quando chamar o time não precisa ser colapsado
    // também, tem espaço abaixo". Recolher pagava por si quando isto era uma
    // página de rolagem única; com três abas, o espaço existe e o que sobrava
    // era um clique entre a pessoa e o campo.
    //
    // A afirmação nova é a que o dono quis: o campo está na tela, sem clique.
    await page.getByRole("tab", { name: "O que ele sabe" }).click();
    await expect(
      page.getByRole("heading", { name: "Horário de atendimento", level: 3 })
    ).toBeVisible();
    // A prova era a observação de horário, que saiu da tela em 22/09/2026
    // (pedido do dono). O que continua na tela sem clique é a chave do sábado.
    await expect(page.getByRole("switch", { name: "Sábado aberto" })).toBeVisible();
    // E não sobrou gatilho de recolher em nenhum dos dois títulos.
    await expect(
      page.getByRole("button", { name: /Horário de atendimento/ })
    ).toHaveCount(0);

    await page.getByRole("tab", { name: "O que ele pode fazer" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Limites e quando chamar o time",
        level: 3,
      })
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("Ex.: nunca dar desconto por conta própria")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Limites e quando chamar o time/ })
    ).toHaveCount(0);
  });

  test("todo bloco do construtor tem o MESMO título, em todas as abas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto("/design/agente");

    // ⚠️ O defeito que este teste tranca (22/09/2026): ao tirar o recolher de
    // "Horário de atendimento" e de "Limites e quando chamar o time" eu copiei
    // o cabeçalho do `Recolhivel`, que é `text-rotulo` em CAIXA ALTA, e os dois
    // nasceram diferentes de "Documentos", que é `text-cartao` em caixa normal.
    // O dono viu na primeira olhada: "título do horário de atendimento tá
    // diferente dos outros, título de documento por exemplo".
    //
    // A regra é a hierarquia de três níveis (fundamentos-tipografia.md):
    // `text-cartao` encabeça um bloco COM ESTRUTURA PRÓPRIA, e caixa alta é
    // para o rótulo de um VALOR ou de um sub-bloco RECOLHÍVEL. Sem o recolher,
    // estes blocos são do primeiro tipo. Por isso o teste varre as abas em vez
    // de conferir um título: o que estava errado não era um bloco, era haver
    // dois vocabulários para a mesma coisa.
    for (const [aba, grupo] of [
      ["O que ele sabe", "#grupo-sabe"],
      ["O que ele pode fazer", "#grupo-pode"],
    ] as const) {
      await page.getByRole("tab", { name: aba }).click();
      const estilos = await page.locator(`${grupo} h3`).evaluateAll((els) =>
        els.map((el) => {
          const s = getComputedStyle(el);
          return {
            txt: (el.textContent ?? "").trim(),
            fs: s.fontSize,
            caixa: s.textTransform,
            peso: s.fontWeight,
          };
        })
      );
      expect(estilos.length, aba).toBeGreaterThan(1);
      for (const e of estilos) {
        expect(e.caixa, `${aba}: ${e.txt}`).toBe("none");
        expect(e.fs, `${aba}: ${e.txt}`).toBe("16px");
        expect(e.peso, `${aba}: ${e.txt}`).toBe("600");
      }
    }
  });

  test("horário: dias úteis num grupo só, sábado e domingo com hora e chave à vista", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/design/agente");
    await page.getByRole("tab", { name: "O que ele sabe" }).click();

    // 22/09/2026, segunda rodada do dono: "segunda a sexta deve ser um único
    // grupo", "sábado e domingo devem aparecer separadamente", e sem o botão
    // "Personalizar por dia", sem a observação de horário e sem a lista de sete
    // dias. Substitui o teste do modo simples/dia a dia da primeira rodada.
    const h = page.locator('[data-slot="horario"]');
    const semana = h.locator('[data-slot="horario-semana"]');
    await expect(semana.getByText("Segunda a sexta")).toBeVisible();
    await expect(semana.getByText("Seg • Ter • Qua • Qui • Sex")).toBeVisible();
    await expect(semana.getByText("08:00 às 18:00")).toBeVisible();
    await expect(page.getByText("Observação de horário")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Personalizar por dia" })).toHaveCount(0);

    // Fechado não esconde a hora: os campos ficam lá, desligados. São 4 campos
    // no total (2 do sábado, 2 do domingo); o grupo só mostra os dele ao editar.
    const sab = h.locator('[data-slot="horario-sab"]');
    await expect(h.locator('input[type="time"]')).toHaveCount(4);
    await expect(sab.locator('input[type="time"]').first()).toBeDisabled();
    await sab.getByRole("switch", { name: "Sábado aberto" }).click();
    await expect(sab.getByText("Aberto")).toBeVisible();
    await expect(sab.locator('input[type="time"]').first()).toBeEnabled();

    // Exceção dentro do grupo: "na sexta vou editar somente ela, pois na sexta
    // saio mais cedo". A sexta ganha linha própria, e mudar o padrão DEPOIS
    // não passa por cima dela.
    await semana.getByRole("button", { name: "Editar" }).click();
    await semana.getByRole("button", { name: "Horário diferente em um dia" }).click();
    await semana.getByRole("button", { name: "Sex" }).last().click();
    await semana.getByLabel("Fecha às (sexta)").fill("17:00");
    await semana.getByLabel("Fecha às (dias úteis)").fill("19:00");
    await semana.getByRole("button", { name: "Concluir" }).click();
    await expect(semana.getByText("Seg • Ter • Qua • Qui", { exact: true })).toBeVisible();
    await expect(semana.getByText("08:00 às 19:00")).toBeVisible();
    await expect(semana.getByText("Sexta", { exact: true })).toBeVisible();
    await expect(semana.getByText("08:00 às 17:00")).toBeVisible();

    // Desmarcar um dia o tira do resumo.
    await semana.getByRole("button", { name: "Editar" }).click();
    await semana.getByRole("button", { name: "Qui" }).click();
    await semana.getByRole("button", { name: "Concluir" }).click();
    await expect(semana.getByText("Seg • Ter • Qua", { exact: true })).toBeVisible();
  });

  test("horário e documentos lado a lado, detalhes do negócio embaixo", async ({
    page,
  }) => {
    // 22/09/2026, pedido do dono. Mede a geometria em vez de confiar na ordem
    // do DOM: o arranjo é o que ele pediu, não a sequência.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/design/agente");
    await page.getByRole("tab", { name: "O que ele sabe" }).click();
    const caixa = (nome: string) =>
      page
        .locator("#grupo-sabe")
        .getByRole("heading", { name: nome, level: 3 })
        .boundingBox();
    const [h, d, n] = await Promise.all([
      caixa("Horário de atendimento"),
      caixa("Documentos"),
      caixa("Detalhes do negócio"),
    ]);
    expect(Math.abs(h!.y - d!.y)).toBeLessThan(4);
    expect(d!.x).toBeGreaterThan(h!.x + 300);
    expect(n!.y).toBeGreaterThan(h!.y + 100);

    // "Está tudo torto": os dois CARTÕES da linha começam e terminam juntos.
    const moldura = (sel: string) =>
      page.locator(sel).evaluate((e) => {
        const b = e.getBoundingClientRect();
        return { topo: Math.round(b.top), fim: Math.round(b.bottom) };
      });
    const [mh, md] = await Promise.all([
      moldura('[data-slot="horario"]'),
      moldura('[data-slot="docs-lista"]'),
    ]);
    expect(md).toEqual(mh);
  });

  test("todo bloco do construtor tem ícone, nas três abas", async ({ page }) => {
    // "dentro de quem atende faltou os ícones": o teste varre as TRÊS abas,
    // porque o defeito foi exatamente uma aba ficar de fora.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/design/agente");
    for (const [aba, grupo] of [
      ["Quem atende", "#grupo-quem"],
      ["O que ele sabe", "#grupo-sabe"],
      ["O que ele pode fazer", "#grupo-pode"],
    ] as const) {
      await page.getByRole("tab", { name: aba }).click();
      const titulos = page.locator(`${grupo} h3`);
      const icones = page.locator(`${grupo} [data-slot="bloco-icone"]`);
      expect(await titulos.count(), aba).toBeGreaterThan(1);
      expect(await icones.count(), aba).toBe(await titulos.count());
    }
  });

  test("o aviso de cache existe nos DOIS modos, junto do campo que o resolve", async ({
    page,
  }) => {
    await page.goto("/design/agente");

    // Ele saiu do topo da tela. No guiado o campo que resolve é "Detalhes do
    // negócio"; no avançado é a própria textarea, e é lá que o aviso de fato
    // dispara (o esqueleto vazio do guiado já dá cerca de 2.146 tokens).
    await page.getByRole("button", { name: "Escrever o prompt à mão" }).click();
    const ta = page.locator("textarea");
    await ta.fill("Você é a Alê, atendente da Ótica Vision.");

    const aviso = page.getByText(/reaproveitar o prompt entre mensagens/);
    await expect(aviso).toBeVisible();

    // E está DEPOIS da textarea, não num banner no topo.
    const ordem = await page.evaluate(() => {
      const p = [...document.querySelectorAll("p")].find((x) =>
        /reaproveitar o prompt/.test(x.textContent ?? "")
      )!;
      const t = document.querySelector("textarea")!;
      return p.getBoundingClientRect().top > t.getBoundingClientRect().top;
    });
    expect(ordem).toBe(true);
  });

  test("montagem e edição são DUAS SUPERFÍCIES, não dois estados da mesma tela", async ({
    page,
  }) => {
    // ⚠️ ESTE TESTE AFIRMAVA O CONTRÁRIO até 28/08/2026, quando montar e editar
    // eram a mesma página com voz diferente. O padrão de setup do WooCommerce
    // ganhou a discussão: um assistente que roda uma vez em rota própria, e uma
    // tela permanente de abas. Um não cancela o outro.
    await page.goto("/design/montagem");
    const montagem = await page.evaluate(() => ({
      contador: /Passo \d de 4/.test(document.body.innerText),
      salvar: [...document.querySelectorAll("button")].some(
        (b) => b.textContent?.trim() === "Salvar"
      ),
      abas: document.querySelectorAll('[role="tab"]').length,
    }));

    await page.goto("/design/agente");
    const edicao = await page.evaluate(() => ({
      contador: /Passo \d de 4/.test(document.body.innerText),
      salvar: [...document.querySelectorAll("button")].some(
        (b) => b.textContent?.trim() === "Salvar"
      ),
      abas: document.querySelectorAll('[role="tab"]').length,
    }));

    // O assistente conta passos e não tem Salvar avulso: ele grava sozinho ao
    // sair do passo 3, e a pessoa nunca precisa decidir quando salvar.
    expect(montagem).toEqual({ contador: true, salvar: false, abas: 0 });
    // A tela permanente tem abas e Salvar, e NENHUM numeral de passo: aqueles
    // eram o wizard improvisado.
    expect(edicao).toEqual({ contador: false, salvar: true, abas: 3 });
  });

  test("o rodapé só promete publicação quando ela é verdade", async ({ page }) => {
    // CORREÇÃO, não estilo: `lib/agent-turn.ts` devolve turno silencioso quando
    // `agent_published_at` é nulo, então antes da primeira ativação salvar NÃO
    // publica. A tela dizia que publicava, e assustava o cliente final justamente
    // no momento em que ele está mais inseguro.
    //
    // Este estado ficou raro (quem não publicou vai para `/montagem`), mas não
    // sumiu: quem digita `/agente` antes de ativar, tipicamente para entrar no
    // modo avançado, continua caindo aqui.
    await page.goto("/design/agente?estado=montagem");
    await expect(page.getByText(/Ainda não vai ao ar/)).toBeVisible();
    await expect(page.getByText("Salvar já publica no WhatsApp.")).toHaveCount(0);

    await page.goto("/design/agente");
    await expect(page.getByText("Salvar já publica no WhatsApp.")).toBeVisible();
    await expect(page.getByText(/Ainda não vai ao ar/)).toHaveCount(0);
  });

  test("um contador de progresso só na conta inteira", async ({ page }) => {
    // Era a objeção principal contra montar dentro da tela de edição: stepper
    // dentro do passo 2 de outro stepper. Resolvido por construção: o assistente
    // absorveu a barra de onboarding, então o contador existe num lugar só.
    const contadores = (texto: string) =>
      (texto.match(/\d+\s+de\s+\d+/g) ?? []).length;

    await page.goto("/design/montagem");
    expect(contadores(await page.locator("body").innerText())).toBe(1);

    // A linha que sobrou da barra NÃO conta passos.
    await page.goto("/design/onboarding");
    expect(contadores(await page.locator("body").innerText())).toBe(0);
  });

  test("os presets trocam de lugar, não de existência", async ({ page }) => {
    // No assistente são convite e abrem o passo; na tela permanente são ação
    // destrutiva. ⚠️ Desde 22/09/2026 a ação é um MENU na linha das abas, e não
    // mais pílulas no pé de "Quem atende" (decisão do dono): o modelo mexe nas
    // três abas, e no pé de uma delas parecia valer só para ela.
    await page.goto("/design/montagem?passo=quem");
    await expect(
      page
        .locator('[data-slot="preset-convite"]')
        .getByRole("button", { name: "Clínica odontológica" })
    ).toBeVisible();
    await expect(page.locator("[data-preset-menu]")).toHaveCount(0);

    await page.goto("/design/agente");
    await expect(page.locator('[data-slot="preset-convite"]')).toHaveCount(0);
    await expect(page.getByText("Não sabe o que escrever?")).toHaveCount(0);
    // Fora de qualquer aba: aparece igual nas três.
    await expect(page.locator("[role=tabpanel] [data-preset-menu]")).toHaveCount(0);
    await page.getByRole("button", { name: "Usar um modelo" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Clínica odontológica" })
    ).toBeVisible();
  });

  test("não tem índice de âncoras no topo", async ({ page }) => {
    await page.goto("/design/agente");
    // Existiu por uma versão e saiu por decisão do dono: com três grupos de nome
    // curto, ele repetia na horizontal o que os títulos dizem 40px abaixo.
    await expect(page.locator('a[href^="#grupo"]')).toHaveCount(0);
  });

  test("aplicar um modelo não apaga horário, endereço nem site", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto("/design/agente");

    // Bug de perda de dado: `applyPreset` espalhava o preset inteiro (que é
    // EMPTY_CONFIG mais seis campos), então zerava horário, endereço, site e o
    // aviso de handoff. E o guarda de confirmação não olhava esses campos.
    const antes = await page.evaluate(() => ({
      endereco: [...document.querySelectorAll("input")].find((i) =>
        i.value.includes("Rua das Flores")
      )?.value,
      obs: [...document.querySelectorAll("input")].find(
        (i) => i.value === "fechado em feriados"
      )?.value,
      hora: document.querySelector<HTMLInputElement>("input[type=time]")?.value,
    }));

    // O modelo mora no menu da linha das abas desde 22/09/2026.
    await page.getByRole("button", { name: "Usar um modelo" }).click();
    await page.getByRole("menuitem", { name: "Clínica odontológica" }).click();
    const dialogo = page.locator('[data-slot="dialog-content"]');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole("button", { name: "Aplicar modelo" }).click();

    const depois = await page.evaluate(() => ({
      endereco: [...document.querySelectorAll("input")].find((i) =>
        i.value.includes("Rua das Flores")
      )?.value,
      obs: [...document.querySelectorAll("input")].find(
        (i) => i.value === "fechado em feriados"
      )?.value,
      hora: document.querySelector<HTMLInputElement>("input[type=time]")?.value,
    }));

    expect(depois).toEqual(antes);
    // E o comportamento REALMENTE trocou, senão o teste passaria por não fazer nada.
    await expect(
      page.locator("textarea").first()
    ).toHaveValue(/clínica odontológica/i);
  });

});

test.describe("Item 5: menu do rail ancorado no botão", () => {
  test("o menu abre junto do gatilho, e não solto sobre a faixa do WhatsApp", async ({
    page,
  }) => {
    await page.goto("/design");
    // A tela tem três dropdowns (o do tenant, o filtro da lista e o de
    // atribuição): o do rail é o único que oferece "Ver perfil".
    await page.getByRole("button", { name: /Ver perfil/ }).click();

    const menu = page.locator('[data-slot="dropdown-menu-content"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Perfil")).toBeVisible();

    // Era `sideOffset={104}`, número mágico posto para não cobrir a faixa
    // "WhatsApp conectado". O efeito foi o painel parecer solto no meio da tela.
    const dist = await page.evaluate(() => {
      const m = document.querySelector('[data-slot="dropdown-menu-content"]');
      // Só o gatilho aberto interessa; os outros dois estão fechados.
      const g = document.querySelector(
        '[data-slot="dropdown-menu-trigger"][aria-expanded="true"]'
      );
      if (!m || !g) return null;
      return Math.round(
        g.getBoundingClientRect().top - m.getBoundingClientRect().bottom
      );
    });
    expect(dist).not.toBeNull();
    expect(dist!).toBeLessThanOrEqual(12);
  });
});

test.describe("Item 6: reordenar estágio arrastando", () => {
  test("as setas saíram e existe um punho de arraste por estágio", async ({
    page,
  }) => {
    await page.goto("/design/pipeline");
    await page.getByRole("button", { name: "Gerenciar estágios" }).click();
    const dialogo = page.locator('[data-slot="dialog-content"]');
    await expect(dialogo).toBeVisible();

    await expect(dialogo.getByRole("button", { name: "Subir" })).toHaveCount(0);
    await expect(dialogo.getByRole("button", { name: "Descer" })).toHaveCount(0);
    await expect(dialogo.getByRole("button", { name: /^Reordenar / })).toHaveCount(
      4
    );
  });

  test("arrastar troca a ordem", async ({ page }) => {
    await page.goto("/design/pipeline");
    await page.getByRole("button", { name: "Gerenciar estágios" }).click();
    const dialogo = page.locator('[data-slot="dialog-content"]');
    const campos = dialogo.locator("ul > li input[type='text'], ul > li input:not([type])");

    await expect(campos.first()).toHaveValue("Novo");

    // Arrasta o primeiro para cima do terceiro.
    const linhas = dialogo.locator("ul > li");
    await linhas.nth(0).dragTo(linhas.nth(2));

    // "Novo" saiu do topo, que é o que reordenar por arraste tem que provar.
    await expect(campos.first()).not.toHaveValue("Novo");
  });

  test("o punho também reordena por teclado", async ({ page }) => {
    await page.goto("/design/pipeline");
    await page.getByRole("button", { name: "Gerenciar estágios" }).click();
    const dialogo = page.locator('[data-slot="dialog-content"]');
    const campos = dialogo.locator("ul > li input[type='text'], ul > li input:not([type])");

    // Arraste nativo do HTML não funciona por teclado, então o punho aceita seta:
    // sem isso, trocar as setas por arraste tiraria a reordenação de quem não
    // usa mouse.
    await dialogo.getByRole("button", { name: /^Reordenar Novo/ }).focus();
    await page.keyboard.press("ArrowDown");

    await expect(campos.nth(1)).toHaveValue("Novo");
  });
});

test.describe("Item 7: quem está atendendo, no avatar", () => {
  test("o ponto âmbar de pausa não existe mais na lista", async ({ page }) => {
    await page.goto("/design");
    // Era ele que lia como "precisa de você": âmbar é cor de alerta, e estava
    // aceso em toda conversa pausada (7 de 7 na Loja Teste, 46 de 47 na OBM).
    await expect(
      page.getByText("Você está atendendo (IA pausada)")
    ).toHaveCount(0);
  });

  test("pausada sem responsável vira alerta de sem atendimento", async ({
    page,
  }) => {
    await page.goto("/design");
    const alerta = page.locator(".bg-danger-surface");
    await expect(alerta.first()).toBeVisible();
  });

  test("âmbar na lista passou a ser handoff, e não pausa", async ({ page }) => {
    await page.goto("/design");
    // ⚠️ ATUALIZADO EM 19/09/2026: o mock tinha um handoff de 6h e este teste
    // procurava o texto "6h". A conversa com handoff passou a ser de ONTEM, para
    // provar que o recorte de tempo novo da lista (padrão "Hoje") não esconde
    // quem espera por você. A espera agora varia com a hora em que o teste roda,
    // então a asserção é a do CHIP de espera, que é o que este teste sempre quis
    // dizer: o âmbar da lista fala de handoff, não de pausa.
    await expect(
      page.locator('[data-slot="inbox-estado"]').first()
    ).toContainText(/esperando/);
  });
});

test.describe("Item 8: card do pipeline", () => {
  test("resumo da IA sai do âmbar e o alerta aparece quando ninguém atende", async ({
    page,
  }) => {
    await page.goto("/design/pipeline");

    // O caso reportado: card movido para Fechado que continuava parecendo
    // pendência, com ponto e resumo em âmbar.
    const resumo = page.getByText(/valor do plano anual e ficou de responder/);
    await expect(resumo).toBeVisible();

    // O resumo acende sempre que existe qualificação, para sempre e em qualquer
    // estágio: então não pode usar a cor de pendência.
    const classe = await resumo.evaluate(
      (el) => (el.parentElement as HTMLElement).className
    );
    expect(classe).not.toContain("warn");

    // E o ponto no avatar agora diz "ninguém atende", que é o que de fato ocorre
    // com a IA pausada e nenhum responsável.
    await expect(
      page.getByTitle("Sem atendimento: a IA está pausada e ninguém assumiu")
    ).toHaveCount(1);
    await expect(
      page.getByTitle("Você está atendendo (IA pausada)")
    ).toHaveCount(0);
  });
});

// Desenho de 18/09/2026 aplicado ao Kanban (pasta "Kanban com chips e cards
// inteligentes"). O que estes testes travam é o que o desenho pediu E o que ele
// pediu e NÃO foi feito, que é a parte fácil de alguém "consertar" sem saber.
test.describe("Kanban redesenhado", () => {
  test("o card mostra IDADE, e não a hora do relógio", async ({ page }) => {
    await page.goto("/design/pipeline");
    const card = page.locator('[data-slot="pipeline-card"]').first();
    await expect(card).toBeVisible();
    // "hoje", "1 dia", "12 dias". Num funil o que importa é há quanto tempo o
    // card está parado; "17:36" dizia a mesma coisa para o de hoje e o de 12 dias.
    await expect(card).toContainText(/hoje|\d+ dias?/);
    await expect(card).not.toContainText(/^\d{2}:\d{2}$/);
  });

  test("a coluna diz quantos esperam você e há quanto tempo está o mais parado", async ({
    page,
  }) => {
    await page.goto("/design/pipeline");
    const resumos = page.locator('[data-slot="pipeline-coluna-resumo"]');
    await expect(resumos.first()).toBeVisible();
    await expect(
      resumos.filter({ hasText: /esperando você/ }).first()
    ).toBeVisible();
    await expect(
      resumos.filter({ hasText: /mais antigo há/ }).first()
    ).toBeVisible();
  });

  test('"Sua vez" só aparece em card com handoff em aberto', async ({ page }) => {
    await page.goto("/design/pipeline");
    const comHandoff = page
      .locator('[data-slot="pipeline-card"]')
      .filter({ hasText: "Sua vez" });
    const total = page.locator('[data-slot="pipeline-card"]');
    const n = await comHandoff.count();
    expect(n).toBeGreaterThan(0);
    // Âmbar é pendência de verdade, e pendência de verdade é handoff aberto. Se
    // todo card tivesse o selo, ele não diria nada.
    expect(n).toBeLessThan(await total.count());
    await expect(comHandoff.first()).toContainText(/esperando/);
  });

  test("o filtro Esperando você recorta o quadro", async ({ page }) => {
    await page.goto("/design/pipeline");
    // ⚠️ Esperar a tela ASSENTAR antes de clicar. Clicar logo depois do goto
    // passa na checagem de visibilidade do Playwright e mesmo assim erra o
    // botão: a posição é medida antes da hidratação, a barra reflui, e o clique
    // aterrissa no div da barra. O sintoma é cruel, porque o teste não falha no
    // clique, falha na asserção seguinte, parecendo bug de produto.
    const botao = page.getByRole("button", { name: /Esperando você/ });
    await expect(botao).toBeVisible();
    await page.waitForTimeout(600);
    const todos = await page.locator('[data-slot="pipeline-card"]').count();
    await botao.click();
    const depois = page.locator('[data-slot="pipeline-card"]');
    await expect(depois.first()).toBeVisible();
    // `expect.poll`: o recorte é estado do React, e ler a contagem no quadro
    // seguinte ao clique pega a lista velha.
    await expect.poll(() => depois.count()).toBeLessThan(todos);
    for (const c of await depois.all())
      await expect(c).toContainText("Sua vez");
  });

  test("⚠️ o card NÃO escreve o que fazer nem o que a IA está fazendo", async ({
    page,
  }) => {
    await page.goto("/design/pipeline");
    const quadro = page.locator("body");
    // O desenho traz uma frase por card ("A IA está montando o orçamento pela
    // tabela", "Cobrar o retorno ou mover para Fechado"). Esse dado NÃO existe:
    // conversation_qualifications guarda action, summary e preferência de
    // horário, e nada disso vira instrução em prosa. Escrever uma frase
    // plausível seria inventar o estado da conversa na tela onde o time decide o
    // que fazer, que é o oposto do que o produto promete.
    await expect(quadro).not.toContainText(/A IA está /);
    await expect(quadro).not.toContainText(/Cobrar o retorno/);
  });
});

test.describe("Aba ativa do /agente", () => {
  test("a aba ativa tem barra COLORIDA, e a inativa não tem", async ({ page }) => {
    await page.goto("/design/agente");
    const abas = page.getByRole("tab");
    await expect(abas.first()).toBeVisible();
    // ⚠️ Mede a COR da barra, não a classe nem o negrito. O defeito que isto
    // trava (relatado pelo dono em 18/09/2026) era exatamente uma barra presente
    // no DOM e transparente na tela, porque `--aba-cor` não tinha valor: as três
    // abas se distinguiam só por peso de fonte, e ninguém achava a ativa.
    const cores = await page.evaluate(() =>
      [...document.querySelectorAll('[data-slot="tabs-trigger"]')].map((t) => {
        const barra = t.querySelector('[data-slot="tabs-trigger-bar"]');
        return {
          ativa: t.getAttribute("data-state") === "active",
          cor: barra ? getComputedStyle(barra).backgroundColor : "",
        };
      })
    );
    const ativa = cores.find((c) => c.ativa);
    expect(ativa, "nenhuma aba ativa").toBeTruthy();
    expect(ativa!.cor).not.toBe("rgba(0, 0, 0, 0)");
    expect(ativa!.cor).not.toBe("transparent");
    for (const c of cores.filter((x) => !x.ativa))
      expect(c.cor).toBe("rgba(0, 0, 0, 0)");
  });
});
