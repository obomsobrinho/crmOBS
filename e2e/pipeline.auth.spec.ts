import { test, expect, type Page } from "@playwright/test";

// Pipeline (/pipeline), COM LOGIN e contra o banco de verdade (tenant Loja
// Teste). Até 07/09/2026 esta tela tinha ZERO cobertura, de tela e de fluxo: era
// o buraco registrado no CLAUDE.md, e o único lugar do produto onde arrastar um
// card escreve no banco sem nenhum teste olhando.
//
// ⚠️ ESTES TESTES ESCREVEM. Cada um desfaz o que fez: o ciclo de vida termina
// arquivando o estágio que criou, e o arraste devolve o card ao estágio de
// origem. Rodar contra qualquer tenant que não seja o de teste (a OBS desde
// 17/09/2026) é proibido pelo projeto.
//
// ⚠️ Arquivar NÃO é apagar, então cada rodada deixa UMA linha arquivada em
// `pipeline_stages`. É de propósito: arquivar é o que o produto oferece, e é o
// que o teste precisa provar; montar teardown com credencial e cliente de banco
// dentro da suíte custaria mais do que resolve. Estágio arquivado não aparece em
// tela nenhuma. Para limpar de vez em quando, uma linha no SQL Editor:
//
//   delete from pipeline_stages
//    where name ilike 'Teste e2e%'
//      and client_id = '<id do tenant de teste>';

const COLUNA = '[data-slot="pipeline-coluna"]';
const CARD = '[data-slot="pipeline-card"]';

/**
 * Arraste HTML5 simulado.
 *
 * ⚠️ `locator.dragTo()` NÃO serve aqui. Ele move o ponteiro, e arraste nativo do
 * HTML5 não nasce de movimento de mouse no Chromium controlado: `dragstart` e
 * `drop` simplesmente não disparam, e o teste passaria a medir nada. O caminho
 * honesto é despachar os três eventos com UM `DataTransfer` compartilhado, que é
 * o que o navegador faz de verdade: o `dragstart` do card grava o telefone e o
 * `drop` da coluna lê esse telefone.
 */
async function arrastarCard(page: Page, phone: string, paraStage: string) {
  await page.evaluate(
    ({ phone, paraStage, CARD, COLUNA }) => {
      const card = document.querySelector<HTMLElement>(
        `${CARD}[data-phone="${CSS.escape(phone)}"]`
      );
      const coluna = document.querySelector<HTMLElement>(
        `${COLUNA}[data-stage="${CSS.escape(paraStage)}"]`
      );
      if (!card) throw new Error(`card ${phone} não está na tela`);
      if (!coluna) throw new Error(`coluna ${paraStage} não está na tela`);

      const dt = new DataTransfer();
      card.dispatchEvent(
        new DragEvent("dragstart", { bubbles: true, dataTransfer: dt })
      );
      coluna.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        })
      );
      coluna.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        })
      );
    },
    { phone, paraStage, CARD, COLUNA }
  );
}

/** Em qual coluna o card está agora. */
async function stageDoCard(page: Page, phone: string): Promise<string | null> {
  return page.evaluate(
    ({ phone, CARD, COLUNA }) => {
      const card = document.querySelector<HTMLElement>(
        `${CARD}[data-phone="${CSS.escape(phone)}"]`
      );
      return card?.closest<HTMLElement>(COLUNA)?.dataset.stage ?? null;
    },
    { phone, CARD, COLUNA }
  );
}

test.describe("Pipeline", () => {
  test("mostra as colunas do funil e a contagem bate com os cards", async ({
    page,
  }) => {
    await page.goto("/pipeline");
    await page.waitForSelector(COLUNA, { timeout: 20_000 });

    expect(
      await page.locator(COLUNA).count(),
      "um tenant provisionado nasce com o funil inicial"
    ).toBeGreaterThan(0);

    // O numeral do cabeçalho é a soma do que está NA TELA, não o total do banco:
    // ele acompanha busca e filtro. Se divergir da contagem real de cards, a
    // tela está mentindo sobre o próprio conteúdo.
    const naTela = await page.locator(CARD).count();
    const cabecalho = await page
      .locator("h1", { hasText: "Pipeline" })
      .locator("xpath=following-sibling::span[1]")
      .innerText();
    expect(Number(cabecalho.trim())).toBe(naTela);
  });

  test("buscar filtra os cards sem mexer nas colunas", async ({ page }) => {
    await page.goto("/pipeline");
    await page.waitForSelector(COLUNA, { timeout: 20_000 });

    const colunasAntes = await page.locator(COLUNA).count();
    const cardsAntes = await page.locator(CARD).count();
    test.skip(cardsAntes === 0, "sem card no tenant, não há o que filtrar");

    await page.getByLabel("Buscar cards").fill("zzzznaoexistezzzz");
    await expect.poll(() => page.locator(CARD).count()).toBe(0);

    // ⚠️ As colunas NÃO somem com a busca: o funil é a estrutura, os cards é que
    // são o conteúdo. Uma busca que apaga as colunas faz a pessoa achar que
    // perdeu o funil.
    expect(await page.locator(COLUNA).count()).toBe(colunasAntes);

    await page.getByLabel("Buscar cards").fill("");
    await expect.poll(() => page.locator(CARD).count()).toBe(cardsAntes);
  });

  // ⚠️ "dono cria, renomeia e arquiva um estágio" MUDOU DE ARQUIVO em
  // 18/09/2026: foi para `pipeline.serial.spec.ts`. Ele CRIA e ARQUIVA estágio no
  // tenant compartilhado e confere a contagem de colunas antes e depois; qualquer
  // outro worker mexendo em estágio no meio disso derruba a contagem. A falha
  // rodava entre testes diferentes a cada execução e lia como instabilidade do
  // produto. É o mesmo motivo que criou o projeto `logado-serial`. Não trazer de
  // volta para cá.

  test("arrastar um card muda a coluna E PERSISTE no banco", async ({
    page,
  }) => {
    await page.goto("/pipeline");
    await page.waitForSelector(COLUNA, { timeout: 20_000 });

    const cards = page.locator(CARD);
    test.skip((await cards.count()) === 0, "sem card no tenant");

    const stages = await page
      .locator(COLUNA)
      .evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset.stage ?? "")
      );
    test.skip(stages.length < 2, "funil com menos de dois estágios");

    const phone = (await cards.first().getAttribute("data-phone"))!;
    const origem = await stageDoCard(page, phone);
    const destino = stages.find((s) => s !== origem)!;

    await arrastarCard(page, phone, destino);
    await expect.poll(() => stageDoCard(page, phone)).toBe(destino);

    // ⚠️ ESTA é a asserção que importa. O board move o card em memória ANTES de
    // falar com o banco (atualização otimista), então conferir só a tela provaria
    // que o `setState` funciona, não que a conversa mudou de estágio. Recarregar
    // joga fora o estado do browser e obriga o servidor a responder.
    await page.reload();
    await page.waitForSelector(COLUNA, { timeout: 20_000 });
    expect(
      await stageDoCard(page, phone),
      "o estágio tem que sobreviver ao recarregamento"
    ).toBe(destino);

    // Devolve o card para onde estava.
    if (origem) {
      await arrastarCard(page, phone, origem);
      await expect.poll(() => stageDoCard(page, phone)).toBe(origem);
    }
  });

  test("clicar no card abre a conversa dele", async ({ page }) => {
    await page.goto("/pipeline");
    await page.waitForSelector(COLUNA, { timeout: 20_000 });

    const cards = page.locator(CARD);
    test.skip((await cards.count()) === 0, "sem card no tenant");

    const phone = (await cards.first().getAttribute("data-phone"))!;
    await cards.first().click();
    await page.waitForURL("**/inbox/**", { timeout: 20_000 });
    expect(decodeURIComponent(page.url())).toContain(phone);
  });
});

// ✅ **Atendente não gerencia o funil: coberto desde 17/09/2026**, em
// `atendente.att.spec.ts` (projeto `atendente`, sessão própria gravada pelo
// `auth.setup.ts`). Ficou fora daqui de propósito: com a sessão do dono, que é a
// deste arquivo, a asserção provaria o contrário do que afirma.
