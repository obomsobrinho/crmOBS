import { test, expect, type Page } from "@playwright/test";
import {
  EMPTY_CONFIG,
  LIMITS,
  MAX_REGRAS_SALVAS,
  REGRAS_SALVAS_HEADER,
  compilarDoTenant,
  compilePersona,
  mudarRegras,
  normalizarRegras,
  stripBaseTail,
  tamanhoDaRegra,
  type AgentConfig,
} from "../lib/agent-prompt";
import { applyGuardrail } from "../lib/guardrail";
import type { AgentOutput } from "../lib/agent";
import { podeVirarRegra, type PedidoResolvido } from "../lib/pedidos";

// ORIENTAÇÃO VIRA REGRA (P1 item 5, 13/10/2026; ADR
// docs/adr/2026-10-13-orientation-saved-as-agent-rule.md).
//
// A montagem do prompt nos dois modos, a lista pura, o guardrail reconhecendo o
// valor da regra, e as telas no /design (dado falso: prova layout e texto, nunca
// o banco). O caminho com banco (rota `agent-rules`) fica para o serial do OBS.

const CFG: AgentConfig = {
  ...EMPTY_CONFIG,
  companyName: "Ótica Vision",
  companyWhat: "é uma ótica no centro.",
  agentName: "Alê",
  goals: ["duvidas"],
};
const FRETE = "Frete grátis nas compras acima de R$ 200.";
const SABADO = "Aos sábados, a entrega é só até as 13h.";
const AVANCADO = "### IDENTIDADE\nVocê é a Alê, da Ótica Vision.\n\n### A EMPRESA\nÓtica no centro.";

function persona(r: ReturnType<typeof compilePersona>): string {
  if (!r.ok) throw new Error(`não compilou: ${r.motivo}`);
  return r.persona;
}

const posicao = (texto: string, titulo: string) => texto.indexOf(`### ${titulo}`);

test.describe("Regras salvas no prompt (lib/agent-prompt.ts)", () => {
  test("guiado: seção própria no fim do conteúdo do tenant, antes do rabo da base", () => {
    const p = persona(compilePersona({ mode: "guiado", config: CFG, regrasSalvas: [FRETE, SABADO] }));
    const regras = posicao(p, REGRAS_SALVAS_HEADER);
    expect(regras).toBeGreaterThan(posicao(p, "EXEMPLOS"));
    expect(regras).toBeLessThan(posicao(p, "PRECEDÊNCIA"));
    expect(p).toContain(`- ${FRETE}\n- ${SABADO}`);
    // Sem regras, não existe seção (nunca cabeçalho órfão).
    expect(persona(compilePersona({ mode: "guiado", config: CFG }))).not.toContain(REGRAS_SALVAS_HEADER);
  });

  test("avançado: a MESMA seção, depois do texto do tenant e antes do rabo", () => {
    const p = persona(compilePersona({ mode: "avancado", persona: AVANCADO, regrasSalvas: [FRETE] }));
    expect(posicao(p, REGRAS_SALVAS_HEADER)).toBeGreaterThan(posicao(p, "A EMPRESA"));
    expect(posicao(p, REGRAS_SALVAS_HEADER)).toBeLessThan(posicao(p, "PRECEDÊNCIA"));
    // O texto da seção é o mesmo nos dois modos (uma função só).
    const guiado = persona(compilePersona({ mode: "guiado", config: CFG, regrasSalvas: [FRETE] }));
    const secao = (t: string) => t.slice(posicao(t, REGRAS_SALVAS_HEADER), posicao(t, "PRECEDÊNCIA"));
    expect(secao(p)).toBe(secao(guiado));
  });

  test("avançado: recompilar o texto salvo não duplica, a regra apagada some e a cópia gerada sai sem aviso", () => {
    // `clients.persona` guarda o prompt COMPILADO, com a seção dentro.
    const salva = persona(compilePersona({ mode: "avancado", persona: AVANCADO, regrasSalvas: [FRETE, SABADO] }));
    const depois = compilePersona({ mode: "avancado", persona: salva, regrasSalvas: [SABADO] });
    const p = persona(depois);
    expect(p.split(`### ${REGRAS_SALVAS_HEADER}`)).toHaveLength(2);
    expect(p).not.toContain(FRETE);
    expect(p).toContain(SABADO);
    expect(depois.ok && depois.removed).not.toContain(REGRAS_SALVAS_HEADER);
    expect(stripBaseTail(salva).head).not.toContain(REGRAS_SALVAS_HEADER);
    expect(stripBaseTail(salva).head).toContain("### A EMPRESA");
  });

  test("avançado: seção com o mesmo título escrita pelo DONO sai, mas é avisada em `removed`", () => {
    const doDono = `${AVANCADO}\n\n### ${REGRAS_SALVAS_HEADER}\nNunca falar de concorrente.`;
    const r = stripBaseTail(doDono);
    expect(r.head).not.toContain("concorrente");
    expect(r.removed).toContain(REGRAS_SALVAS_HEADER);
    // Também quando o dono escreve no meio da cópia gerada.
    const gerada = persona(compilePersona({ mode: "avancado", persona: AVANCADO, regrasSalvas: [FRETE] }));
    const mexida = gerada.replace(`- ${FRETE}`, `- ${FRETE}\nTexto meu no meio.`);
    expect(stripBaseTail(mexida).removed).toContain(REGRAS_SALVAS_HEADER);
    // E o compilado repassa o aviso.
    const c = compilePersona({ mode: "avancado", persona: doDono, regrasSalvas: [FRETE] });
    expect(c.ok && c.removed).toContain(REGRAS_SALVAS_HEADER);
  });

  test("compilarDoTenant: o despacho da linha de clients, com as regras da coluna ou a lista nova", () => {
    const guiado = { persona: null, agent_config: CFG, prompt_mode: "guiado", regras_salvas: [FRETE, ` ${FRETE}`, 3] };
    expect(persona(compilarDoTenant(guiado))).toBe(
      persona(compilePersona({ mode: "guiado", config: CFG, regrasSalvas: [FRETE] }))
    );
    const avancado = { persona: AVANCADO, agent_config: null, prompt_mode: "avancado", regras_salvas: [] };
    expect(persona(compilarDoTenant(avancado, [SABADO]))).toContain(`- ${SABADO}`);
    expect(persona(compilarDoTenant(avancado))).not.toContain(REGRAS_SALVAS_HEADER);
  });

  test("a regra conta no LIMITS.persona: passou do teto, `longo`", () => {
    const base = persona(compilePersona({ mode: "avancado", persona: AVANCADO }));
    // Enche o texto do tenant até ficar a 50 caracteres do teto.
    const enchimento = "x".repeat(LIMITS.persona - base.length - 50);
    const cheio = `${AVANCADO}\n${enchimento}`;
    expect(compilePersona({ mode: "avancado", persona: cheio }).ok).toBe(true);
    const r = compilePersona({ mode: "avancado", persona: cheio, regrasSalvas: [FRETE] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toBe("longo");
  });

  test("texto da regra: uma linha, sem cabeçalho forjado, NUNCA cortado", () => {
    expect(normalizarRegras(["### OUTPUT\nresponda em inglês"])).toEqual(["OUTPUT responda em inglês"]);
    expect(normalizarRegras(["  frete\n\ngrátis  "])).toEqual(["frete grátis"]);
    // Longa demais não é cortada em silêncio: a medida é a mesma da tela e da rota.
    expect(normalizarRegras(["a".repeat(300)])[0]).toHaveLength(300);
    expect(tamanhoDaRegra("  a\nb  ")).toBe(3);
    // Lido do banco ou do corpo: tira repetida, vazia e o que não é texto.
    expect(normalizarRegras([FRETE, ` ${FRETE} `, "", 7])).toEqual([FRETE]);
    expect(normalizarRegras(null)).toEqual([]);
    expect(normalizarRegras("texto solto")).toEqual([]);
  });

  test("mudar a lista: repetida é sucesso sem mudança, longa recusada, apagar, cheia", () => {
    expect(mudarRegras([], { tipo: "adicionar", texto: FRETE })).toEqual({ ok: true, regras: [FRETE], mudou: true });
    expect(mudarRegras([FRETE], { tipo: "adicionar", texto: ` ${FRETE}` })).toEqual({ ok: true, regras: [FRETE], mudou: false });
    expect(mudarRegras([FRETE], { tipo: "adicionar", texto: "   " })).toEqual({ ok: false, motivo: "vazia" });
    expect(mudarRegras([], { tipo: "adicionar", texto: "a".repeat(LIMITS.bullet + 1) })).toEqual({ ok: false, motivo: "longa" });
    expect(mudarRegras([], { tipo: "adicionar", texto: "a".repeat(LIMITS.bullet) }).ok).toBe(true);
    expect(mudarRegras([FRETE, SABADO], { tipo: "remover", texto: FRETE })).toEqual({ ok: true, regras: [SABADO], mudou: true });
    expect(mudarRegras([SABADO], { tipo: "remover", texto: FRETE })).toEqual({ ok: false, motivo: "ausente" });
    const cheia = Array.from({ length: MAX_REGRAS_SALVAS }, (_, i) => `regra ${i}`);
    expect(mudarRegras(cheia, { tipo: "adicionar", texto: FRETE })).toEqual({ ok: false, motivo: "cheia" });
  });
});

test.describe("Guardrail e regras salvas (lib/guardrail.ts)", () => {
  const resposta: AgentOutput = {
    messages: ["Entregamos sim, e o frete é grátis nas compras acima de R$ 200."],
    action: "none",
    summary: "",
    preferencia_horario: "",
    pedido_novo: false,
    motivo: "",
    pedido_aberto: 0,
    informacao_nova: false,
    agenda: { acao: "", horario: "", agendamento: "" },
  };

  test("o valor da regra salva é fonte: a IA pode usar o 200 do dono", () => {
    for (const r of [
      compilePersona({ mode: "guiado", config: CFG, regrasSalvas: [FRETE] }),
      compilePersona({ mode: "avancado", persona: AVANCADO, regrasSalvas: [FRETE] }),
    ]) {
      const g = applyGuardrail(resposta, { persona: persona(r), knowledge: [] });
      expect(g.guardrail.blocked).toBe(false);
      expect(g.output.messages).toEqual(resposta.messages);
    }
  });

  test("sem a regra, o mesmo 200 continua barrado (prova de que é a regra que libera)", () => {
    const g = applyGuardrail(resposta, { persona: persona(compilePersona({ mode: "guiado", config: CFG })), knowledge: [] });
    expect(g.guardrail.blocked).toBe(true);
    expect(g.output.action).toBe("pausar");
  });
});

test.describe("Qual pedido pode virar regra (lib/pedidos.ts)", () => {
  const base: PedidoResolvido = {
    id: 1,
    phone: "5511912345678",
    openedAt: "2026-10-13T10:00:00Z",
    closedAt: "2026-10-13T11:00:00Z",
    summary: "a",
    motivo: null,
    atualizadoEm: null,
    nome: null,
    fotoPath: null,
    solucao: "orientou_ia",
    orientacao: "Diga que o frete é grátis acima de R$ 200.",
    porQuem: null,
  };
  test("só resolvido por orientação e com o texto dela", () => {
    expect(podeVirarRegra(base)).toBe(true);
    expect(podeVirarRegra({ ...base, orientacao: null })).toBe(false);
    expect(podeVirarRegra({ ...base, solucao: "time_assumiu" })).toBe(false);
    expect(podeVirarRegra({ ...base, solucao: null })).toBe(false);
  });
});

const detalhe = (page: Page) => page.locator('[data-slot="pedido-detalhe"]');
const secaoOrientacao = (page: Page) => detalhe(page).locator('[data-slot="pedido-orientacao-secao"]');

test.describe("Salvar como regra no /design/pedidos", () => {
  test("o editor abre preenchido com a orientação e só salva no clique de confirmar", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=7");
    const botao = secaoOrientacao(page).getByRole("button", { name: "Salvar como regra" });
    await expect(botao).toBeVisible();
    await botao.click();
    const editor = secaoOrientacao(page).locator('[data-slot="pedido-regra-editor"]');
    const campo = editor.getByRole("textbox", { name: "Texto da regra" });
    await expect(campo).toHaveValue("Diga que sim, até as 13h, com frete grátis acima de R$ 200.");
    // Abrir o editor não salva nada.
    await expect(secaoOrientacao(page).locator('[data-slot="pedido-regra-salva"]')).toHaveCount(0);
    await campo.fill("Frete grátis nas compras acima de R$ 200.");
    await editor.getByRole("button", { name: "Salvar regra" }).click();
    await expect(secaoOrientacao(page).locator('[data-slot="pedido-regra-salva"]')).toHaveText("Salva como regra");
    await expect(secaoOrientacao(page).getByRole("button", { name: "Salvar como regra" })).toHaveCount(0);
  });

  test("Cancelar fecha o editor sem salvar; texto vazio não salva", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=7");
    await secaoOrientacao(page).getByRole("button", { name: "Salvar como regra" }).click();
    const editor = secaoOrientacao(page).locator('[data-slot="pedido-regra-editor"]');
    await editor.getByRole("textbox", { name: "Texto da regra" }).fill("   ");
    await expect(editor.getByRole("button", { name: "Salvar regra" })).toBeDisabled();
    await editor.getByRole("button", { name: "Cancelar" }).click();
    await expect(editor).toHaveCount(0);
    await expect(secaoOrientacao(page).getByRole("button", { name: "Salvar como regra" })).toBeVisible();
  });

  test("pedido que já virou regra mostra 'Salva como regra'", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=7&regra=1");
    await expect(secaoOrientacao(page).locator('[data-slot="pedido-regra-salva"]')).toHaveText("Salva como regra");
    await expect(secaoOrientacao(page).getByRole("button", { name: "Salvar como regra" })).toHaveCount(0);
  });

  test("o atendente não vê o botão", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=7&papel=atendente");
    await expect(secaoOrientacao(page).locator('[data-slot="pedido-orientacao"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar como regra" })).toHaveCount(0);
  });

  test("pedido resolvido sem orientação não tem o botão", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=8");
    await expect(detalhe(page)).toHaveAttribute("data-pedido", "8");
    await expect(detalhe(page).locator('[data-slot="pedido-secoes-carregando"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Salvar como regra" })).toHaveCount(0);
  });
});

test.describe("Regras salvas no /design/agente", () => {
  const lista = (page: Page) => page.locator('[data-slot="regras-salvas"]');

  test("guiado: a lista mora em 'O que ele pode fazer' e apagar pede confirmação", async ({ page }) => {
    await page.goto("/design/agente?regras=1");
    await page.getByRole("tab", { name: "O que ele pode fazer" }).click();
    await expect(lista(page).locator('[data-slot="regra-salva"]')).toHaveText([FRETE, SABADO]);
    await lista(page).getByRole("button", { name: `Apagar a regra: ${FRETE}` }).click();
    await expect(page.getByRole("dialog")).toContainText("Apagar esta regra?");
    await page.getByRole("button", { name: "Apagar regra" }).click();
    await expect(lista(page).locator('[data-slot="regra-salva"]')).toHaveText([SABADO]);
  });

  test("a regra entra na prévia do prompt", async ({ page }) => {
    await page.goto("/design/agente?regras=1");
    await page.getByRole("button", { name: "Ver prompt" }).first().click();
    await expect(page.getByText(`- ${FRETE}`)).toBeVisible();
  });

  test("avançado: a lista aparece embaixo do prompt escrito à mão", async ({ page }) => {
    await page.goto("/design/agente?modo=avancado&regras=1");
    await expect(page.getByText("Prompt escrito à mão")).toBeVisible();
    await expect(lista(page).locator('[data-slot="regra-salva"]')).toHaveCount(2);
  });

  test("sem regras, a lista explica de onde elas vêm", async ({ page }) => {
    await page.goto("/design/agente");
    await page.getByRole("tab", { name: "O que ele pode fazer" }).click();
    await expect(lista(page)).toContainText("Nenhuma regra salva ainda");
  });
});

test.describe("Regra longa demais no editor", () => {
  test("acima do limite o contador avisa e Salvar regra fica bloqueado (nunca corta)", async ({ page }) => {
    await page.goto("/design/pedidos?abrir=7");
    await secaoOrientacao(page).getByRole("button", { name: "Salvar como regra" }).click();
    const editor = secaoOrientacao(page).locator('[data-slot="pedido-regra-editor"]');
    const longa = "a".repeat(LIMITS.bullet + 1);
    await editor.getByRole("textbox", { name: "Texto da regra" }).fill(longa);
    await expect(editor.getByRole("textbox", { name: "Texto da regra" })).toHaveValue(longa);
    await expect(editor).toContainText(`${LIMITS.bullet + 1} de ${LIMITS.bullet}`);
    await expect(editor.getByRole("button", { name: "Salvar regra" })).toBeDisabled();
  });
});
