import { test, expect } from "@playwright/test";
import {
  chaveTelefone,
  grafiasDoNumeroDeAvisos,
  ehNumeroDeAvisos,
  normalizarNumero,
  semNumeroDeAvisos,
  telefoneImpossivel,
  textoDoAviso,
} from "../lib/avisos";

// AVISOS NO WHATSAPP (29/09/2026, docs/plano-avisos.md).
//
// Duas metades: a REGRA (lib/avisos.ts, módulo puro, testada direto aqui sem
// navegador) e a TELA, com dado falso nas rotas /design. O envio de verdade não
// é testado em lugar nenhum da suíte, de propósito: mandaria WhatsApp. Esse é o
// teste do dono com o chip.

test.describe("Regra do número de avisos (lib/avisos.ts)", () => {
  test("o número digitado ganha o 55 e o resto fica como está", () => {
    expect(normalizarNumero("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizarNumero("11 1234-5678")).toBe("551112345678");
    expect(normalizarNumero("+55 11 91234-5678")).toBe("5511912345678");
    expect(normalizarNumero("1234")).toBeNull();
    expect(normalizarNumero("")).toBeNull();
  });

  test("o nono dígito não separa o mesmo celular", () => {
    // O WhatsApp guarda muitos números brasileiros sem o 9: a pessoa digita
    // com ele e a conversa chega sem. Os dois são o mesmo número.
    expect(chaveTelefone("5511912345678")).toBe(chaveTelefone("551112345678"));
    const destino = "5511912345678@s.whatsapp.net";
    expect(ehNumeroDeAvisos("551112345678", destino)).toBe(true);
    expect(ehNumeroDeAvisos("5511912345678", destino)).toBe(true);
    expect(ehNumeroDeAvisos("5511987654321", destino)).toBe(false);
  });

  test("grupo e destino vazio nunca escondem conversa", () => {
    expect(ehNumeroDeAvisos("5511912345678", "120363000000000001@g.us")).toBe(false);
    expect(ehNumeroDeAvisos("5511912345678", null)).toBe(false);
    const linhas = [{ phone: "551112345678" }, { phone: "5521999990000" }];
    expect(semNumeroDeAvisos(linhas, null, (l) => l.phone)).toHaveLength(2);
    expect(
      semNumeroDeAvisos(linhas, "5511912345678@s.whatsapp.net", (l) => l.phone)
    ).toEqual([{ phone: "5521999990000" }]);
  });

  test("o contador do menu exclui as duas grafias do número", () => {
    expect(grafiasDoNumeroDeAvisos("5511912345678@s.whatsapp.net").sort()).toEqual(
      ["551112345678", "5511912345678"].sort()
    );
    expect(grafiasDoNumeroDeAvisos("551112345678@s.whatsapp.net").sort()).toEqual(
      ["551112345678", "5511912345678"].sort()
    );
    expect(grafiasDoNumeroDeAvisos("120363000000000001@g.us")).toEqual([]);
    expect(grafiasDoNumeroDeAvisos(null)).toEqual([]);
  });

  test("a conversa de teste da suíte (DDD 00) nunca gera aviso", () => {
    expect(telefoneImpossivel("5500000000001")).toBe(true);
    expect(telefoneImpossivel("5511912345678")).toBe(false);
  });

  test("o texto do aviso: quem, o pedido e o link, sem travessão", () => {
    const t = textoDoAviso({
      nome: "Ana",
      phone: "5511912345678",
      resumo: "Quer saber se aceita cartão",
      abrir: "https://exemplo.test/inbox/5511912345678",
    });
    expect(t).toContain("A IA pediu sua ajuda");
    expect(t).toContain("Cliente: Ana (wa.me/5511912345678)");
    expect(t).toContain("Pedido: Quer saber se aceita cartão");
    expect(t).toContain("Abrir: https://exemplo.test/inbox/5511912345678");
    expect(t).not.toMatch(/[—–]/);
    // Sem nome, o telefone formatado; sem URL (fora da Vercel), sem a linha.
    const semNada = textoDoAviso({
      nome: null,
      phone: "5511912345678",
      resumo: "x",
      abrir: null,
    });
    expect(semNada).toContain("Cliente: +55 11 91234-5678");
    expect(semNada).not.toContain("Abrir:");
  });
});

test.describe("Bloco de avisos na montagem (/design/montagem)", () => {
  test("aparece só depois de conectar, e segura o Ativar até ter destino", async ({ page }) => {
    await page.goto("/design/montagem?passo=conectar");
    await expect(page.locator('[data-slot="montagem-avisos"]')).toHaveCount(0);

    await page.goto("/design/montagem?passo=conectar&conectado=1");
    const bloco = page.locator('[data-slot="montagem-avisos"]');
    await expect(bloco).toBeVisible();
    const ativar = page.getByRole("button", { name: "Ativar o agente" });
    await expect(ativar).toBeDisabled();
    // Botão desabilitado não mostra dica: a razão está escrita e ligada a ele.
    await expect(ativar).toHaveAttribute("aria-describedby", "razao-avisos");
    await expect(page.locator("#razao-avisos")).toHaveText(
      "Salve um número ou um grupo para poder ativar o agente."
    );

    // Salvou um número: o Ativar libera, e a tela diz para onde vão.
    await bloco.locator('[data-slot="avisos-numero"]').fill("11 91234-5678");
    await bloco.locator('[data-slot="avisos-salvar"]').click();
    await expect(bloco.locator('[data-slot="avisos-destino"]')).toContainText(
      "+55 11 91234-5678"
    );
    await expect(ativar).toBeEnabled();
    await expect(page.locator("#razao-avisos")).toHaveCount(0);
  });

  test("grupo é escolhido numa lista, nunca digitado", async ({ page }) => {
    await page.goto("/design/montagem?passo=conectar&conectado=1");
    const bloco = page.locator('[data-slot="montagem-avisos"]');
    await bloco.getByRole("tab", { name: "Um grupo" }).click();
    await expect(bloco.locator('[data-slot="avisos-numero"]')).toHaveCount(0);
    await bloco.getByRole("combobox", { name: "Grupo que recebe os avisos" }).click();
    await page.getByRole("option", { name: "Time de atendimento" }).click();
    await bloco.locator('[data-slot="avisos-salvar"]').click();
    await expect(bloco.locator('[data-slot="avisos-destino"]')).toContainText(
      "o grupo Time de atendimento"
    );
    await expect(page.getByRole("button", { name: "Ativar o agente" })).toBeEnabled();
  });

  test("número com máscara, e o seletor é o mesmo componente das abas do Painel", async ({ page }) => {
    await page.goto("/design/montagem?passo=conectar&conectado=1");
    const bloco = page.locator('[data-slot="montagem-avisos"]');
    const campo = bloco.locator('[data-slot="avisos-numero"]');
    await campo.fill("");
    await campo.pressSequentially("5511912345678");
    await expect(campo).toHaveValue("(11) 91234-5678");
    await campo.fill("1133334444");
    await expect(campo).toHaveValue("(11) 3333-4444");
    // Abas de verdade (role tab), dentro da bandeja da variante painel.
    await expect(bloco.getByRole("tab", { name: "Um número" })).toHaveAttribute("data-state", "active");
    await expect(bloco.locator('[data-slot="tabs-list"]')).toHaveClass(/rounded-\[10px\]/);
  });

  test("o texto do bloco não tem travessão nem assume segmento", async ({ page }) => {
    await page.goto("/design/montagem?passo=conectar&conectado=1");
    const texto = await page.locator('[data-slot="montagem-avisos"]').innerText();
    expect(texto).not.toMatch(/[—–]/);
    expect(texto).not.toMatch(/consulta|paciente|agendamento/i);
  });
});

test.describe("Bloco de avisos no /agente (/design/agente)", () => {
  test("com destino salvo, nada de aviso âmbar", async ({ page }) => {
    await page.goto("/design/agente");
    await page.getByRole("tab", { name: "O que ele pode fazer" }).click();
    // O mock tem destino salvo: nada de aviso âmbar.
    await expect(page.locator('[data-slot="avisos-vazio"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="avisos-destino"]')).toBeVisible();
  });
});
