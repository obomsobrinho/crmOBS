import { test, expect } from "@playwright/test";

// Handoff sem pausa. Roda sem login nas telas /design (liberadas pelo proxy em
// dev).
//
// O que estes testes travam é uma REGRA, não um layout: "a IA pediu ajuda" e
// "alguém assumiu" são estados diferentes. Antes eram o mesmo (o handoff pausava
// a IA), e o efeito em produção foi a fila de "Precisa de você" virar depósito
// enquanto a IA ficava desligada para sempre nos contatos que já tinham passado
// por um handoff.

test.describe("Handoff na lista de conversas (/design)", () => {
  test("mostra o tempo de espera do handoff em aberto", async ({ page }) => {
    await page.goto("/design");
    // ⚠️ ATUALIZADO EM 19/09/2026. O mock tinha um handoff aberto há 6 horas e
    // este teste exigia o texto "6h". A lista ganhou recorte de tempo (padrão
    // Hoje), e provar a regra mais perigosa dele, "quem espera por você nunca
    // some pelo filtro de tempo", exige que essa conversa seja de ONTEM. Com
    // handoff de ontem a espera vira "13h" de manhã e "1 d" de madrugada, então
    // a asserção passou a ser a FORMA do tempo, que é o que o teste sempre quis
    // dizer: a lista mostra há quanto tempo aquilo espera.
    // A espera vem do PRIMEIRO handoff em aberto, que é a espera de verdade.
    await expect(
      page.locator('[data-slot="inbox-estado"]').first()
    ).toContainText(/^(agora|\d+ ?(min|h|d)) esperando/);
    // ⚠️ A FRASE ENCURTOU em 18/09/2026, ao aplicar o desenho do atendimento: a
    // espera saiu da linha da prévia (onde escrevia "6h · esperando você" NO
    // LUGAR da última mensagem) e virou um chip próprio embaixo, com "6h
    // esperando". O "você" saiu porque o cabeçalho do grupo logo acima já diz
    // "Esperando você", e repetir dentro do item gastava a largura que o "· IA
    // pausada" ocupa. A REGRA testada é a mesma: existe handoff em aberto e a
    // lista diz há quanto tempo.
    // `.first()`: o grupo "Esperando você" abre a lista, então o primeiro chip
    // de estado é o dele. Os outros dizem quem assumiu.
    await expect(
      page.locator('[data-slot="inbox-estado"]').first()
    ).toContainText(/esperando/);
  });

  test("IA pausada NÃO conta como precisa de você", async ({ page }) => {
    await page.goto("/design");
    // Um só: a conversa com handoff aberto. A do Franck está com a IA pausada
    // (alguém assumiu), e por isso não entra na fila.
    // O recorte virou CHIP em 18/09/2026 (desenho do atendimento), e o rótulo
    // encurtou de "Precisa de você" para "Esperando", que é como o cabeçalho de
    // grupo da lista já chamava a mesma coisa. O dado por trás é o mesmo:
    // handoff em aberto.
    const urgente = page.getByRole("button", { name: /Esperando/ });
    await expect(urgente).toContainText("1");
    await urgente.click();
    await expect(page.getByRole("link", { name: /Franck/ })).toHaveCount(0);
    // Mesma troca de frase do teste acima: o chip de estado passou a dizer "6h
    // esperando", sem o "você" que o cabeçalho de grupo já carrega.
    await expect(
      page.locator('[data-slot="inbox-estado"]').first()
    ).toContainText(/esperando/);
  });

  test("aviso de handoff é um campo do construtor", async ({ page }) => {
    await page.goto("/design/agente");
    // O campo mora no bloco "Limites e quando chamar o time" (26/08/2026),
    // dentro da aba "O que ele pode fazer" (28/08/2026).
    // ⚠️ ATUALIZADO EM 22/09/2026: o bloco deixou de recolher (pedido do dono,
    // "tem espaço abaixo, não faz sentido deixar colapsado"), então o segundo
    // clique não existe mais. Ficou a UM clique, o da aba.
    await page.getByRole("tab", { name: "O que ele pode fazer" }).click();
    await expect(
      page.getByText("O que avisar ao passar para o time")
    ).toBeVisible();
    // O texto é BASE, não frase pronta: se fosse frase pronta, a mesma linha se
    // repetiria a cada handoff da mesma conversa (foi o que aconteceu em
    // produção, dois handoffs em 26 segundos com a mesma promessa).
    await expect(page.getByText(/base da frase, não a frase pronta/)).toBeVisible();
  });

  test("o prompt compilado manda a IA seguir atendendo depois de pausar", async ({
    page,
  }) => {
    await page.goto("/design/agente");
    // O prompt saiu da coluna fixa e foi para um drawer: não é o que o cliente
    // veio fazer nesta tela. Então tem que abrir para conferir a regra.
    await page.getByRole("button", { name: "Ver prompt" }).click();
    await expect(page.getByText(/Pausar NÃO encerra a conversa/)).toBeVisible();
  });

  test("não usa travessão em texto visível", async ({ page }) => {
    await page.goto("/design/agente");
    const texto = await page.locator("body").innerText();
    expect(texto).not.toContain("—");
    expect(texto).not.toContain("–");
  });
});
