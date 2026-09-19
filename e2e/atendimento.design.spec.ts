import { test, expect } from "@playwright/test";

// Os cinco ajustes do atendimento pedidos em 19/09/2026, depois de o dono usar a
// tela redesenhada (`docs/plano-ajustes-atendimento.md`). Um describe por item,
// na ordem do plano. Roda sem login, na tela /design.
//
// Um arquivo só, e não espalhado pelos specs por tela, pelo mesmo motivo de
// `ajustes.design.spec.ts`: ele existe para a validação item a item. Depois de
// aprovado, cada teste pode migrar para o spec da tela a que pertence.

/**
 * Deixa as escritas do browser passarem sem banco.
 *
 * A /design monta os componentes REAIS com dado falso, então os callbacks da
 * conversa mandam PATCH de verdade para o Supabase, com um tenant que não
 * existe. Sem isto o PATCH volta em erro e o componente REVERTE o estado
 * otimista, que é exatamente o que este arquivo precisa observar. Devolver 204 é
 * o que o PostgREST devolve num update sem `Prefer: return=representation`.
 *
 * Devolve a lista de escritas, para o teste poder afirmar o que foi gravado e
 * não só o que a tela pintou: o item 5 é uma regra de BANCO, e checar só o
 * pixel deixaria passar uma tela que mente.
 */
async function interceptarEscritas(page: import("@playwright/test").Page) {
  const escritas: { tabela: string; corpo: string }[] = [];
  await page.route("**/rest/v1/**", async (route) => {
    const req = route.request();
    if (req.method() !== "PATCH") return route.fallback();
    const url = new URL(req.url());
    const corpo = req.postData() ?? "";
    // Abrir a conversa zera o contador de não lidas, e esse PATCH sai sozinho em
    // toda abertura. Ele não é gesto de ninguém, então não entra na lista: senão
    // toda asserção deste arquivo carregaria uma escrita que não tem nada a ver
    // com o que ela afirma, e a ordem dela dependeria de quando o efeito roda.
    if (!corpo.includes("unread_count")) {
      escritas.push({ tabela: url.pathname.split("/").pop() ?? "", corpo });
    }
    await route.fulfill({ status: 204, body: "" });
  });
  return escritas;
}

// ─────────────────────────────────────────────────────────────────────
// Item 5: IA e humano não podem atender a mesma conversa
//
// A invariante "IA e pessoa nunca atendem a mesma conversa" já era a regra de
// EXIBIÇÃO (`quemAtende`, lib/crm.ts) e já valia no envio manual. O que faltava
// era valer no BANCO quando o gesto é atribuir ou religar a IA: dava para ter a
// conversa de alguém com a IA ligada, e a tela mostrava as duas coisas.
// ─────────────────────────────────────────────────────────────────────
test.describe("Item 5: IA e pessoa não atendem a mesma conversa", () => {
  test("religar a IA larga o responsável", async ({ page }) => {
    const escritas = await interceptarEscritas(page);
    await page.goto("/design");

    // Estado de partida do preview: alguém assumiu, a IA está pausada.
    // Tudo escopado no cabeçalho da conversa: a lista ao lado fala das mesmas
    // pessoas, e um locator solto acharia o rótulo dela.
    const cabecalho = page.locator("main header");
    const chave = cabecalho.getByRole("switch");
    await expect(chave).toContainText("IA pausada");
    await expect(cabecalho.getByRole("button", { name: "Você" })).toBeVisible();

    await chave.click();

    await expect(chave).toContainText("IA ligada");
    // E o responsável SAIU. Era o estado contraditório: a IA volta a responder e
    // a conversa continua marcada como de uma pessoa.
    await expect(
      cabecalho.getByRole("button", { name: "Ninguém assumiu ainda" })
    ).toBeVisible();
    await expect(cabecalho.getByRole("button", { name: "Você" })).toHaveCount(0);

    // Banco, e não só pixel: as duas escritas saíram, e a segunda zera o
    // responsável.
    expect(escritas.map((e) => e.tabela)).toEqual([
      "dados_cliente",
      "conversations",
    ]);
    expect(escritas[0].corpo).toContain("ativa");
    expect(JSON.parse(escritas[1].corpo)).toEqual({ assigned_user_id: null });
  });

  test("atribuir pausa a IA, inclusive para um colega", async ({ page }) => {
    const escritas = await interceptarEscritas(page);
    await page.goto("/design");

    // Pré-condição: a IA precisa estar LIGADA para o gesto de atribuir ter o que
    // pausar. É o mesmo clique do teste acima, e não uma variante de mock: com
    // a regra nova, "atribuído + IA ligada" não é mais um estado que o produto
    // consiga produzir para nascer na tela.
    const cabecalho = page.locator("main header");
    const chave = cabecalho.getByRole("switch");
    await chave.click();
    await expect(chave).toContainText("IA ligada");
    escritas.length = 0;

    // Transferir para um COLEGA, e não assumir para si: é o caso que surpreende,
    // e a regra é a mesma (a conversa passou a ser de uma pessoa).
    await cabecalho.getByRole("button", { name: "Ninguém assumiu ainda" }).click();
    await page.getByRole("menuitem", { name: "carlos" }).click();

    await expect(cabecalho.getByRole("button", { name: "carlos" })).toBeVisible();
    await expect(chave).toContainText("IA pausada");

    expect(escritas.map((e) => e.tabela)).toEqual([
      "conversations",
      "dados_cliente",
    ]);
    expect(JSON.parse(escritas[1].corpo)).toEqual({ atendimento_ia: "pause" });
  });

  test("soltar a conversa NÃO religa a IA", async ({ page }) => {
    const escritas = await interceptarEscritas(page);
    await page.goto("/design");

    // "Ninguém atende" é um estado LEGÍTIMO, e é o que a lista mostra como
    // dívida visível. Religar aqui transformaria soltar numa devolução
    // silenciosa para a IA, que é decisão de quem mexe na chave.
    const cabecalho = page.locator("main header");
    await cabecalho.getByRole("button", { name: "Você" }).click();
    await page.getByRole("menuitem", { name: "Soltar a conversa" }).click();

    await expect(
      cabecalho.getByRole("button", { name: "Ninguém assumiu ainda" })
    ).toBeVisible();
    await expect(cabecalho.getByRole("switch")).toContainText("IA pausada");
    expect(escritas.map((e) => e.tabela)).toEqual(["conversations"]);
  });
});
