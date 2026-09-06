import { test, expect } from "@playwright/test";

// Item 8, parte de servidor: o botão Resolvido, e a correção do "marcar como
// lida". COM LOGIN e contra o banco de verdade (tenant Loja Teste).
//
// NÃO existe teste automático para "responder pelo CRM pausa a IA": aquele
// caminho manda mensagem de verdade no WhatsApp pelo n8n, e teste não faz isso.
// Essa parte é verificação manual do dono.

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

  await page.goto(`/inbox/${encodeURIComponent(FONE)}`);
  await expect.poll(() => patches.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(patches.every((s) => s < 400)).toBe(true);
});

test("voltar para a aba re-busca a lista (recuperação do realtime)", async ({
  page,
}) => {
  // Regressão do defeito de 31/08/2026: uma bolinha de 4 não lidas ficou acesa
  // com o banco JÁ em zero. O contador do servidor estava certo o tempo todo; o
  // que faltava era a lista saber que o realtime tinha caído. O `.subscribe()`
  // era chamado sem callback, então `CHANNEL_ERROR` e `TIMED_OUT` passavam em
  // silêncio, e nada re-buscava ao voltar o foco: a lista congelava com os
  // números que tinha até alguém apertar F5.
  //
  // O teste conta REQUISIÇÃO, e não pixel, porque o defeito é a AUSÊNCIA de uma
  // busca. Medido dos dois lados antes de escrever: sem a correção o foco provoca
  // ZERO GETs; com ela, um por evento.
  //
  // ⚠️ Ele trava também a outra metade da decisão: o carregamento tem que ficar
  // em ZERO. A primeira assinatura do canal é pulada de propósito, porque nessa
  // hora a lista acabou de vir do servidor e re-buscar seriam três consultas
  // jogadas fora em toda abertura do inbox.
  let gets = 0;
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/conversations") && r.method() === "GET") {
      gets++;
    }
  });

  await page.goto("/inbox");
  await page.waitForSelector('a[href^="/inbox/"]', { timeout: 20_000 });
  await page.waitForTimeout(3_000);
  expect(
    gets,
    "abrir o inbox não deve re-buscar: o servidor acabou de entregar a lista"
  ).toBe(0);

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => gets, { timeout: 10_000 }).toBeGreaterThan(0);

  const aposFoco = gets;
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange"))
  );
  await expect.poll(() => gets, { timeout: 10_000 }).toBeGreaterThan(aposFoco);
});

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
    expect((await res.json()).ok).toBe(true);
  }
});

test("resolver exige telefone", async ({ page }) => {
  const res = await page.request.post("/api/conversations/resolve", { data: {} });
  expect(res.status()).toBe(400);
});

// A jornada completa na interface (bloco "Esperando você há", clique em
// Resolvido, pendência sai da tela) foi verificada uma vez com um handoff
// semeado, e o efeito conferido no banco: `handoff_at` voltou a nulo e
// `atendimento_ia` voltou a "ativa".
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
