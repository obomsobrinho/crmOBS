import { test, expect } from "@playwright/test";
import {
  FONE_TESTE,
  NOME_TESTE,
  abrirHandoff,
  estadoDaConversa,
  semearConversa,
  servico,
  tenantDeTeste,
} from "./semente";

// PÁGINA DE PEDIDOS, contra o banco de verdade (29/09/2026).
//
// Prova que a página usa as MESMAS rotas da conversa: Resolvido fecha como
// `resolvido` e Orientar fecha como `ia`, os dois conferidos na tabela
// `handoffs`. ⚠️ NADA VAI AO WHATSAPP: sem `N8N_IA_SEND_WEBHOOK_URL` no ambiente
// local, a rota de orientar cai na orientação pendente antes de chamar o
// cérebro (é o que a tela diz). Responder pela página NÃO é testado aqui: o
// `/api/send` manda WhatsApp de verdade pelo n8n.
//
// SERIAL: escreve na conversa de teste, como `atendimento.serial.spec.ts`.

let clientId = "";

test.beforeAll(async () => {
  clientId = (await tenantDeTeste(servico())).clientId;
});

test.beforeEach(async () => {
  await semearConversa(servico(), clientId);
});

/**
 * Abre um pedido e devolve o id dele. ⚠️ Conferir pelo ID, e não "o último da
 * conversa": a semente abre pedidos com `opened_at` 6h no passado, e a jornada
 * do cérebro em `atendimento.serial` abre com a hora de agora, então "o mais
 * recente por abertura" pode ser outro pedido.
 */
async function abrirPedido(resumo: string): Promise<number> {
  const svc = servico();
  await abrirHandoff(svc, clientId, resumo);
  const { data } = await svc
    .from("handoffs")
    .select("id")
    .eq("client_id", clientId)
    .eq("phone", FONE_TESTE)
    .order("id", { ascending: false })
    .limit(1)
    .single();
  return data!.id as number;
}

async function desfecho(id: number) {
  const { data } = await servico()
    .from("handoffs")
    .select("solucao, instruction")
    .eq("id", id)
    .single();
  return data;
}

async function linhaDoPedido(page: import("@playwright/test").Page, id: number) {
  await page.goto("/pedidos");
  const linha = page.locator(`[data-pedido="${id}"]`);
  await expect(linha).toBeVisible({ timeout: 15_000 });
  await expect(linha).toContainText(NOME_TESTE);
  return linha;
}

test("Resolvido pela página fecha o pedido no banco", async ({ page }) => {
  const id = await abrirPedido("Quer saber se aceita cartão de débito");
  const linha = await linhaDoPedido(page, id);
  await expect(linha).toContainText("Quer saber se aceita cartão de débito");

  await linha.getByRole("button").first().click();
  // As seções do pedido (08/10/2026) carregam das mensagens reais, ao abrir. A seção
  // do cliente aparece sempre (com as mensagens, ou a linha de que não achou nenhuma).
  await expect(page.locator('[data-slot="pedido-cliente"]')).toBeVisible();
  await expect(page.locator('[data-slot="pedido-secoes-carregando"]')).toHaveCount(0, { timeout: 15_000 });
  await page.locator('[data-slot="pedido-detalhe"]').getByRole("button", { name: "Resolvido" }).click();
  await expect(page.locator('[data-slot="pedidos-resultado"]')).toHaveText("Marcado como resolvido.", {
    timeout: 20_000,
  });

  await expect.poll(() => desfecho(id)).toMatchObject({ solucao: "time_resolveu" });
  await expect
    .poll(() => estadoDaConversa(servico(), clientId))
    .toMatchObject({ handoffAt: null });
});

test("Orientar pela página fecha como IA e guarda a orientação", async ({ page }) => {
  const id = await abrirPedido("Quer saber o prazo de entrega");
  const linha = await linhaDoPedido(page, id);

  await linha.getByRole("button").first().click();
  await page
    .locator('[data-slot="pedido-detalhe"]')
    .getByRole("textbox", { name: /IA/ })
    .fill("Diga que a entrega leva 3 dias úteis.");
  await page.keyboard.press("Enter");

  // Sem o fluxo de envio no ambiente local, a IA usa na próxima mensagem.
  // 20s: sob a carga da suíte o Supabase Auth fica lento (ver playwright.config).
  await expect(page.locator('[data-slot="pedidos-resultado"]')).toContainText("Orientado.", {
    timeout: 20_000,
  });
  await expect.poll(() => desfecho(id)).toMatchObject({
    solucao: "orientou_ia",
    instruction: "Diga que a entrega leva 3 dias úteis.",
  });
  await expect
    .poll(() => estadoDaConversa(servico(), clientId))
    .toMatchObject({ handoffAt: null });
});

// MOTIVO DO PEDIDO (06/10/2026, P1 item 4): a etiqueta na linha e o filtro, que
// vai ao banco (`pedidos_pagina` com `p_motivo`), na sessão do dono.
test("o motivo aparece na linha e o filtro por motivo vai ao banco", async ({ page }) => {
  const id = await abrirPedido("Quer saber o valor do serviço (motivo e2e)");
  await servico().from("handoffs").update({ motivo: "preco" }).eq("id", id);
  const linha = await linhaDoPedido(page, id);
  await expect(linha).toContainText("Preço ou orçamento");
  await page.getByLabel("Filtrar por motivo").click();
  await page.getByRole("option", { name: "Reclamação" }).click();
  await expect(page.locator(`[data-pedido="${id}"]`)).toHaveCount(0);
  await page.getByLabel("Filtrar por motivo").click();
  await page.getByRole("option", { name: "Preço ou orçamento" }).click();
  await expect(page.locator(`[data-pedido="${id}"]`)).toBeVisible();
  // Nenhuma linha de outro motivo na lista filtrada.
  const motivos = await page.locator('[data-slot="pedido-linha"] [data-motivo]').evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-motivo"))
  );
  expect(motivos.every((m) => m === "preco")).toBe(true);
});

// PASSO 3a de docs/plano-dados-e-estado.md: a ponte do realtime no layout encaixa no
// cache o pedido que a IA abriu, com UMA leitura da fila da conversa (`pedidos_pagina`
// com `p_telefone`), nunca relendo as páginas carregadas.
test("pedido aberto pela IA aparece na lista sem reler as páginas", async ({ page }) => {
  await page.goto("/pedidos");
  await expect(page.locator('[data-slot="pedidos-carregando"]')).toHaveCount(0, { timeout: 20_000 });
  const leituras: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/rpc/pedidos_pagina")) leituras.push(JSON.parse(r.postData() ?? "{}"));
  });
  const id = await abrirPedido("Quer saber se tem estacionamento (ponte e2e)");
  await expect(page.locator(`[data-pedido="${id}"]`)).toBeVisible({ timeout: 20_000 });
  expect(leituras.length, "uma leitura, a da fila desta conversa").toBe(1);
  expect(leituras[0].p_telefone, "a leitura é da conversa, não a lista").toBe(FONE_TESTE);
});

test("refresh e voltar mantêm a aba e a busca na URL", async ({ page }) => {
  // Um pedido resolvido desta conversa, para a busca ter o que mostrar em Resolvidos.
  const id = await abrirPedido("Quer saber o horário de sábado (URL e2e)");
  await servico().from("handoffs").update({ closed_at: new Date().toISOString(), solucao: "time_resolveu" }).eq("id", id);
  await page.goto("/pedidos");
  await page.getByRole("tab", { name: /Resolvidos/ }).click();
  await expect(page).toHaveURL(/aba=resolvidos/);
  await page.getByLabel("Buscar pedidos").fill("horário de sábado");
  await expect(page).toHaveURL(/q=hor/, { timeout: 5_000 });
  await page.reload();
  await expect(page.getByRole("tab", { name: /Resolvidos/ })).toHaveAttribute("data-state", "active");
  await expect(page.getByLabel("Buscar pedidos")).toHaveValue("horário de sábado");
  const linha = page.locator(`[data-pedido="${id}"]`);
  await expect(linha).toBeVisible({ timeout: 15_000 });
  await linha.getByRole("button").first().click();
  await expect(page).toHaveURL(new RegExp(`abrir=${id}`));
  // O voltar fecha o pedido e fica na mesma aba e na mesma busca.
  await page.goBack();
  await expect(page).not.toHaveURL(/abrir=/);
  await expect(page.getByRole("tab", { name: /Resolvidos/ })).toHaveAttribute("data-state", "active");
  await expect(page.getByLabel("Buscar pedidos")).toHaveValue("horário de sábado");
});
