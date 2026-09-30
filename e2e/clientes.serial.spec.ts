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
