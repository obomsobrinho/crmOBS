import { test, expect } from "@playwright/test";
import { FONE_TESTE, NOME_TESTE, semearConversa, servico, tenantDeTeste } from "./semente";

// TELA DE CLIENTES contra o banco de verdade (30/09/2026, fatia A).
//
// A prova que importa: a ficha é UM formulário em duas superfícies. O e-mail
// gravado na ficha da tela de Clientes aparece no painel da conversa, e o valor
// é conferido no banco. Nada vai ao WhatsApp (ninguém envia mensagem aqui).
//
// SERIAL: escreve no contato de teste, como `pedidos.serial.spec.ts`.

const EMAIL = "cliente.e2e@exemplo.test";
let clientId = "";

test.beforeAll(async () => {
  clientId = (await tenantDeTeste(servico())).clientId;
  await semearConversa(servico(), clientId);
});

test.afterAll(async () => {
  await servico()
    .from("dados_cliente")
    .update({ email: null, birth_date: null })
    .eq("client_id", clientId)
    .eq("telefone", FONE_TESTE);
});

test("o contato aparece na lista, a busca acha, e a ficha é a mesma da conversa", async ({ page }) => {
  await page.goto("/clientes");
  await page.getByLabel("Buscar clientes").fill("0000000001");
  const linha = page.locator('[data-slot="clientes-item"]', { hasText: NOME_TESTE });
  await expect(linha).toHaveCount(1);
  await linha.click();
  // A primeira navegação compila a rota no dev server.
  await expect(page).toHaveURL(/\/clientes\/\d+$/, { timeout: 30_000 });
  await expect(page.locator('[data-slot="ficha-abrir-conversa"]')).toBeVisible();

  const email = page.getByLabel("E-mail");
  await email.fill(EMAIL);
  await email.blur();
  await expect(page.locator('[data-slot="painel-dados-status"]')).toHaveText("salvo");

  const { data } = await servico()
    .from("dados_cliente")
    .select("email")
    .eq("client_id", clientId)
    .eq("telefone", FONE_TESTE)
    .single();
  expect(data?.email).toBe(EMAIL);

  // A outra superfície: o painel do contato dentro da conversa.
  await page.locator('[data-slot="ficha-abrir-conversa"]').click();
  await expect(page).toHaveURL(new RegExp(`/inbox/${FONE_TESTE}`), { timeout: 30_000 });
  await expect(page.getByLabel("E-mail").last()).toHaveValue(EMAIL);
});

test("o menu leva a Clientes", async ({ page }) => {
  await page.goto("/painel");
  await page.getByRole("link", { name: "Clientes" }).first().click();
  await expect(page).toHaveURL(/\/clientes$/);
  await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
});

// FATIA B (01/10/2026): criar contato pela rota service_role, com outro número
// impossível (DDD 00), e a primeira mensagem recusada sem o aceite. O envio de
// verdade NÃO é exercido: seria WhatsApp real.
const FONE_NOVO = "5500000000002";

async function apagarNovo() {
  const svc = servico();
  for (const fone of [FONE_NOVO, `${FONE_NOVO}@s.whatsapp.net`]) {
    await svc.from("conversations").delete().eq("client_id", clientId).eq("phone", fone);
    await svc.from("dados_cliente").delete().eq("client_id", clientId).eq("telefone", fone);
  }
}

test("Novo cliente cadastra, não duplica, nasce com conversa vazia e não entra em Conversas", async ({ page }) => {
  await apagarNovo();
  try {
    await page.goto("/clientes");
    await page.locator('[data-slot="clientes-novo"]').click();
    const dialogo = page.locator('[data-slot="novo-cliente"]');
    await dialogo.locator('[data-campo="telefone"]').fill("00000000002");
    await dialogo.locator('[data-campo="nome"]').fill("Novo cliente (e2e)");
    await dialogo.locator('[data-slot="novo-cliente-salvar"]').click();
    await expect(page).toHaveURL(/\/clientes\/\d+$/, { timeout: 30_000 });
    await expect(page.locator('[data-slot="ficha-nunca"]')).toBeVisible();
    await expect(page.locator('[data-slot="ficha-abrir-conversa"]')).toHaveCount(0);

    const svc = servico();
    const { data: contato } = await svc
      .from("dados_cliente")
      .select("id, telefone, display_name, atendimento_ia")
      .eq("client_id", clientId)
      .eq("telefone", `${FONE_NOVO}@s.whatsapp.net`)
      .single();
    expect(contato?.display_name).toBe("Novo cliente (e2e)");
    expect(contato?.atendimento_ia).toBe("ativa");
    const { data: conversa, error } = await svc
      .from("conversations")
      .select("id, last_message_at")
      .eq("client_id", clientId)
      .eq("phone", `${FONE_NOVO}@s.whatsapp.net`)
      .single();
    expect(error).toBeNull();
    expect(conversa?.last_message_at).toBeNull();

    // O mesmo número de novo abre quem já existe.
    const segunda = await page.request.post("/api/contacts", { data: { telefone: "(00) 00000-0002" } });
    expect(await segunda.json()).toEqual({ id: contato!.id, existente: true });

    // Sem o aceite, a primeira mensagem é recusada antes de chegar ao n8n.
    const envio = await page.request.post("/api/send", {
      data: { phone: `${FONE_NOVO}@s.whatsapp.net`, text: "oi" },
    });
    expect(envio.status()).toBe(409);

    // Conversa vazia não é conversa: fora da lista.
    await page.goto("/inbox");
    await page.locator('[data-slot="inbox-periodo-opcao"]', { hasText: "Tudo" }).click();
    await expect(page.getByText("Novo cliente (e2e)")).toHaveCount(0);
  } finally {
    await apagarNovo();
  }
});

// FOTO DE PERFIL (F4): a rota só serve foto do próprio tenant.
test("a foto de outro tenant não é servida", async ({ page }) => {
  const outro = await page.request.get("/api/fotos/00000000-0000-0000-0000-000000000000/fotos/1-x.jpg");
  expect(outro.status()).toBe(404);
  const torto = await page.request.get(`/api/fotos/${clientId}/../segredo.jpg`);
  expect([400, 404]).toContain(torto.status());
});

// FASE 3 do plano de carregamento: Clientes paginado (10 por vez), busca no
// servidor com debounce. 25 contatos com número impossível, apagados no fim.
test.describe("Clientes paginado", () => {
  const PREF = "55000000040";
  const tel = (n: number) => `${PREF}${String(n).padStart(2, "0")}@s.whatsapp.net`;
  const apagar = async () => {
    await servico().from("conversations").delete().like("phone", `${PREF}%`);
    await servico().from("dados_cliente").delete().like("telefone", `${PREF}%`);
  };
  test.beforeAll(async () => {
    await apagar();
    const svc = servico();
    const { error } = await svc.from("dados_cliente").insert(
      Array.from({ length: 25 }, (_, i) => ({
        client_id: clientId,
        telefone: tel(i + 1),
        display_name: `Cliente paginado ${String(i + 1).padStart(2, "0")}`,
        atendimento_ia: "ativa",
      }))
    );
    if (error) throw error;
    const agora = Date.now();
    const { error: e2 } = await svc.from("conversations").insert(
      Array.from({ length: 25 }, (_, i) => ({
        client_id: clientId,
        phone: tel(i + 1),
        last_message_at: new Date(agora - (i + 1) * 60_000).toISOString(),
        last_message_from: "in",
      }))
    );
    if (e2) throw e2;
  });
  test.afterAll(apagar);

  test("abre com 10, rola de 10 em 10 na ordem, e a busca vai uma vez ao servidor", async ({ page }) => {
    const chamadas = { pagina: 0 };
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/rest/v1/rpc/clientes_pagina")) chamadas.pagina++;
    });
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto("/clientes");
    const itens = page.locator('[data-slot="clientes-item"]');
    await expect(itens).toHaveCount(10, { timeout: 30_000 });
    expect(chamadas.pagina, "a primeira página veio do servidor").toBe(0);

    const area = page.locator('[data-slot="clientes-lista"]').locator("xpath=..");
    for (let i = 0; i < 6 && (await page.locator('[data-slot="clientes-mais"]').count()) > 0; i++) {
      const antes = await itens.count();
      await area.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await expect.poll(async () => (await itens.count()) > antes || (await page.locator('[data-slot="clientes-mais"]').count()) === 0, { timeout: 15_000 }).toBe(true);
    }
    const nomes = (await itens.locator('[data-slot="clientes-nome"]').allInnerTexts()).filter((n) => n.startsWith("Cliente paginado"));
    expect(nomes).toEqual(Array.from({ length: 25 }, (_, i) => `Cliente paginado ${String(i + 1).padStart(2, "0")}`));

    chamadas.pagina = 0;
    await page.getByLabel("Buscar clientes").pressSequentially("paginado 17", { delay: 40 });
    await expect(itens).toHaveCount(1, { timeout: 15_000 });
    await expect(itens.first()).toContainText("Cliente paginado 17");
    expect(chamadas.pagina, "uma busca, não uma por letra").toBe(1);
  });
});
