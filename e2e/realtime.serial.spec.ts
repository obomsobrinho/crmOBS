import { test, expect } from "@playwright/test";

// Testes que afirmam AUSÊNCIA. Rodam no projeto `logado-serial`, com um worker
// só e depois que o `logado` inteiro terminou.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE, e a lição vale para todo teste futuro de "isto
// NÃO deve acontecer": este teste morava em `resolver.auth.spec.ts`, no projeto
// paralelo, e quebrou no dia em que a suíte do pipeline passou a existir. A
// asserção "abrir o inbox provoca ZERO buscas" recebeu 5, porque os testes de
// pipeline escrevem em `conversations` no MESMO tenant e o realtime, funcionando
// exatamente como deveria, mandava a lista se atualizar. O código estava certo e
// o teste errado: afirmar ausência num tenant compartilhado com escritores
// concorrentes é afirmar algo que o produto nunca prometeu.
//
// ⚠️ E por que NÃO basta bloquear o WebSocket com `routeWebSocket`: sem conexão o
// `SUBSCRIBED` nunca dispara, então a guarda que pula a PRIMEIRA assinatura
// deixaria de ser exercida e o teste passaria até com ela removida. Isolar no
// tempo preserva a prova; isolar a rede a destruiria.

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
  // ⚠️ "Tudo" antes de esperar a lista (19/09/2026). A lista passou a abrir em
  // "Hoje", e o tenant de teste é o número parado do dono: num dia em que
  // ninguém escrever, "Hoje" fica vazio e este teste falha acusando um defeito
  // de realtime que não existe. Trocar a janela é filtro de memória e não gera
  // requisição nenhuma, então a contagem abaixo continua valendo.
  await page
    .locator('[data-slot="inbox-periodo-opcao"]', { hasText: "Tudo" })
    .click();
  // ⚠️ O sinal de "lista carregada" era um link de conversa, e a OBS ficou sem
  // conversa na limpeza de 24/09/2026: o teste falhava acusando o realtime por
  // falta de dado. A conversa nunca foi o objeto do teste (ele conta buscas, e
  // o refetch ao voltar o foco acontece com a lista vazia também), então o
  // sinal passou a ser a rede parada, que vale nos dois casos, em vez de pular.
  await page.waitForLoadState("networkidle");
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
