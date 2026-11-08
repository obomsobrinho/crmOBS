import { test, expect } from "@playwright/test";
import {
  PEDIDO_AO_ROBO,
  decisaoDoTurno,
  ehRespostaAutomatica,
  respostasAutomaticas,
  sinaisDaResposta,
  temPadraoDeAutomacao,
} from "../lib/resposta-automatica";
import { respostasDosEnvios } from "../lib/prospeccao";

// A trava do robô de menu (07/11/2026): 2 de 3 sinais (rápida, padrão, repetida).
// Puro, sem banco.

const MENU = "Olá! Bem-vindo à Loja Exemplo. Digite 1 para orçamento, 2 para horários, 3 para falar com um atendente.";
const T = Date.parse("2026-11-09T17:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

test.describe("Sinais da resposta automática", () => {
  test("padrão: opções numeradas e as palavras da lista do dono", () => {
    expect(temPadraoDeAutomacao(MENU)).toBe(true);
    expect(temPadraoDeAutomacao("1️⃣ Orçamento\n2️⃣ Horários")).toBe(true);
    expect(temPadraoDeAutomacao("1) Vendas 2) Suporte")).toBe(true);
    expect(temPadraoDeAutomacao("Aguarde, você será atendido.")).toBe(true);
    expect(temPadraoDeAutomacao("Esta é uma mensagem automática.")).toBe(true);
    expect(temPadraoDeAutomacao("Retornaremos em breve")).toBe(true);
    expect(temPadraoDeAutomacao("Escolha uma opção")).toBe(true);
    // Gente falando de números não é menu.
    expect(temPadraoDeAutomacao("Tenho 2 lojas e 3 funcionários")).toBe(false);
    expect(temPadraoDeAutomacao("Custa R$ 1.500,00 ou 2.000 parcelado")).toBe(false);
    expect(temPadraoDeAutomacao("Aqui é a recepção. Do que se trata?")).toBe(false);
  });

  test("rápida: até 5 s depois da ENTREGA da nossa última mensagem (2,5 s por mensagem e 1 s entre elas)", () => {
    const nossa = { em: T, partes: 2 };
    // Entregue até T + 2,5 + 1 + 2,5 = T + 6 s; janela até T + 11 s.
    expect(sinaisDaResposta({ texto: "x", em: T + 10_900 }, { nossas: [nossa], anteriores: new Set<string>() }).rapida).toBe(true);
    expect(sinaisDaResposta({ texto: "x", em: T + 11_100 }, { nossas: [nossa], anteriores: new Set<string>() }).rapida).toBe(false);
    // O envio da campanha é gravado antes de sair: a resposta pode vir 1 s "antes".
    expect(sinaisDaResposta({ texto: "x", em: T - 900 }, { nossas: [{ em: T, partes: 1 }], anteriores: new Set<string>() }).rapida).toBe(true);
    expect(sinaisDaResposta({ texto: "x", em: T + 60_000 }, { nossas: [{ em: T, partes: 1 }], anteriores: new Set<string>() }).rapida).toBe(false);
  });

  test("repetida: o mesmo texto normalizado, e nunca para texto curto", () => {
    // O mesmo menu, em caixa alta, horas depois: padrão + repetida.
    expect(respostasAutomaticas([
      { nossa: false, em: T, texto: MENU },
      { nossa: false, em: T + 3_600_000, texto: MENU.toUpperCase() },
    ])).toEqual([false, true]);
    // "ok" repetido logo depois da nossa: rápida, mas curto demais para contar como repetida.
    expect(respostasAutomaticas([
      { nossa: false, em: T, texto: "ok" },
      { nossa: true, em: T + 60_000, partes: 1 },
      { nossa: false, em: T + 61_000, texto: "ok" },
    ])).toEqual([false, false, false]);
  });

  test("é resposta automática com 2 sinais, nunca com 1", () => {
    expect(ehRespostaAutomatica({ rapida: true, padrao: true, repetida: false })).toBe(true);
    expect(ehRespostaAutomatica({ rapida: false, padrao: true, repetida: true })).toBe(true);
    expect(ehRespostaAutomatica({ rapida: true, padrao: false, repetida: true })).toBe(true);
    expect(ehRespostaAutomatica({ rapida: false, padrao: true, repetida: false })).toBe(false);
    expect(ehRespostaAutomatica({ rapida: true, padrao: false, repetida: false })).toBe(false);
  });

  test("uma pessoa que responde rápido, sem menu e sem repetir, é pessoa", () => {
    const flags = respostasAutomaticas([
      { nossa: true, em: T, partes: 1 },
      { nossa: false, em: T + 3_000, texto: "Oi, quem é?" },
    ]);
    expect(flags).toEqual([false, false]);
  });
});

test.describe("Decisão do turno (linhas da mais nova para a mais antiga)", () => {
  const campanha = { user_message: null, bot_message: "Oi, tudo bem? Sou o Tony, da OBS.", created_at: iso(T) };

  test("menu logo depois da campanha: pede uma pessoa", () => {
    const linhas = [{ user_message: MENU, bot_message: null, created_at: iso(T + 2_000) }, campanha];
    expect(decisaoDoTurno(linhas, 1)).toBe("pedir");
  });

  test("depois do pedido, o robô de novo: silêncio", () => {
    const linhas = [
      { user_message: "Aguarde, você será atendido.", bot_message: null, created_at: iso(T + 40_000) },
      { user_message: null, bot_message: PEDIDO_AO_ROBO, created_at: iso(T + 36_000) },
      { user_message: MENU, bot_message: null, created_at: iso(T + 2_000) },
      campanha,
    ];
    expect(decisaoDoTurno(linhas, 1)).toBe("silenciar");
  });

  test("o mesmo menu horas depois (lento, mas repetido): ainda é robô", () => {
    const linhas = [
      { user_message: MENU, bot_message: null, created_at: iso(T + 3 * 3_600_000) },
      { user_message: null, bot_message: PEDIDO_AO_ROBO, created_at: iso(T + 36_000) },
      { user_message: MENU, bot_message: null, created_at: iso(T + 2_000) },
      campanha,
    ];
    expect(decisaoDoTurno(linhas, 1)).toBe("silenciar");
  });

  test("uma pessoa responde depois do robô: atendimento normal", () => {
    const linhas = [
      { user_message: "Oi, aqui é a Marta. Do que se trata?", bot_message: null, created_at: iso(T + 600_000) },
      { user_message: null, bot_message: PEDIDO_AO_ROBO, created_at: iso(T + 36_000) },
      { user_message: MENU, bot_message: null, created_at: iso(T + 2_000) },
      campanha,
    ];
    expect(decisaoDoTurno(linhas, 1)).toBe("atender");
  });

  test("lote com uma pessoa no meio: atendimento normal", () => {
    const linhas = [
      { user_message: "sou eu que cuido", bot_message: null, created_at: iso(T + 4_000) },
      { user_message: MENU, bot_message: null, created_at: iso(T + 2_000) },
      campanha,
    ];
    expect(decisaoDoTurno(linhas, 2)).toBe("atender");
  });

  test("a resposta da IA em 2 mensagens: o robô que responde à segunda ainda é rápido", () => {
    const linhas = [
      { user_message: MENU, bot_message: null, created_at: iso(T + 100_000 + 9_000) },
      { user_message: null, bot_message: "Oi! | Tudo bem?", created_at: iso(T + 100_000) },
      { user_message: "oi", bot_message: null, created_at: iso(T + 80_000) },
      campanha,
    ];
    expect(decisaoDoTurno(linhas, 1)).toBe("pedir");
  });
});

test.describe("A campanha não conta o robô como resposta", () => {
  const envio = { campanhaId: "c1", leadId: "l1", telefone: "5535984774753", situacao: "enviado" as const, enviadoEm: T };
  const fone = "553584774753@s.whatsapp.net";

  test("o menu na hora não é \"respondeu\"; a pessoa que escreve depois é", () => {
    const r = respostasDosEnvios(
      [envio],
      [
        { telefone: fone, texto: MENU, em: T + 2_000 },
        { telefone: fone, texto: PEDIDO_AO_ROBO, em: T + 30_000, nossa: true, partes: 1 },
        { telefone: fone, texto: "Aguarde, você será atendido.", em: T + 31_000 },
        { telefone: fone, texto: "Oi, aqui é a Marta", em: T + 900_000 },
      ]
    );
    expect(r).toEqual([{ campanhaId: "c1", leadId: "l1", respondeuEm: T + 900_000 }]);
  });

  test("só o robô respondeu: nada registrado", () => {
    expect(respostasDosEnvios([envio], [{ telefone: fone, texto: MENU, em: T + 2_000 }])).toEqual([]);
  });

  test("SAIR conta sempre", () => {
    const r = respostasDosEnvios([envio], [{ telefone: fone, texto: "SAIR", em: T + 60_000 }]);
    expect(r).toEqual([{ campanhaId: "c1", leadId: "l1", respondeuEm: T + 60_000, parouEm: T + 60_000 }]);
  });
});
