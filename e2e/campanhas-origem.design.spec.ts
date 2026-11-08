import { test, expect } from "@playwright/test";
import { blocoDeOrigem, SECAO_ORIGEM, textoParaLead } from "../lib/prospeccao";
import { comEnvioDaCampanha, semLoteAtual } from "../lib/mensagem";

// A origem de campanha no turno do agente (03/11/2026): a seção do prompt e o
// envio no histórico. Puro, sem banco.

const texto = textoParaLead("Oi! Achei a {empresa} no Google.", "Clínica Sorriso");

test.describe("Origem de campanha para o agente", () => {
  test("a seção diz que a empresa procurou primeiro, com a data em São Paulo e o texto exato", () => {
    const b = blocoDeOrigem({ enviadoEm: "2026-11-04T13:30:00Z", texto, parouEm: null, deOnde: "google" });
    expect(b.split("\n")[0]).toBe(`### ${SECAO_ORIGEM}`);
    expect(b).toContain("04 de novembro de 2026, às 10:30");
    expect(b).toContain(`"""\n${texto}\n"""`);
    expect(b).not.toContain("pediu para não receber");
    expect(b).not.toMatch(/[–—]/);
  });

  test("de onde veio o contato é uma linha de fato, pela lista do lead; sem saber, não registrada (07/11/2026)", () => {
    const base = { enviadoEm: "2026-11-04T13:30:00Z", texto, parouEm: null };
    expect(blocoDeOrigem({ ...base, deOnde: "google" })).toContain("\nOrigem do contato: busca no Google.");
    expect(blocoDeOrigem({ ...base, deOnde: "planilha" })).toContain("\nOrigem do contato: planilha.");
    expect(blocoDeOrigem({ ...base, deOnde: null })).toContain("\nOrigem do contato: não registrada.");
  });

  test("quem pediu para parar ganha a linha com a data", () => {
    const b = blocoDeOrigem({ enviadoEm: "2026-11-04T13:30:00Z", texto, parouEm: "2026-11-05T12:00:00Z", deOnde: "google" });
    expect(b.split("\n").at(-1)).toBe("Em 05 de novembro de 2026, às 09:00, a pessoa pediu para não receber mais mensagens de campanha.");
  });

  test("o envio entra no histórico no lugar dele (linhas da mais nova para a mais antiga)", () => {
    const linhas = [
      { user_message: "quanto custa?", bot_message: null, created_at: "2026-11-04T15:00:00Z" },
      { user_message: null, bot_message: "Aqui é o Tony", created_at: "2026-11-04T14:01:00Z" },
      { user_message: "oi, quem é?", bot_message: null, created_at: "2026-11-04T14:00:00Z" },
    ];
    const com = comEnvioDaCampanha(linhas, { enviadoEm: "2026-11-04T13:30:00Z", texto }, 24);
    expect(com.map((l) => l.bot_message ?? l.user_message)).toEqual(["quanto custa?", "Aqui é o Tony", "oi, quem é?", texto]);
    // Primeira resposta do lead: o histórico só tem o envio.
    expect(comEnvioDaCampanha([], { enviadoEm: "2026-11-04T13:30:00Z", texto }, 24)).toHaveLength(1);
  });

  test("com a janela cheia de linhas mais novas, o envio fica de fora", () => {
    const cheia = Array.from({ length: 3 }, (_, i) => ({ user_message: `m${i}`, bot_message: null, created_at: `2026-11-0${6 - i}T12:00:00Z` }));
    expect(comEnvioDaCampanha(cheia, { enviadoEm: "2026-11-01T12:00:00Z", texto }, 3)).toBe(cheia);
  });

  test("o corte do lote atual para no envio: a primeira resposta do lead não some do histórico errado", () => {
    const agora = Date.parse("2026-11-04T14:00:10Z");
    const linhas = comEnvioDaCampanha(
      [{ user_message: "oi, quem é?", bot_message: null, created_at: "2026-11-04T14:00:00Z" }],
      { enviadoEm: "2026-11-04T13:30:00Z", texto },
      24
    );
    // A mensagem do lote sai (vem no pedido); o envio fica.
    expect(semLoteAtual(linhas, agora, "oi, quem é?").map((l) => l.bot_message)).toEqual([texto]);
  });
});
