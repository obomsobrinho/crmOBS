import { test, expect } from "@playwright/test";
import {
  FONE_TESTE,
  NOME_TESTE,
  abrirHandoff,
  estadoDaConversa,
  segredoDoAgente,
  semearConversa,
  servico,
  tenantDeTeste,
} from "./semente";

// HANDOFF E ORIENTAÇÃO, ponta a ponta, contra o banco de verdade (26/09/2026).
//
// Até aqui só o CONTRATO da rota de resolver tinha teste: abrir um handoff
// exige escrita que o browser não pode fazer, e a suíte não gravava conversa.
// Com a autorização do dono para semear dado de teste (ver `e2e/semente.ts`),
// a jornada inteira passou a ser provada, com o banco conferido a cada passo.
//
// ⚠️ SERIAL porque os quatro testes mexem na MESMA conversa, e rodam depois do
// `logado` inteiro para não brigar com quem escreve em `conversations`.
//
// ⚠️ As duas JORNADAS chamam o CÉREBRO REAL (`/api/agent`, sem dryRun), três
// chamadas pagas no total. É o único jeito de provar que o handoff nasce do
// agente e que a orientação muda a resposta seguinte. Nada vai para o WhatsApp: quem envia
// é o n8n, e o teste fala direto com o cérebro. O telefone é impossível (DDD 00).

let clientId = "";
let donoId = "";

test.beforeAll(async () => {
  const t = await tenantDeTeste(servico());
  clientId = t.clientId;
  donoId = t.userId;
});

test.beforeEach(async () => {
  await semearConversa(servico(), clientId);
});

async function abrirConversa(page: import("@playwright/test").Page) {
  await page.goto(`/inbox/${encodeURIComponent(FONE_TESTE)}`);
  await page.waitForLoadState("networkidle");
}

test("handoff: entra em Esperando, mostra a espera e o pedido, e Resolvido fecha", async ({
  page,
}) => {
  const svc = servico();
  await abrirHandoff(svc, clientId, "Quer saber o valor da revisão do carro");

  // Na LISTA: o recorte "Esperando" traz a conversa. Handoff aberto nunca some
  // pelo filtro de tempo, então nem precisa escolher "Tudo".
  await page.goto("/inbox");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="inbox-chip"]', { hasText: "Esperando" }).click();
  const item = page.locator('[data-slot="inbox-item"]', { hasText: NOME_TESTE });
  await expect(item).toBeVisible();
  await item.click();
  // No dev a conversa compila na primeira visita: esperar a navegação acabar.
  await page.waitForURL(`**/inbox/${FONE_TESTE}`);
  await page.waitForLoadState("networkidle");

  // Na CONVERSA: a faixa "O cliente quer" traz o pedido, nas palavras da IA, e
  // há quanto tempo a pessoa espera.
  const faixa = page.locator('[data-slot="conversa-entendimento"]');
  await expect(faixa).toContainText("Quer saber o valor da revisão do carro", {
    timeout: 15_000,
  });
  await expect(faixa).toContainText(/esperando há 6h/);

  const resposta = page.waitForResponse(
    (r) => r.url().includes("/api/conversations/resolve") && r.request().method() === "POST"
  );
  await faixa.getByRole("button", { name: "Resolvido" }).click();
  expect((await resposta).status()).toBe(200);
  await expect(page.getByText(/esperando há/)).toHaveCount(0);

  // No BANCO: handoff fechado, IA de volta, ninguém segurando a conversa.
  await expect
    .poll(() => estadoDaConversa(svc, clientId))
    .toMatchObject({ handoffAt: null, responsavel: null, ia: "ativa" });
});

test("orientar a IA: grava, religa a IA, larga o responsável e dá para cancelar", async ({
  page,
}) => {
  const svc = servico();
  // Um humano tinha assumido: IA pausada e a conversa com o dono.
  await svc
    .from("dados_cliente")
    .update({ atendimento_ia: "pause" })
    .eq("client_id", clientId)
    .eq("telefone", FONE_TESTE);
  await svc
    .from("conversations")
    .update({ assigned_user_id: donoId })
    .eq("client_id", clientId)
    .eq("phone", FONE_TESTE);

  await abrirConversa(page);
  await page.locator('[data-slot="composer-modo"]').click();
  await page.getByRole("menuitem", { name: /Orientar a IA/ }).click();
  const orientacao = "Pode dizer que a revisão custa R$ 150 e oferecer um horário.";
  await page.getByRole("textbox", { name: /IA/ }).fill(orientacao);
  await page.keyboard.press("Enter");

  await expect(page.getByText("Orientação pendente")).toBeVisible();
  await expect(page.locator("span").filter({ hasText: orientacao }).first()).toBeVisible();
  // Terminada a gravação (são três escritas: orientação, IA e responsável), a
  // caixa esvazia e o modo VOLTA para Responder, os dois no mesmo passo. Até lá
  // o modo segue "Orientar a IA", então um Enter no meio nunca manda a
  // orientação para o cliente.
  await expect(page.getByRole("textbox", { name: "Escreva uma mensagem" })).toHaveValue("", {
    timeout: 15_000,
  });
  await expect
    .poll(() => estadoDaConversa(svc, clientId))
    .toMatchObject({ orientacao, ia: "reativada", responsavel: null });

  await page.getByRole("button", { name: "Cancelar orientação" }).click();
  await expect(page.getByText("Orientação pendente")).toHaveCount(0);
  await expect.poll(() => estadoDaConversa(svc, clientId)).toMatchObject({ orientacao: null });
});

async function turnoDoAgente(
  request: import("@playwright/test").APIRequestContext,
  message: string
) {
  const res = await request.post("/api/agent", {
    headers: { "x-lookup-secret": segredoDoAgente() },
    data: { client_id: clientId, phone: FONE_TESTE, message },
    timeout: 60_000,
  });
  expect(res.status(), await res.text()).toBe(200);
  const corpo = (await res.json()) as {
    output: { messages: string[]; action: string; summary: string };
  };
  // A conversa fica no relatório do teste: é o que o dono lê para julgar o tom,
  // e o que ninguém consegue reconstruir depois (o turno não grava texto).
  console.log(`[cliente] ${message}
[agente:${corpo.output.action}] ${corpo.output.messages.join(" | ")}`);
  return corpo;
}

/** Orienta a IA pela caixa de escrita, como o time faz. */
async function orientarPelaTela(page: import("@playwright/test").Page, texto: string) {
  await abrirConversa(page);
  await page.locator('[data-slot="composer-modo"]').click();
  await page.getByRole("menuitem", { name: /Orientar a IA/ }).click();
  await page.getByRole("textbox", { name: /IA/ }).fill(texto);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Orientação pendente")).toBeVisible();
}

// ── AS DUAS JORNADAS DO DONO (26/09/2026), com o cérebro real ──
// Cada uma segue a ordem que o dono descreveu, do jeito que o time faria: o
// cliente escreve (chamada ao `/api/agent`, o mesmo que o n8n faz), o time age
// PELA TELA, e o cliente escreve de novo. Nada vai ao WhatsApp. Três chamadas
// pagas no total.

test("jornada 1: handoff aberto, time orienta, agente resolve e o handoff fecha sozinho", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const svc = servico();

  // 1. O cliente pede uma pessoa: gatilho fixo de escalada, e o AGENTE abre o
  //    handoff (ninguém semeia nada aqui).
  const t1 = await turnoDoAgente(
    request,
    "Quero falar com uma pessoa sobre o valor do serviço, por favor."
  );
  expect(t1.output.action).toBe("pausar");
  // Handoff não emudece (regra de 20/08/2026): ele avisa o que vai fazer.
  expect(t1.output.messages.join(" ").trim().length).toBeGreaterThan(0);
  await expect
    .poll(() => estadoDaConversa(svc, clientId).then((e) => e.handoffAt !== null))
    .toBe(true);

  // 2. O time vê a pendência e orienta pela tela.
  await abrirConversa(page);
  const faixa = page.locator('[data-slot="conversa-entendimento"]');
  await expect(faixa).toContainText(/esperando há/, { timeout: 15_000 });
  await orientarPelaTela(
    page,
    "O valor do serviço é R$ 497 por mês. Pode informar ao cliente e dizer que o time liga se ele quiser detalhes."
  );

  // 3. O cliente escreve de novo, e o agente responde COM a orientação.
  const t2 = await turnoDoAgente(request, "Tudo bem. Então, qual é o valor?");
  expect(t2.output.messages.join(" ")).toMatch(/497/);
  expect(t2.output.action).toBe("none");

  // 4. O handoff fechou sozinho (decisão do dono, 26/09/2026) e a orientação
  //    foi consumida. Na tela, a pendência saiu.
  await expect
    .poll(() => estadoDaConversa(svc, clientId))
    .toMatchObject({ handoffAt: null, orientacao: null });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/esperando há/)).toHaveCount(0);
  await expect(page.getByText("Orientação pendente")).toHaveCount(0);
});

test("jornada 2: o time recomenda um desconto e o agente oferece na mensagem seguinte", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const svc = servico();

  // Sem handoff nenhum: orientar também serve para o time mandar o agente
  // FAZER algo por aquele cliente.
  await orientarPelaTela(
    page,
    "Este cliente é indicação. Ofereça 10% de desconto no primeiro mês."
  );

  const t = await turnoDoAgente(request, "Oi! Estou pensando em contratar, como funciona?");
  const texto = t.output.messages.join(" ");
  // O desconto só existe na orientação: se aparece, o agente seguiu o time (e a
  // trava de segurança aceitou, porque orientação do time é fonte).
  expect(texto).toMatch(/10\s?%/);
  expect(texto).toMatch(/desconto/i);
  // ⚠️ E fala COM o cliente, não SOBRE ele (26/09/2026): o agente chegou a dizer
  // "como esse cliente é indicação" ao próprio cliente, copiando a orientação.
  expect(texto).not.toMatch(/(esse|este|o) cliente/i);
  // Consumo único: na mensagem seguinte ela não vale mais.
  await expect.poll(() => estadoDaConversa(svc, clientId)).toMatchObject({ orientacao: null });
});
