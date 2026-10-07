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

test("handoff: entra em Esperando, a caixa vira a fila, e Resolvido fecha um de cada vez", async ({
  page,
}) => {
  const svc = servico();
  // O maior id ANTES de semear: é o que separa os pedidos deste teste dos que
  // outros testes (e rodadas anteriores) deixaram na mesma conversa.
  const { data: ultimo } = await svc
    .from("handoffs")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const idAntes = (ultimo?.id as number | undefined) ?? 0;
  await abrirHandoff(svc, clientId, "Quer saber o valor da revisão do carro");
  // Um segundo pedido, mais novo: a FILA (27/09/2026). Resolve do mais antigo.
  const { error: e2 } = await svc.from("handoffs").insert({
    client_id: clientId,
    phone: FONE_TESTE,
    opened_at: new Date(Date.now() - 60_000).toISOString(),
    summary: "Quer saber se dá para parcelar",
  });
  if (e2) throw e2;

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

  // Na CONVERSA (27/09/2026): o pedido é a CAIXA DE ESCRITA, o mais antigo
  // primeiro, com a posição na fila e a espera.
  const caixa = page.locator('[data-slot="pedido-caixa"]');
  await expect(caixa).toContainText("Quer saber o valor da revisão do carro", {
    timeout: 15_000,
  });
  await expect(caixa.locator('[data-slot="pedido-posicao"]')).toContainText("1 de 2 · há 6h");

  const resolver = () =>
    page.waitForResponse(
      (r) => r.url().includes("/api/conversations/resolve") && r.request().method() === "POST"
    );
  let resposta = resolver();
  await caixa.getByRole("button", { name: "Resolvido" }).click();
  expect((await resposta).status()).toBe(200);
  // Vem o próximo da fila, e a espera passa a contar dele.
  await expect(caixa).toContainText("Quer saber se dá para parcelar", { timeout: 15_000 });
  await expect(page.locator('[data-slot="handoff-cartao"][data-estado="fechado"]').last()).toContainText(
    "resolvido pelo time"
  );
  const meio = await estadoDaConversa(svc, clientId);
  expect(meio.handoffAt).not.toBeNull();
  expect(Date.now() - Date.parse(meio.handoffAt!)).toBeLessThan(2 * 3600_000);

  resposta = resolver();
  await caixa.getByRole("button", { name: "Resolvido" }).click();
  expect((await resposta).status()).toBe(200);
  // Fila vazia: a caixa volta ao normal.
  await expect(caixa).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("textbox", { name: "Escreva uma mensagem" })).toBeVisible();

  // No BANCO: nada esperando, IA de volta, ninguém segurando a conversa.
  await expect
    .poll(() => estadoDaConversa(svc, clientId))
    .toMatchObject({ handoffAt: null, responsavel: null, ia: "ativa" });
  // E os DOIS pedidos deste teste fechados como "resolvido". ⚠️ Pelo id, e não
  // pelo "último pedido da conversa" (28/09/2026): a jornada 1 da rodada
  // anterior abre um pedido de verdade um minuto antes, e ele às vezes era o mais
  // novo, então o teste lia o pedido de outro teste e falhava sem defeito.
  const { data: meus } = await svc
    .from("handoffs")
    .select("summary, closed_how")
    .eq("client_id", clientId)
    .eq("phone", FONE_TESTE)
    .gt("id", idAntes)
    .order("id");
  expect(meus?.map((p) => p.closed_how)).toEqual(["resolvido", "resolvido"]);
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
    diagnostics?: { avisoAgendado?: boolean };
  };
  // ⚠️ NENHUM AVISO NO WHATSAPP (29/09/2026). O tenant de teste tem destino de
  // avisos, e esta jornada abre pedido de ajuda de verdade: sem a trava do
  // telefone impossível (`telefoneImpossivel`, lib/avisos.ts) cada rodada
  // mandaria WhatsApp real ao time.
  expect(corpo.diagnostics?.avisoAgendado).toBeFalsy();
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

test.describe("jornadas com o cérebro real", () => {
  // UMA nova tentativa, como no projeto `ia` (28/09/2026): a resposta do modelo
  // varia com o código certo, e um teste que cai 1 vez em 10 por isso ensina a
  // ignorar vermelho. Duas falhas seguidas continuam reprovando.
  test.describe.configure({ retries: 1 });

  test("jornada 1: handoff aberto, orientar resolve na hora, e o pedido resolvido não volta", async ({
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

    // 2. O time vê o pedido NA CAIXA DE ESCRITA e orienta por ela.
    await abrirConversa(page);
    const caixa = page.locator('[data-slot="pedido-caixa"]');
    await expect(caixa).toContainText("A IA pediu sua ajuda", { timeout: 15_000 });
    await caixa
      .getByRole("textbox", { name: "Orientação para a IA" })
      .fill(
        "O valor do serviço é R$ 497 por mês. Pode informar ao cliente e dizer que o time liga se ele quiser detalhes."
      );
    const resposta = page.waitForResponse((r) => r.url().includes("/api/conversations/orientar"));
    await caixa.getByRole("button", { name: "Enviar orientação" }).click();

    // 3. ORIENTAR É RESOLVER (27/09/2026, decisão do dono): o pedido fecha NA HORA,
    //    sem esperar o cliente. Com o fluxo "CRM Envio IA" configurado a IA também
    //    responde na hora; aqui ele não está (nada pode ir ao WhatsApp a partir do
    //    teste), então a rota cai na orientação pendente, e é isso que se prova.
    const r = await resposta;
    expect(r.status()).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, enviado: false, motivo: "envio_nao_configurado" });
    await expect
      .poll(() => estadoDaConversa(svc, clientId))
      .toMatchObject({ handoffAt: null, registro: "ia" });
    await expect(
      page.locator('[data-slot="handoff-cartao"][data-estado="fechado"]').last()
    ).toContainText("resolvido com a sua orientação", { timeout: 15_000 });
    await expect(caixa).toHaveCount(0);

    // 4. O cliente escreve de novo, e o agente responde COM a orientação pendente.
    const t2 = await turnoDoAgente(request, "Tudo bem. Então, qual é o valor?");
    expect(t2.output.messages.join(" ")).toMatch(/497/);
    expect(t2.output.action).toBe("none");
    await expect.poll(() => estadoDaConversa(svc, clientId)).toMatchObject({ orientacao: null });

    // 5. PEDIDO RESOLVIDO NÃO VOLTA (27/09/2026, achado do dono): o cliente só
    //    agradece, e a IA não pede ajuda de novo pelo mesmo assunto, porque o
    //    pedido fechado entra no histórico dela como nota com a hora.
    const t3 = await turnoDoAgente(request, "Ok, obrigado. Fico no aguardo.");
    expect(t3.output.action).toBe("none");
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
    expect(texto).not.toMatch(/\b(esse|este|o) cliente\b/i);
    // Consumo único: na mensagem seguinte ela não vale mais.
    await expect.poll(() => estadoDaConversa(svc, clientId)).toMatchObject({ orientacao: null });
  });
});
