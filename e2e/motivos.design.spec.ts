import fs from "node:fs";
import { test, expect } from "@playwright/test";
import {
  MOTIVOS,
  MOTIVOS_DO_MODELO,
  contagemPorMotivo,
  motivoDoPedido,
  motivosParaPrompt,
  rotuloDoMotivo,
} from "../lib/motivos";
import { textoDoAviso } from "../lib/avisos";
import { casaMotivo } from "../lib/pedidos";

// MOTIVO DO PEDIDO DE AJUDA (06/10/2026, P1 item 4, docs/plano-motivo-pedido.md).
// A regra pura (lib/motivos.ts) e as telas de demonstração, sem banco e sem modelo.

test.describe("Motivos (lib/motivos.ts)", () => {
  test("o modelo nunca escolhe 'seguranca'; quem marca é o guardrail", () => {
    expect(MOTIVOS_DO_MODELO.map((m) => m.chave)).not.toContain("seguranca");
    expect(motivosParaPrompt()).not.toContain("seguranca");
    expect(motivoDoPedido("seguranca", false)).toBeNull();
    expect(motivoDoPedido("preco", true)).toBe("seguranca");
    expect(motivoDoPedido("preco", false)).toBe("preco");
    // Fora da lista ou vazio: null, nunca um motivo inventado.
    expect(motivoDoPedido("outro", false)).toBeNull();
    expect(motivoDoPedido("", false)).toBeNull();
  });

  test("pedido antigo (sem motivo) aparece como 'Sem motivo'", () => {
    expect(rotuloDoMotivo(null)).toBe("Sem motivo");
    expect(rotuloDoMotivo("pessoa")).toBe("Pediu uma pessoa");
  });

  test("a contagem vai do mais frequente ao menos, e 'Sem motivo' fica por último", () => {
    const c = contagemPorMotivo([
      { motivo: null, n: 9 },
      { motivo: "pessoa", n: 3 },
      { motivo: "preco", n: 5 },
      { motivo: "reclamacao", n: 3 },
      { motivo: "urgencia", n: 0 },
    ]);
    expect(c.total).toBe(20);
    expect(c.itens.map((i) => i.motivo)).toEqual(["preco", "pessoa", "reclamacao", null]);
    expect(contagemPorMotivo([])).toEqual({ total: 0, itens: [] });
  });

  test("o check do banco tem exatamente as chaves da lista", () => {
    const sql = fs.readFileSync("supabase/migrations/20261006211419_motivo_do_pedido.sql", "utf8");
    const bloco = sql.slice(sql.indexOf("motivo is null or motivo in ("), sql.indexOf(");", sql.indexOf("motivo in (")));
    const chaves = [...bloco.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(chaves).toEqual(MOTIVOS.map((m) => m.chave).sort());
  });

  test("o aviso no WhatsApp traz o motivo antes do pedido, e some quando não há", () => {
    const com = textoDoAviso({ nome: "Ana", phone: "5511912345678", resumo: "Quer o valor", motivo: "Preço ou orçamento", abrir: null });
    expect(com).toContain("*Motivo:* Preço ou orçamento");
    expect(com.indexOf("*Motivo:*")).toBeLessThan(com.indexOf("*Pedido:*"));
    const sem = textoDoAviso({ nome: "Ana", phone: "5511912345678", resumo: "Quer o valor", motivo: null, abrir: null });
    expect(sem).not.toContain("Motivo");
  });

  test("o filtro da página de Pedidos é o mesmo do banco (null = todos)", () => {
    expect(casaMotivo({ motivo: "preco" }, null)).toBe(true);
    expect(casaMotivo({ motivo: "preco" }, "preco")).toBe(true);
    expect(casaMotivo({ motivo: null }, "preco")).toBe(false);
  });
});

test.describe("Motivo nas telas de demonstração", () => {
  test("Pedidos mostra o motivo na linha e filtra por ele", async ({ page }) => {
    await page.goto("/design/pedidos");
    const linha = page.locator('[data-slot="pedido-linha"]', { hasText: "antirreflexo" });
    await expect(linha.getByText("Preço ou orçamento")).toBeVisible();
    await page.getByLabel("Filtrar por motivo").click();
    await page.getByRole("option", { name: "Pediu uma pessoa" }).click();
    // Nos abertos de demonstração ninguém pediu uma pessoa.
    await expect(page.locator('[data-slot="pedidos-vazio"]')).toContainText("Pediu uma pessoa");
    await page.getByLabel("Filtrar por motivo").click();
    await page.getByRole("option", { name: "Preço ou orçamento" }).click();
    await expect(page.locator('[data-slot="pedido-linha"]')).toHaveCount(1);
  });

  test("o Painel conta os pedidos por motivo, e o período é do bloco", async ({ page }) => {
    await page.goto("/design/painel");
    const bloco = page.locator('[data-slot="painel-motivos"]');
    await expect(bloco).toBeVisible();
    await bloco.getByRole("tab", { name: "Mês" }).click();
    await expect(bloco.locator('[data-slot="painel-motivos-total"]')).toContainText("47 pedidos de ajuda");
    const ordem = await bloco.locator("[data-motivo]").evaluateAll((els) => els.map((e) => e.getAttribute("data-motivo")));
    expect(ordem).toEqual(["preco", "pessoa", "falta_info", "reclamacao", "sem"]);
    await bloco.getByRole("tab", { name: "Dia" }).click();
    await expect(bloco).toContainText("Ela não precisou te chamar");
  });
});
