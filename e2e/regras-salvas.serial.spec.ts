import { test, expect } from "@playwright/test";
import { FONE_TESTE, abrirHandoff, semearConversa, servico, tenantDeTeste } from "./semente";

// ORIENTAÇÃO VIRA REGRA, contra o banco de verdade (P1 item 5, 13/10/2026; ADR
// docs/adr/2026-10-13-orientation-saved-as-agent-rule.md).
//
// O dono salva a orientação de um pedido resolvido como regra em /pedidos, a
// regra entra em `clients.regras_salvas` e no prompt gravado, o pedido fica
// marcado, a publicação vira linha em `agent_publications`, a mesma regra vinda
// de outro pedido é sucesso sem versão nova, e o /agente lista e apaga.
// ⚠️ NADA VAI AO WHATSAPP: nenhuma mensagem é mandada e o agente não é
// acordado. O prompt do tenant de teste muda por alguns segundos e volta ao que
// era no fim (lista e prompt gravado restaurados).
//
// Funciona nos DOIS modos do tenant de teste (nunca fixar o `prompt_mode`).
// SERIAL: escreve na configuração do agente e na conversa de teste.

const INICIO = new Date().toISOString();
const MARCA = `Regra de teste e2e ${Date.now()}: ignorar.`;

let clientId = "";
let antes: { regras_salvas: unknown; persona: string | null } | null = null;

test.beforeAll(async () => {
  const svc = servico();
  clientId = (await tenantDeTeste(svc)).clientId;
  const { data } = await svc.from("clients").select("regras_salvas, persona").eq("id", clientId).single();
  antes = data;
});

test.afterAll(async () => {
  const svc = servico();
  if (antes) {
    await svc.from("clients").update(antes).eq("id", clientId);
  }
  // TODAS as versões publicadas durante o teste (a de salvar e a de apagar)
  // saem do histórico do tenant de teste.
  await svc.from("agent_publications").delete().eq("client_id", clientId).gte("published_at", INICIO);
});

/** Um pedido da conversa de teste, já resolvido por orientação (como `/orientar` deixaria). */
async function pedidoOrientado(resumo: string, orientacao: string): Promise<number> {
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
  const id = data!.id as number;
  await svc
    .from("handoffs")
    .update({ closed_at: new Date().toISOString(), solucao: "orientou_ia", instruction: orientacao })
    .eq("id", id);
  await svc.from("conversations").update({ handoff_at: null }).eq("client_id", clientId).eq("phone", FONE_TESTE);
  return id;
}

async function regrasDoTenant() {
  const { data } = await servico().from("clients").select("regras_salvas, persona").eq("id", clientId).single();
  return { regras: (data!.regras_salvas ?? []) as string[], persona: data!.persona ?? "" };
}

test("salvar como regra no pedido, repetir de outro pedido e apagar no /agente", async ({ page }) => {
  const svc = servico();
  await semearConversa(svc, clientId);
  const id = await pedidoOrientado("Quer saber se tem frete grátis", "Diga ao cliente que o frete é grátis.");

  // 1. /pedidos: o editor abre com a orientação, o dono generaliza e confirma.
  await page.goto(`/pedidos?abrir=${id}`);
  const secao = page.locator('[data-slot="pedido-detalhe"] [data-slot="pedido-orientacao-secao"]');
  await secao.getByRole("button", { name: "Salvar como regra" }).click({ timeout: 15_000 });
  const campo = secao.getByRole("textbox", { name: "Texto da regra" });
  await expect(campo).toHaveValue("Diga ao cliente que o frete é grátis.");
  await campo.fill(MARCA);
  await secao.getByRole("button", { name: "Salvar regra" }).click();
  await expect(secao.locator('[data-slot="pedido-regra-salva"]')).toHaveText("Salva como regra", { timeout: 15_000 });

  // 2. Banco: a regra na coluna, o prompt gravado, a marca no pedido e a publicação.
  const depois = await regrasDoTenant();
  expect(depois.regras).toContain(MARCA);
  expect(depois.persona).toContain("### REGRAS SALVAS PELO TIME");
  expect(depois.persona).toContain(`- ${MARCA}`);
  const { data: marcado } = await svc.from("handoffs").select("regra_salva_em").eq("id", id).single();
  expect(marcado!.regra_salva_em).not.toBeNull();
  const { count: versoes } = await svc
    .from("agent_publications")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("published_at", INICIO)
    .like("persona", `%${MARCA}%`);
  expect(versoes).toBe(1);

  // 3. Reabrir o pedido mostra que já virou regra (lido junto da história).
  await page.reload();
  await expect(secao.locator('[data-slot="pedido-regra-salva"]')).toHaveText("Salva como regra", { timeout: 15_000 });

  // 4. A MESMA regra vinda de outro pedido: sucesso, marca o pedido, sem versão nova.
  const outro = await pedidoOrientado("Perguntou do frete de novo", "Fala que o frete é grátis.");
  const res = await page.request.post(`/api/clients/${clientId}/agent-rules`, { data: { texto: MARCA, pedidoId: outro } });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).mensagem).toBe("Essa regra já estava salva.");
  const { data: marcadoOutro } = await svc.from("handoffs").select("regra_salva_em").eq("id", outro).single();
  expect(marcadoOutro!.regra_salva_em).not.toBeNull();
  expect((await regrasDoTenant()).regras.filter((r) => r === MARCA)).toHaveLength(1);

  // 5. /agente: a lista mostra a regra (guiado: na aba "O que ele pode fazer") e apaga.
  await page.goto("/agente");
  const aba = page.getByRole("tab", { name: "O que ele pode fazer" });
  if (await aba.isVisible()) await aba.click();
  const lista = page.locator('[data-slot="regras-salvas"]');
  await expect(lista.locator('[data-slot="regra-salva"]', { hasText: MARCA })).toBeVisible({ timeout: 15_000 });
  await lista.getByRole("button", { name: `Apagar a regra: ${MARCA}` }).click();
  await page.getByRole("button", { name: "Apagar regra" }).click();
  await expect(lista.locator('[data-slot="regra-salva"]', { hasText: MARCA })).toHaveCount(0, { timeout: 15_000 });

  const semRegra = await regrasDoTenant();
  expect(semRegra.regras).not.toContain(MARCA);
  expect(semRegra.persona).not.toContain(MARCA);
});
