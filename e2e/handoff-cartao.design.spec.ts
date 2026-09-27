import { test, expect } from "@playwright/test";

// O PEDIDO DE AJUDA MORA NA CONVERSA (27/09/2026, pedido do dono): um cartão
// âmbar na linha do tempo, com a orientação digitada dentro dele. Antes o
// pedido era uma faixa no topo e a orientação uma pílula roxa embaixo, e nada
// dizia que uma respondia à outra. Prévia `/design?handoff=...`, sem banco.

test("aberto: pedido, espera, campo de orientar e as duas saídas", async ({ page }) => {
  await page.goto("/design?handoff=aberto");
  const cartao = page.locator('[data-slot="handoff-cartao"][data-estado="aberto"]');
  await expect(cartao).toContainText("A IA pediu sua ajuda");
  await expect(cartao).toContainText(/esperando há/);
  await expect(cartao).toContainText("Cliente quer falar com o dono");
  await expect(cartao.getByRole("textbox", { name: "Orientação para a IA" })).toBeVisible();
  await expect(cartao.getByRole("button", { name: "Resolvi por fora" })).toBeVisible();
  await expect(cartao.getByRole("button", { name: "Assumir a conversa" })).toBeVisible();
  // O enviar é âmbar, a cor do pedido: roxo aqui era a desconexão que o dono apontou.
  await expect(cartao.getByRole("button", { name: "Enviar orientação" })).toHaveAttribute(
    "data-variant",
    "warn"
  );
  // A faixa do topo não resolve mais nada.
  await expect(
    page.locator('[data-slot="conversa-entendimento"]').getByRole("button", { name: "Resolvido" })
  ).toHaveCount(0);
});

test("orientado: o cartão diz o que vem, e a caixa de baixo não repete o aviso", async ({
  page,
}) => {
  await page.goto("/design?handoff=orientado");
  const cartao = page.locator('[data-slot="handoff-cartao"][data-estado="aberto"]');
  await expect(cartao.locator('[data-slot="handoff-orientado"]')).toContainText("Você orientou");
  await expect(cartao).toContainText("A IA responde na próxima mensagem do cliente");
  await expect(page.getByText("Orientação pendente")).toHaveCount(0);
});

test("resolvido: vira uma linha de histórico, com a orientação", async ({ page }) => {
  await page.goto("/design?handoff=resolvido");
  const linha = page.locator('[data-slot="handoff-cartao"][data-estado="fechado"]');
  await expect(linha).toContainText("resolvido pela IA com a sua orientação");
  await expect(linha).toContainText("Orientação:");
  await expect(page.locator('[data-slot="handoff-cartao"][data-estado="aberto"]')).toHaveCount(0);
});
