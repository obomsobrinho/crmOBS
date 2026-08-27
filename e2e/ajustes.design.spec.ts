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
    // dentro do grupo "O que ele sabe" na reorganização de 26/08.
    await expect(
      page.getByRole("heading", { name: "Horário de atendimento", level: 3 })
    ).toBeVisible();

    await page.getByRole("tab", { name: /Avançado/ }).click();

    // No avançado sobra uma seção só. O motivo é coerência: nome da empresa
    // também é dado da empresa e nunca esteve aqui.
    const titulos = await page.locator("h2").allInnerTexts();
    expect(titulos).toEqual(["Prompt (modo avançado)"]);
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

  test("os grupos são três, com nome, sempre em uma coluna", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto("/design/agente");

    // Os nomes são a hierarquia: seis seções de peso igual era o que produzia a
    // sensação de caos.
    const titulos = await page.locator("section h2").allInnerTexts();
    expect(titulos).toEqual([
      "Quem atende",
      "O que ele sabe",
      "O que ele pode fazer",
    ]);

    for (const width of LARGURAS) {
      await page.setViewportSize({ width, height: 1200 });
      const xs = await page.evaluate(() => [
        ...new Set(
          [...document.querySelectorAll("section h2")].map((h) =>
            Math.round(h.closest("section")!.getBoundingClientRect().left)
          )
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

  test("Detalhes do negócio sai do fim da página e vira o herói do 2º grupo", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto("/design/agente");

    // Antes era o ÚLTIMO bloco da tela. É o campo que mais muda a qualidade da
    // resposta e o único que resolve o aviso de cache de prompt.
    const pos = await page.evaluate(() => {
      const grupo = document.getElementById("grupo-sabe")!;
      const ta = grupo.querySelector("textarea")!;
      const docs = [...grupo.querySelectorAll("h3")].find((h) =>
        /Documentos/i.test(h.textContent ?? "")
      )!;
      return {
        // Vem ANTES do bloco de documentos e do horário, ou seja, é o primeiro
        // campo do grupo. Comparar por posição no documento em vez de por
        // `firstElementChild`: o cabeçalho do grupo virou um nó próprio quando o
        // numeral e o estado entraram.
        ehPrimeiroDoGrupo:
          !!docs &&
          (ta.compareDocumentPosition(docs) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
            0,
        grupoIndice: [...document.querySelectorAll("section h2")].findIndex(
          (h) => h.closest("section") === grupo
        ),
        ultimo:
          document.querySelectorAll("section")[
            document.querySelectorAll("section").length - 1
          ] === grupo,
      };
    });
    expect(pos.ehPrimeiroDoGrupo).toBe(true);
    expect(pos.grupoIndice).toBe(1);
    expect(pos.ultimo).toBe(false);
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

    const grupo = page.locator("#grupo-sabe");
    await expect(grupo.getByRole("heading", { name: "Documentos" })).toBeVisible();
    await expect(
      grupo.getByRole("button", { name: /Enviar documento/ })
    ).toBeVisible();

    // Inventário curto: 3 documentos mais o "Ver todos", e não a lista inteira.
    // A área de arraste grande (py-8) vive no painel, senão somaria uns 400px.
    const itens = grupo.locator("ul > li");
    await expect(itens).toHaveCount(3);
    await expect(grupo.getByRole("button", { name: "Ver todos (4)" })).toBeVisible();

    // Upload não passa pelo Salvar, e isso tem que estar ESCRITO: as 3 chamadas
    // do envio gravam na hora, enquanto o Salvar desta tela publica o prompt.
    await expect(
      grupo.getByText(/entra no ar quando termina de processar, sem precisar salvar/)
    ).toBeVisible();
  });

  test("o painel de documentos é a mesma instância, com a área de arraste", async ({
    page,
  }) => {
    await page.goto("/design/agente");
    await page.getByRole("button", { name: "Ver todos (4)" }).click();

    const painel = page.locator('[data-slot="sheet-content"]');
    await expect(painel).toBeVisible();
    // No painel a lista é INTEIRA (4), e a área de arraste aparece.
    await expect(painel.locator("ul > li")).toHaveCount(4);
    await expect(painel.getByText(/Arraste um arquivo ou clique/)).toBeVisible();
  });

  test("horário e limites recolhem mostrando o valor na linha", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/design/agente");

    // A regra que torna recolher um ganho: fechado, a linha mostra o VALOR, então
    // quem volta para conferir lê sem abrir.
    const horario = page.getByRole("button", {
      name: /Horário de atendimento/,
    });
    await expect(horario).toHaveAttribute("aria-expanded", "false");
    await expect(horario).toContainText("Segunda a sexta: 08:00 às 18:00");

    const limites = page.getByRole("button", {
      name: /Limites e quando chamar o time/,
    });
    await expect(limites).toHaveAttribute("aria-expanded", "false");
    await expect(limites).toContainText("2 limites, 1 caso de chamar o time");

    // Abrir mostra os campos.
    await horario.click();
    await expect(horario).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByPlaceholder("Ex.: fechado em feriados")).toBeVisible();

    await limites.click();
    await expect(
      page.getByPlaceholder("Ex.: nunca dar desconto por conta própria")
    ).toBeVisible();
  });

  test("o aviso de cache existe nos DOIS modos, junto do campo que o resolve", async ({
    page,
  }) => {
    await page.goto("/design/agente");

    // Ele saiu do topo da tela. No guiado o campo que resolve é "Detalhes do
    // negócio"; no avançado é a própria textarea, e é lá que o aviso de fato
    // dispara (o esqueleto vazio do guiado já dá cerca de 2.146 tokens).
    await page.getByRole("tab", { name: /Avançado/ }).click();
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

  test("montagem e edição são a MESMA tela, com voz diferente", async ({
    page,
  }) => {
    // O pedido do dono era "tem que ser os dois lados": guiado na primeira vez,
    // edição direta depois. A regra do híbrido é que o acompanhante muda a VOZ da
    // tela, nunca a estrutura, e é isso que este teste prende.
    const ler = () =>
      page.evaluate(() => ({
        grupos: [...document.querySelectorAll("section h2")].map((h) =>
          (h as HTMLElement).innerText.replace(/\n/g, " ").trim()
        ),
        acompanhante: /Vamos montar seu atendente/.test(document.body.innerText),
        continuar: [...document.querySelectorAll("button")].filter((b) =>
          /^Continuar/.test(b.textContent!.trim())
        ).length,
      }));

    await page.goto("/design/agente-montagem");
    const montagem = await ler();
    await page.goto("/design/agente");
    const edicao = await ler();

    // Mesma estrutura, mesma ordem, nos dois modos. O numeral é ordem de leitura
    // da montagem, não passo, então só aparece lá.
    expect(montagem.grupos).toEqual([
      "1 Quem atende",
      "2 O que ele sabe",
      "3 O que ele pode fazer",
    ]);
    expect(edicao.grupos).toEqual([
      "Quem atende",
      "O que ele sabe",
      "O que ele pode fazer",
    ]);

    expect(montagem.acompanhante).toBe(true);
    expect(edicao.acompanhante).toBe(false);
    // "Continuar" só rola, e só na montagem (grupos 1 e 2).
    expect(montagem.continuar).toBe(2);
    expect(edicao.continuar).toBe(0);
  });

  test("o rodapé só promete publicação quando ela é verdade", async ({ page }) => {
    // CORREÇÃO, não estilo: `lib/agent-turn.ts` devolve turno silencioso quando
    // `agent_published_at` é nulo, então antes da primeira ativação salvar NÃO
    // publica. A tela dizia que publicava, e assustava o cliente final justamente
    // no momento em que ele está mais inseguro.
    await page.goto("/design/agente-montagem");
    await expect(page.getByText(/Ainda não vai ao ar/)).toBeVisible();
    await expect(page.getByText("Salvar já publica no WhatsApp.")).toHaveCount(0);

    await page.goto("/design/agente");
    await expect(page.getByText("Salvar já publica no WhatsApp.")).toBeVisible();
    await expect(page.getByText(/Ainda não vai ao ar/)).toHaveCount(0);
  });

  test("um contador de progresso só, mesmo com a barra de onboarding na tela", async ({
    page,
  }) => {
    // Era a objeção principal contra o acompanhante: stepper dentro do passo 2 de
    // outro stepper. Resolvido pelo sinal, não por desenho: acompanhante e barra
    // nascem e morrem pelo MESMO `agent_published_at`, e o acompanhante não tem
    // contador nenhum.
    await page.goto("/design/agente-montagem");
    const contadores = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .filter(
          (e) =>
            e.children.length === 0 && /\d+\s+de\s+\d+/.test(e.textContent ?? "")
        )
        .map((e) => e.textContent!.trim())
    );
    expect(contadores).toHaveLength(1);
  });

  test("os presets trocam de lugar, não de existência", async ({ page }) => {
    // Na montagem são convite e abrem a tela; na edição são ação destrutiva e
    // ficam no pé do grupo 1, onde foram parar em 26/08.
    const onde = async (url: string) => {
      await page.goto(url);
      return page.evaluate(() => {
        const chip = (raiz: Element | null) =>
          raiz
            ? [...raiz.querySelectorAll("button")].some(
                (b) =>
                  /Clínica odontológica/.test(b.textContent ?? "") &&
                  b.getBoundingClientRect().height > 0
              )
            : false;
        const acompanhante = [...document.querySelectorAll("div")].find((d) =>
          /Vamos montar seu atendente/.test((d as HTMLElement).innerText ?? "")
        );
        return {
          noAcompanhante: chip(acompanhante ?? null),
          noGrupo1: chip(document.getElementById("grupo-quem")),
        };
      });
    };

    expect(await onde("/design/agente-montagem")).toEqual({
      noAcompanhante: true,
      noGrupo1: false,
    });
    expect(await onde("/design/agente")).toEqual({
      noAcompanhante: false,
      noGrupo1: true,
    });
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

    await page.getByRole("button", { name: "Clínica odontológica" }).click();
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
    // O mock tem uma conversa com handoff de 6h: é ela que fala em espera.
    await expect(page.getByText("6h").first()).toBeVisible();
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
