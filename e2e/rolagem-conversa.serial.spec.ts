import { test, expect } from "@playwright/test";
import { FONE_TESTE, NOME_TESTE, semearConversa, servico, tenantDeTeste } from "./semente";

// ROLAGEM DA CONVERSA COM MENSAGEM CHEGANDO (30/09/2026, achado do dono com
// vídeo: "rolo a primeira vez e funciona, depois fica invertido").
//
// Antes, qualquer recarga da lista levava a conversa ao fim, e quem estava lendo
// o histórico era puxado para baixo. Agora: lendo lá em cima, fica onde está;
// no fim, acompanha a mensagem nova.
//
// SERIAL: escreve na conversa de teste. As mensagens de enchimento são apagadas
// no fim, porque outras suítes mandam o histórico dessa conversa ao cérebro real.

let clientId = "";
const criadas: number[] = [];

test.beforeAll(async () => {
  clientId = (await tenantDeTeste(servico())).clientId;
  await semearConversa(servico(), clientId);
  const { data } = await servico()
    .from("chat_messages")
    .insert(
      Array.from({ length: 14 }, (_, i) => ({
        client_id: clientId,
        phone: FONE_TESTE,
        nomewpp: NOME_TESTE,
        user_message: `Mensagem de enchimento ${i}, longa o bastante para ocupar a largura da conversa`,
        bot_message: `Resposta de enchimento ${i}`,
      }))
    )
    .select("id");
  criadas.push(...(data ?? []).map((r) => r.id as number));
});

test.afterAll(async () => {
  if (criadas.length) await servico().from("chat_messages").delete().in("id", criadas);
});

async function chega(texto: string) {
  const { data } = await servico()
    .from("chat_messages")
    .insert({ client_id: clientId, phone: FONE_TESTE, nomewpp: NOME_TESTE, user_message: texto })
    .select("id")
    .single();
  criadas.push(data!.id as number);
}

test("lendo o histórico, mensagem nova não puxa para o fim; no fim, acompanha", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(`/inbox/${FONE_TESTE}`);
  const area = page.locator("main [data-radix-scroll-area-viewport]").first();
  await expect(area.getByText("Mensagem de enchimento 13", { exact: false })).toBeVisible({ timeout: 20_000 });
  // O realtime precisa estar assinado antes da primeira inserção.
  await page.waitForTimeout(6000);

  // 1) Lendo lá em cima.
  await area.evaluate((el) => el.scrollTo({ top: 0 }));
  await page.waitForTimeout(500);
  await chega("Chegou enquanto eu lia o histórico");
  await expect(area.getByText("Chegou enquanto eu lia o histórico")).toBeAttached({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  expect(await area.evaluate((el) => el.scrollTop)).toBeLessThan(50);

  // 2) De volta ao fim: a próxima mensagem aparece sem rolar à mão.
  await area.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await page.waitForTimeout(500);
  await chega("Chegou com a conversa no fim");
  await expect(area.getByText("Chegou com a conversa no fim")).toBeInViewport({ timeout: 15_000 });
});
