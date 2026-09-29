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
    .select("closed_how, instruction")
    .eq("id", id)
    .single();
  return data as { closed_how: string | null; instruction: string | null };
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
  await linha.getByRole("button", { name: "Resolvido" }).click();
  await expect(page.locator('[data-slot="pedidos-resultado"]')).toHaveText("Marcado como resolvido.", {
    timeout: 20_000,
  });

  await expect.poll(() => desfecho(id)).toMatchObject({ closed_how: "resolvido" });
  await expect
    .poll(() => estadoDaConversa(servico(), clientId))
    .toMatchObject({ handoffAt: null });
});

test("Orientar pela página fecha como IA e guarda a orientação", async ({ page }) => {
  const id = await abrirPedido("Quer saber o prazo de entrega");
  const linha = await linhaDoPedido(page, id);

  await linha.getByRole("button").first().click();
  await linha.getByRole("textbox", { name: /IA/ }).fill("Diga que a entrega leva 3 dias úteis.");
  await page.keyboard.press("Enter");

  // Sem o fluxo de envio no ambiente local, a IA usa na próxima mensagem.
  // 20s: sob a carga da suíte o Supabase Auth fica lento (ver playwright.config).
  await expect(page.locator('[data-slot="pedidos-resultado"]')).toContainText("Orientado.", {
    timeout: 20_000,
  });
  await expect.poll(() => desfecho(id)).toMatchObject({
    closed_how: "ia",
    instruction: "Diga que a entrega leva 3 dias úteis.",
  });
  await expect
    .poll(() => estadoDaConversa(servico(), clientId))
    .toMatchObject({ handoffAt: null });
});
