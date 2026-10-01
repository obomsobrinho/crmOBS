import { test, expect } from "@playwright/test";
import { servico, tenantDeTeste } from "./semente";

// Pipeline, a parte que ESCREVE no funil do tenant compartilhado. Projeto
// `logado-serial`: um worker só e depois que o `logado` inteiro terminou.
//
// ⚠️ Veio de `pipeline.auth.spec.ts` em 18/09/2026. Ele cria um estágio, confere
// que a coluna apareceu, renomeia, arquiva e confere que sumiu, tudo por
// CONTAGEM DE COLUNAS. Em paralelo com outro teste que mexa em estágio a
// contagem muda embaixo dele, e a falha aparecia em testes diferentes a cada
// execução, parecendo produto instável quando era disputa de tenant.

const COLUNA = '[data-slot="pipeline-coluna"]';

test.describe("Pipeline (escreve estágio)", () => {
  test("dono cria, renomeia e arquiva um estágio", async ({ page }) => {
    const nome = `Teste e2e ${Date.now()}`;
    const renomeado = `${nome} renomeado`;

    await page.goto("/pipeline");
    await page.waitForSelector(COLUNA, { timeout: 20_000 });
    // As colunas chegam no HTML do servidor ANTES de o botão funcionar: clicar
    // antes da hidratação perde o clique (era a intermitência conhecida deste
    // teste, "criar e arquivar estágio").
    await page.waitForLoadState("networkidle");
    const antes = await page.locator(COLUNA).count();

    await page.getByRole("button", { name: "Gerenciar estágios" }).click();
    await expect(page.getByText("Estágios do pipeline")).toBeVisible();

    // Criar: vira coluna no board, atrás do modal.
    await page.getByLabel("Nome do novo estágio").fill(nome);
    await page.getByRole("button", { name: "Criar" }).click();
    await expect.poll(() => page.locator(COLUNA).count()).toBe(antes + 1);

    // ⚠️ A linha do estágio NÃO se acha por `hasText`. O nome dela mora no
    // `value` de um `<input>`, e `hasText` casa com texto de nó, não com valor de
    // campo. Quem carrega o nome em texto acessível é o `aria-label` do punho de
    // arraste ("Reordenar <nome>. Arraste, ou use as setas...").
    const linhaDe = (n: string) =>
      page.locator("li").filter({
        has: page.locator(`[aria-label^="Reordenar ${n}."]`),
      });

    // Renomear: o campo salva no blur, e não num botão de salvar.
    const linha = linhaDe(nome);
    await linha.getByRole("textbox").fill(renomeado);
    await linha.getByRole("textbox").blur();
    await expect(page.locator(COLUNA, { hasText: renomeado })).toBeVisible();

    // Arquivar: some do board.
    await linhaDe(renomeado)
      .getByRole("button", { name: "Arquivar estágio" })
      .click();
    await expect.poll(() => page.locator(COLUNA).count()).toBe(antes);

    // ⚠️ E APAGA, que é a parte que faltava. O comentário antigo aqui dizia que
    // "este teste se limpa arquivando em vez de apagando", e isso nunca foi
    // limpar: arquivar só tira da tela. Em 21/09/2026 o dono abriu o funil dele
    // e encontrou 63 estágios "Teste e2e … renomeado" empilhados na lista de
    // arquivados, em DOIS tenants, um por execução desta suíte. O teste estava
    // enchendo o banco do cliente de lixo, e ainda por cima era o próprio teste
    // que pedia a funcionalidade que faltava para limpar.
    // ⚠️ E AQUI `linhaDe` NÃO SERVE, que é a segunda armadilha de localizador
    // deste arquivo. Ela acha a linha pelo punho de arraste, e o punho só existe
    // na lista dos ATIVOS: o estágio arquivado vira outra linha, sem punho e com
    // o nome em texto, não em campo. Quem identifica a linha arquivada é o
    // `aria-label` do próprio botão de apagar, que já carrega o nome.
    const apagar = page.getByRole("button", { name: `Apagar ${renomeado}` });
    await apagar.click();
    await expect(apagar).toHaveCount(0);
  });
});

// FASE 5 do plano de carregamento: a coluna traz 10 cards por vez, o número da
// coluna vem do banco, e mensagem nova move SÓ o card dela. 25 conversas com
// número impossível na coluna padrão, apagadas no fim.
test.describe("Pipeline paginado", () => {
  const PREF = "55000000070";
  const tel = (n: number) => `${PREF}${String(n).padStart(2, "0")}@s.whatsapp.net`;
  let clientId = "";
  const apagar = async () => {
    await servico().from("conversations").delete().like("phone", `${PREF}%`);
    await servico().from("dados_cliente").delete().like("telefone", `${PREF}%`);
  };
  test.beforeAll(async () => {
    clientId = (await tenantDeTeste(servico())).clientId;
    await apagar();
    const svc = servico();
    await svc.from("dados_cliente").insert(
      Array.from({ length: 25 }, (_, i) => ({
        client_id: clientId,
        telefone: tel(i + 1),
        display_name: `Card paginado ${String(i + 1).padStart(2, "0")}`,
        atendimento_ia: "ativa",
      }))
    );
    const agora = Date.now();
    const { error } = await svc.from("conversations").insert(
      Array.from({ length: 25 }, (_, i) => ({
        client_id: clientId,
        phone: tel(i + 1),
        last_message_at: new Date(agora - (i + 1) * 60_000).toISOString(),
        last_message_from: "in",
      }))
    );
    if (error) throw error;
  });
  test.afterAll(apagar);

  test("a coluna abre com 10, o número é o do banco, e rolar a coluna traz o resto", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 800 });
    await page.goto("/pipeline");
    const cards = page.locator('[data-slot="pipeline-card"]', { hasText: "Card paginado" });
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const coluna = page.locator('[data-slot="pipeline-coluna"]').filter({ has: cards.first() });
    await expect(coluna.locator('[data-slot="pipeline-card"]')).toHaveCount(10);
    const numero = Number((await coluna.locator("span.ml-auto.tabular-nums").innerText()).trim());
    expect(numero).toBeGreaterThanOrEqual(25);

    const area = coluna.locator('[data-slot="pipeline-mais"]').locator("xpath=..");
    for (let i = 0; i < 6 && (await coluna.locator('[data-slot="pipeline-mais"]').count()) > 0; i++) {
      const antes = await coluna.locator('[data-slot="pipeline-card"]').count();
      await area.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await expect.poll(async () => (await coluna.locator('[data-slot="pipeline-card"]').count()) > antes || (await coluna.locator('[data-slot="pipeline-mais"]').count()) === 0, { timeout: 15_000 }).toBe(true);
    }
    await expect(coluna.locator('[data-slot="pipeline-card"]')).toHaveCount(numero);
  });

  test("mensagem nova move só o card dela para o topo da coluna", async ({ page }) => {
    const chamadas = { coluna: 0, card: 0 };
    page.on("request", (r) => {
      if (r.method() !== "POST" || !r.url().includes("/rest/v1/rpc/pipeline_coluna")) return;
      const corpo = r.postDataJSON() as { p_telefone?: string | null };
      if (corpo?.p_telefone) chamadas.card++;
      else chamadas.coluna++;
    });
    await page.goto("/pipeline");
    const cards = page.locator('[data-slot="pipeline-card"]', { hasText: "Card paginado" });
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(4_000);
    chamadas.coluna = 0;
    await servico()
      .from("conversations")
      .update({ last_message_at: new Date().toISOString(), last_message_preview: "subiu agora" })
      .eq("client_id", clientId)
      .eq("phone", tel(8));
    await expect(cards.first()).toContainText("Card paginado 08", { timeout: 15_000 });
    await page.waitForTimeout(1_500);
    expect(chamadas.card).toBeGreaterThanOrEqual(1);
    expect(chamadas.coluna, "nenhuma coluna recarregada por causa de um card").toBe(0);
  });
});
