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
// ⚠️ Dois testes chamam o CÉREBRO REAL (`/api/agent`, sem dryRun), uma chamada
// paga cada. É o único jeito de provar que o handoff nasce do agente e que a
// orientação é consumida no turno seguinte. Nada vai para o WhatsApp: quem envia
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
  return (await res.json()) as {
    output: { messages: string[]; action: string; summary: string };
  };
}

test("o agente ABRE o handoff quando o cliente pede uma pessoa (cérebro real)", async ({
  request,
}) => {
  test.setTimeout(90_000);
  const svc = servico();
  const r = await turnoDoAgente(request, "Quero falar com uma pessoa do atendimento, por favor.");
  // Pedir uma pessoa é gatilho fixo de escalada da base do prompt.
  expect(r.output.action).toBe("pausar");
  // Handoff não emudece (regra de 20/08/2026): ela avisa o que vai fazer.
  expect(r.output.messages.join(" ").trim().length).toBeGreaterThan(0);
  await expect
    .poll(() => estadoDaConversa(svc, clientId).then((e) => e.handoffAt !== null))
    .toBe(true);
});

test("o agente USA a orientação no turno seguinte e ela some (cérebro real)", async ({
  request,
}) => {
  test.setTimeout(90_000);
  const svc = servico();
  await svc
    .from("conversations")
    .update({
      pending_instruction: "A revisão custa R$ 150. Pode informar esse valor ao cliente.",
      pending_instruction_at: new Date().toISOString(),
      pending_instruction_by: donoId,
    })
    .eq("client_id", clientId)
    .eq("phone", FONE_TESTE);

  const r = await turnoDoAgente(request, "E quanto fica a revisão?");
  // O valor só existe na orientação: se ele aparece, a IA leu a orientação (e o
  // guardrail aceitou, porque a orientação do operador é fonte).
  expect(r.output.messages.join(" ")).toMatch(/150/);
  // Consumo único: depois do turno a orientação não existe mais.
  await expect.poll(() => estadoDaConversa(svc, clientId)).toMatchObject({ orientacao: null });
});
