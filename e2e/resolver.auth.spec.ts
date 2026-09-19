import { test, expect } from "@playwright/test";

// Item 8, parte de servidor: o botão Resolvido, e a correção do "marcar como
// lida". COM LOGIN e contra o banco de verdade (tenant de teste; desde
// 17/09/2026 é a OBS).
//
// NÃO existe teste automático para "responder pelo CRM pausa a IA": aquele
// caminho manda mensagem de verdade no WhatsApp pelo n8n, e teste não faz isso.
// Essa parte é verificação manual do dono.

// Telefone só para o contrato da rota de resolver, que responde 200 mesmo sem
// casar linha nenhuma. Não precisa existir no tenant, e é por isso que ele
// sobreviveu à troca do tenant de teste enquanto o teste de cima quebrou.
const FONE = "553398620145@s.whatsapp.net";

test("abrir a conversa marca como lida de verdade", async ({ page }) => {
  // Regressão de um bug de laziness: o mark-as-read era `void supabase...`, e o
  // query builder do Supabase só dispara no `.then()`. O PATCH nunca saía, e o
  // contador de não lidas ficava aceso para sempre. O teste olha a REDE, porque
  // era exatamente aí que dava para ver o defeito: nenhuma requisição.
  const patches: number[] = [];
  page.on("response", (r) => {
    if (
      r.url().includes("/rest/v1/conversations") &&
      r.request().method() === "PATCH"
    ) {
      patches.push(r.status());
    }
  });

  // ⚠️ A conversa sai da LISTA, não de um telefone fixo. A versão anterior
  // navegava direto para um número escrito no arquivo, e quebrou inteira no dia
  // em que o tenant de teste mudou: o número não existe no tenant novo, então
  // nenhum PATCH saía e o teste acusava um bug que não existia. Clicar na lista
  // também é o caminho que a pessoa faz de verdade.
  await page.goto("/inbox");
  // ⚠️ "Tudo" antes de clicar (19/09/2026). A lista passou a abrir em "Hoje", e
  // o tenant de teste é o número parado do dono: num dia sem mensagem nova,
  // "Hoje" fica vazio e este teste falharia acusando um defeito de mark-as-read
  // que não existe. É o mesmo cuidado que `realtime.serial.spec.ts` tomou.
  await page
    .locator('[data-slot="inbox-periodo-opcao"]', { hasText: "Tudo" })
    .click();
  const primeira = page.locator('a[href^="/inbox/"]').first();
  await expect(primeira).toBeVisible({ timeout: 15_000 });
  await primeira.click();
  await expect.poll(() => patches.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(patches.every((s) => s < 400)).toBe(true);
});

// ⚠️ A recuperação do realtime ("voltar para a aba re-busca a lista") MUDOU DE
// ARQUIVO em 07/09/2026: foi para `realtime.serial.spec.ts`. Ela afirma AUSÊNCIA
// ("abrir o inbox não re-busca") e aqui, no projeto paralelo, quebrava por
// concorrência assim que a suíte do pipeline passou a escrever em `conversations`
// no mesmo tenant. Não trazer de volta.

test("a rota de resolver responde e é repetível", async ({ page }) => {
  // Contrato da rota, sem depender de existir handoff aberto: resolver duas vezes
  // é inofensivo (o UPDATE simplesmente não casa linha nenhuma na segunda), e é
  // isso que deixa o botão seguro contra clique duplo.
  //
  // Vai pela sessão do browser, então também prova o gate de autenticação: sem
  // cookie, esta rota responde 401.
  for (const vez of [1, 2]) {
    const res = await page.request.post("/api/conversations/resolve", {
      data: { phone: FONE },
    });
    expect(res.status(), `chamada ${vez}`).toBe(200);
    const corpo = await res.json();
    expect(corpo.ok).toBe(true);
    // ⚠️ ATUALIZADO EM 19/09/2026: resolver passou a LARGAR O RESPONSÁVEL junto
    // com o handoff. Pela regra nova, IA e pessoa não atendem a mesma conversa,
    // e devolver o atendimento para a IA deixando a conversa marcada como de
    // alguém reporia o estado contraditório pela porta dos fundos.
    //
    // O teste afirma o CONTRATO da rota e não a linha no banco, e isso é
    // limitação assumida: provar o efeito exigiria semear um handoff, e
    // `handoff_at` não tem grant de UPDATE para o browser de propósito (é o que
    // impede esconder conversa da fila "Precisa de você"). O efeito no banco é a
    // verificação manual descrita no teste pulado lá embaixo.
    expect(corpo.limpou).toEqual(["handoff_at", "assigned_user_id"]);
  }
});

test("resolver exige telefone", async ({ page }) => {
  const res = await page.request.post("/api/conversations/resolve", { data: {} });
  expect(res.status()).toBe(400);
});

// A jornada completa na interface (bloco "Esperando você há", clique em
// Resolvido, pendência sai da tela) foi verificada uma vez com um handoff
// semeado, e o efeito conferido no banco: `handoff_at` voltou a nulo e
// `atendimento_ia` voltou a "ativa". Desde 19/09/2026 a conferência à mão inclui
// `assigned_user_id`, que também volta a nulo.
//
// Ela não fica no automático porque o CRM não tem como ABRIR um handoff: quem
// abre é o `/api/agent`, e `conversations.handoff_at` não tem grant de UPDATE
// para o browser, de propósito. Semear exige service_role, que o teste não tem
// (e não deveria ter). Para rodar à mão, com a chave de serviço:
//
//   update public.conversations set handoff_at = now() - interval '6 hours'
//    where phone = '<fone>' and client_id = '<tenant>';
test.skip("jornada na interface: bloco de pendência e clique em Resolvido", async ({
  page,
}) => {
  await page.goto(`/inbox/${encodeURIComponent(FONE)}`);
  await expect(page.getByText(/Esperando você há/)).toBeVisible({
    timeout: 15_000,
  });
  const resposta = page.waitForResponse(
    (r) =>
      r.url().includes("/api/conversations/resolve") &&
      r.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Resolvido" }).click();
  expect((await resposta).status()).toBe(200);
  await expect(page.getByText(/Esperando você há/)).toHaveCount(0);
});
