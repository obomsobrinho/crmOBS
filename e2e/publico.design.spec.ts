import { test, expect } from "@playwright/test";

// Telas públicas (sem login): cadastro self-service, login e recuperação de
// senha. Roda no projeto `sem-login` pelo sufixo do arquivo.
//
// Nenhum teste aqui dispara e-mail de verdade nem cria conta: o caminho que cria
// dados é o POST /api/signup, verificado à parte por script.

test.describe("Cadastro (/cadastro)", () => {
  test("pede empresa e e-mail, e não pede senha", async ({ page }) => {
    await page.goto("/cadastro");
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
    await expect(page.getByLabel("Nome da empresa")).toBeVisible();
    await expect(page.getByLabel("Seu e-mail")).toBeVisible();
    // A senha NUNCA passa pelo nosso servidor: o formulário não tem campo dela.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(
      page.getByText(/Você escolhe sua senha pelo link/)
    ).toBeVisible();
  });

  test("leva de volta para o login", async ({ page }) => {
    await page.goto("/cadastro");
    await page.getByRole("link", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
  });
});

test.describe("Login (/login)", () => {
  test("oferece criar conta e recuperar senha", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("link", { name: "Esqueci minha senha" })
    ).toBeVisible();
    await page.getByRole("link", { name: "Criar conta" }).click();
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
  });

  test("mostra o nome da marca na aba e o formulário combinado", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle("Atenda");
    await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
    await expect(page.locator("form")).toContainText("Atenda");
    await expect(page.getByRole("link", { name: "Criar conta grátis por 7 dias" })).toHaveAttribute(
      "href",
      "/cadastro",
    );
    await expect(page.locator("main")).not.toContainText("Ainda não tem conta?");
    const ajuda = page.getByRole("link", { name: "Fale com a gente no WhatsApp" });
    await expect(ajuda).toHaveAttribute("href", "https://wa.me/5533984033279");
    await expect(ajuda).toHaveAttribute("target", "_blank");
  });

  test("o olho mostra a senha pelo teclado e não vira alvo de getByLabel", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    // auth.setup.ts e fluxos-principais usam getByLabel("Senha") sem exact: um
    // aria-label "Mostrar senha" no botão quebraria o login de toda a suíte.
    await expect(page.getByLabel("Senha")).toHaveCount(1);
    const campo = page.getByLabel("Senha");
    await campo.fill("segredo");
    await expect(campo).toHaveAttribute("type", "password");
    const olho = page.getByRole("button", { name: "Mostrar senha" });
    await olho.focus();
    await page.keyboard.press("Enter");
    await expect(campo).toHaveAttribute("type", "text");
    await expect(campo).toHaveValue("segredo");
    await page.getByRole("button", { name: "Ocultar senha" }).click();
    await expect(campo).toHaveAttribute("type", "password");
  });

  test("o painel de marca diz só o combinado e não entra na ordem do teclado", async ({ page }) => {
    await page.goto("/login");
    const painel = page.locator('[data-slot="painel-marca"]');
    await expect(
      painel.getByRole("heading", { name: "A central inteligente do seu WhatsApp." })
    ).toBeVisible();
    await expect(painel).toContainText("Atende, qualifica e organiza cada cliente até a venda.");
    await expect(page.locator('[data-slot="painel-marca-lista"] li')).toHaveText([
      "Responde na hora",
      "Usa as informações do seu negócio",
      "Passa orçamento com os seus preços",
      "Marca horário na sua agenda",
      "Chama você quando precisa",
    ]);
    await expect(page.locator('[data-slot="celular-cartao"]')).toHaveText([
      "Novo cliente",
      "Orçamento enviado",
      "Horário marcado na agenda",
      "Pedido resolvido",
    ]);
    // Vocabulário que o dono tirou da tela (voz da marca).
    await expect(page.locator("body")).not.toContainText(/24 horas|CRM|agente de IA|lembrar de mim|google/i);
    // O celular é ilustração: nada nele é focável nem chega ao leitor de tela.
    const celular = page.locator('[data-slot="celular-conversa"]');
    await expect(celular).toHaveAttribute("aria-hidden", "true");
    await expect(celular.locator("a, button, input")).toHaveCount(0);
  });

  test("a cena tem fim, e só o que flutua continua, sem mexer no layout", async ({ page }) => {
    await page.goto("/login");
    const medida = await page.evaluate(() => {
      const animacoes = document.getAnimations().map((a) => ({
        nome: (a as CSSAnimation).animationName,
        fim: Number(a.effect?.getComputedTiming().endTime),
        propriedades: (a.effect as KeyframeEffect)
          .getKeyframes()
          .flatMap((k) => Object.keys(k)),
      }));
      return animacoes;
    });
    const continuas = medida.filter((a) => a.fim === Infinity).map((a) => a.nome);
    expect(new Set(continuas)).toEqual(new Set(["divisor-flutua", "cartao-flutua"]));
    const comFim = medida.filter((a) => a.fim !== Infinity);
    expect(comFim.length).toBeGreaterThan(0);
    expect(Math.max(...comFim.map((a) => a.fim))).toBeLessThan(8_500);
    const permitidas = ["offset", "computedOffset", "easing", "composite", "opacity", "transform", "translate"];
    for (const p of medida.flatMap((a) => a.propriedades)) expect(permitidas).toContain(p);
  });

  test("com movimento reduzido mostra a cena completa parada", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    const celular = page.locator('[data-slot="celular-conversa"]');
    await expect(celular).toContainText("Boa noite! Vocês têm horário amanhã?");
    await expect(celular).toContainText("Pronto, marcado para amanhã às 14h.");
    await expect(page.locator('[data-slot="celular-cartao"]').last()).toHaveCSS("opacity", "1");
    await expect(page.locator('[data-slot="painel-marca-lista"] li').last()).toHaveCSS("opacity", "1");
    await expect(celular.locator(".celular-balao").last()).toHaveCSS("opacity", "1");
    await expect(celular.locator(".celular-digitando").first()).toHaveCSS("opacity", "0");
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test("os cartões e a lista não cobrem texto em nenhuma janela de computador", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [width, height] of [[1024, 768], [1280, 640], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await page.goto("/login");
      // O painel vai até o fim da tela em cima, embaixo e à direita: nenhum canto
      // sobrando de um lado só.
      const borda = await page.locator(".painel-marca-recorte").boundingBox();
      expect(borda!.y, `${width}x${height}`).toBe(0);
      expect(borda!.height, `${width}x${height}`).toBe(height);
      expect(borda!.x + borda!.width, `${width}x${height}`).toBeCloseTo(width, 0);
      const colisoes = await page.evaluate(() => {
        const caixa = (el: Element) => el.getBoundingClientRect();
        const cruza = (a: DOMRect, b: DOMRect) =>
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const cartoes = [...document.querySelectorAll('[data-slot="celular-cartao"]')];
        const texto = [
          ...document.querySelectorAll(
            ".painel-marca-texto h2, .painel-marca-texto p, .painel-marca-lista li, .celular-status span, .celular-contato",
          ),
        ];
        const painel = caixa(document.querySelector(".painel-marca-recorte")!);
        const fora = cartoes.filter((c) => {
          const k = caixa(c);
          return k.left < painel.left || k.right > painel.right || k.bottom > painel.bottom;
        });
        return {
          fora: fora.map((c) => c.textContent),
          sobre: cartoes.flatMap((c) =>
            texto.filter((t) => cruza(caixa(c), caixa(t))).map((t) => `${c.textContent} x ${t.textContent}`),
          ),
          // O aparelho é inclinado e a caixa dele não serve: pergunta ao navegador
          // o que existe de verdade em cada ponto do cartão (ele fica reto) e no
          // fim de cada item da lista.
          balaoSobCartao: cartoes.filter((c) => {
            const k = caixa(c);
            for (let x = k.left; x <= k.right; x += 6) {
              for (let y = k.top; y <= k.bottom; y += 6) {
                const noPonto = document.elementsFromPoint(x, y);
                if (noPonto.includes(c) && noPonto.some((el) => el.closest(".celular-balao"))) return true;
              }
            }
            return false;
          }).map((c) => c.textContent),
          listaNoCelular: [...document.querySelectorAll(".painel-marca-lista li")]
            .filter((li) => {
              const faixa = document.createRange();
              faixa.selectNodeContents(li);
              const { right, top, bottom } = faixa.getBoundingClientRect();
              return [top, bottom].some((y) =>
                document
                  .elementsFromPoint(right + 4, y)
                  .some((el) => el.closest(".celular-corpo, .celular-cartao")),
              );
            })
            .map((li) => li.textContent),
        };
      });
      expect(colisoes, `${width}x${height}`).toEqual({ fora: [], sobre: [], balaoSobCartao: [], listaNoCelular: [] });
    }
  });
});

test.describe("Recuperar senha (/recuperar-senha)", () => {
  test("responde igual para qualquer e-mail (não vira verificador de contas)", async ({
    page,
  }) => {
    await page.goto("/recuperar-senha");
    await expect(
      page.getByRole("heading", { name: "Recuperar senha" })
    ).toBeVisible();
    // Endereço inexistente de propósito: nenhum e-mail é enviado.
    await page.getByLabel("E-mail").fill("ninguem-aqui-e2e@deskcrm-teste.local");
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(page.getByRole("heading", { name: "Link enviado" })).toBeVisible();
    await expect(page.getByText(/Se existir uma conta com esse e-mail/)).toBeVisible();
  });
});
