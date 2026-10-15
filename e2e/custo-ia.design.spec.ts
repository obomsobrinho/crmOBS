import { test, expect } from "@playwright/test";
import {
  FRACAO_DO_AVISO,
  LIMITE_PADRAO_TOKENS,
  PRECOS_POR_MODELO,
  custoEstimadoUsd,
  estadoDaIa,
  estadoDoConsumo,
  limiteDaEmpresa,
  mesSP,
  avisoPendente,
  limiaresDoLimite,
  percentualDoLimite,
  podeAvisarConsumo,
  tokensCurto,
  tokensUsados,
  usdCurto,
} from "../lib/custo-ia";
import { caminhoDoAdmin, ehAdmin, ehUuid, idsDeAdmin } from "../lib/admin-acesso";
import { comLimite, limiteDigitado, limiteValido, paraEmpresa } from "../lib/admin-empresas";
import { mesmoDestino, textoDoAvisoDeConsumo } from "../lib/avisos";

// TETO DE IA DO MÊS, regras puras (P1 item 6, docs/plano-custo-ia.md). Sem
// banco e sem tela: a conta do custo contra a tabela oficial, os limiares de 80%
// e 100%, a virada do mês em São Paulo, modelo desconhecido e quem é admin.

const DASH = new RegExp("[\\u2013\\u2014]");

test.describe("Custo estimado (lib/custo-ia.ts)", () => {
  test("a tabela tem o modelo de hoje com o preço oficial de 13/10/2026", () => {
    expect(PRECOS_POR_MODELO["gpt-5.4-mini"]).toEqual({ entrada: 0.75, entradaCache: 0.075, saida: 4.5 });
  });

  test("o turno medido na OBM custa ~US$ 0,0023 (cache pago a preço de cache)", () => {
    const c = custoEstimadoUsd({ entrada: 4683, cache: 2304, saida: 83 }, "gpt-5.4-mini");
    // (2379 * 0,75 + 2304 * 0,075 + 83 * 4,5) / 1e6
    expect(c).toBeCloseTo((2379 * 0.75 + 2304 * 0.075 + 83 * 4.5) / 1e6, 12);
    expect(c!).toBeGreaterThan(0.0023);
    expect(c!).toBeLessThan(0.0024);
  });

  test("um milhão de cada tipo bate com a tabela", () => {
    expect(custoEstimadoUsd({ entrada: 1_000_000, cache: 0, saida: 0 }, "gpt-5.4-mini")).toBeCloseTo(0.75, 10);
    expect(custoEstimadoUsd({ entrada: 1_000_000, cache: 1_000_000, saida: 0 }, "gpt-5.4-mini")).toBeCloseTo(0.075, 10);
    expect(custoEstimadoUsd({ entrada: 0, cache: 0, saida: 1_000_000 }, "gpt-5.4-mini")).toBeCloseTo(4.5, 10);
    // Cache maior que a entrada (dado torto) nunca vira custo negativo.
    expect(custoEstimadoUsd({ entrada: 10, cache: 999, saida: 0 }, "gpt-5.4-mini")).toBeGreaterThanOrEqual(0);
  });

  test("modelo desconhecido ou ausente é null, nunca um preço parecido", () => {
    expect(custoEstimadoUsd({ entrada: 1000, cache: 0, saida: 10 }, "gpt-9-turbo")).toBeNull();
    expect(custoEstimadoUsd({ entrada: 1000, cache: 0, saida: 10 }, null)).toBeNull();
    expect(custoEstimadoUsd({ entrada: 1000, cache: 0, saida: 10 }, "")).toBeNull();
    expect(usdCurto(null)).toBeNull();
  });

  test("o teto padrão de 10 mi equivale a ~2.100 respostas do turno medido", () => {
    expect(LIMITE_PADRAO_TOKENS).toBe(10_000_000);
    const porTurno = tokensUsados({ entrada: 4683, saida: 83 });
    expect(Math.round(LIMITE_PADRAO_TOKENS / porTurno)).toBeGreaterThan(2000);
    expect(Math.round(LIMITE_PADRAO_TOKENS / porTurno)).toBeLessThan(2200);
  });
});

test.describe("Limiares (80% e 100%)", () => {
  test("normal, aviso aos 80%, parado no teto", () => {
    expect(FRACAO_DO_AVISO).toBe(0.8);
    expect(estadoDoConsumo(0, 100)).toBe("normal");
    expect(estadoDoConsumo(79, 100)).toBe("normal");
    expect(estadoDoConsumo(80, 100)).toBe("aviso");
    expect(estadoDoConsumo(99, 100)).toBe("aviso");
    expect(estadoDoConsumo(100, 100)).toBe("parado");
    expect(estadoDoConsumo(150, 100)).toBe("parado");
    expect(percentualDoLimite(50, 200)).toBe(25);
  });

  test("o teto conta entrada (com cache) mais saída", () => {
    expect(tokensUsados({ entrada: 4683, saida: 83 })).toBe(4766);
  });

  test("teto nulo ou inválido é o padrão; o gravado vale", () => {
    expect(limiteDaEmpresa(null)).toBe(LIMITE_PADRAO_TOKENS);
    expect(limiteDaEmpresa(undefined)).toBe(LIMITE_PADRAO_TOKENS);
    expect(limiteDaEmpresa(0)).toBe(LIMITE_PADRAO_TOKENS);
    expect(limiteDaEmpresa(-5)).toBe(LIMITE_PADRAO_TOKENS);
    expect(limiteDaEmpresa(25_000_000)).toBe(25_000_000);
  });

  test("subir o teto acima do uso tira a parada; baixar abaixo do uso para", () => {
    expect(estadoDoConsumo(12_000_000, limiteDaEmpresa(null))).toBe("parado");
    expect(estadoDoConsumo(12_000_000, limiteDaEmpresa(20_000_000))).toBe("normal");
    expect(estadoDoConsumo(12_000_000, limiteDaEmpresa(14_000_000))).toBe("aviso");
  });

  test("estado no admin: desligada vem antes do consumo", () => {
    expect(estadoDaIa({ publicada: true, ligada: true, consumo: "normal" })).toBe("ativa");
    expect(estadoDaIa({ publicada: true, ligada: true, consumo: "aviso" })).toBe("aviso");
    expect(estadoDaIa({ publicada: true, ligada: true, consumo: "parado" })).toBe("parada");
    expect(estadoDaIa({ publicada: true, ligada: false, consumo: "parado" })).toBe("desligada");
    expect(estadoDaIa({ publicada: false, ligada: true, consumo: "normal" })).toBe("desligada");
  });
});

test.describe("Quem pode disparar o aviso de uso (podeAvisarConsumo)", () => {
  test("bancada nunca, telefone de teste nunca, turno real do WhatsApp sim", () => {
    expect(podeAvisarConsumo({ dryRun: true, phone: "playground:uid-qualquer" })).toBe(false);
    expect(podeAvisarConsumo({ dryRun: true, phone: "5535984774753" })).toBe(false);
    expect(podeAvisarConsumo({ dryRun: false, phone: "5500000000001" })).toBe(false);
    expect(podeAvisarConsumo({ dryRun: false, phone: "5500000000001@s.whatsapp.net" })).toBe(false);
    expect(podeAvisarConsumo({ dryRun: false, phone: "5535984774753" })).toBe(true);
    expect(podeAvisarConsumo({ dryRun: false, phone: "553584774753@s.whatsapp.net" })).toBe(true);
  });
});

test.describe("Aviso pendente e limiares", () => {
  test("pendente é o nível do estado ainda sem marca; marcado não tenta de novo", () => {
    const sem = { aviso80: null, aviso100: null };
    expect(avisoPendente("normal", sem)).toBeNull();
    expect(avisoPendente("aviso", sem)).toBe("aviso");
    expect(avisoPendente("parado", sem)).toBe("parado");
    expect(avisoPendente("aviso", { aviso80: "2026-10-10T00:00:00Z", aviso100: null })).toBeNull();
    expect(avisoPendente("parado", { aviso80: "2026-10-10T00:00:00Z", aviso100: null })).toBe("parado");
    expect(avisoPendente("parado", { aviso80: null, aviso100: "2026-10-10T00:00:00Z" })).toBeNull();
  });

  test("limiares inteiros iguais à regra de estado", () => {
    expect(limiaresDoLimite(10_000_000)).toEqual({ aviso: 8_000_000, parado: 10_000_000 });
    const l = limiaresDoLimite(7);
    expect(estadoDoConsumo(l.aviso, 7)).toBe("aviso");
    expect(estadoDoConsumo(l.aviso - 1, 7)).toBe("normal");
    expect(estadoDoConsumo(l.parado, 7)).toBe("parado");
  });

  test("destinos iguais pela chave do telefone; grupo pelo JID", () => {
    expect(mesmoDestino("5535984774753@s.whatsapp.net", "553584774753@s.whatsapp.net")).toBe(true);
    expect(mesmoDestino("123@g.us", "123@g.us")).toBe(true);
    expect(mesmoDestino("123@g.us", "124@g.us")).toBe(false);
    expect(mesmoDestino(null, "123@g.us")).toBe(false);
  });

  test("uuid do admin: bem formado passa, torto não", () => {
    expect(ehUuid("489a604f-3f5e-4e05-a5db-c03f9d77cbb9")).toBe(true);
    expect(ehUuid("x")).toBe(false);
    expect(ehUuid("489a604f-3f5e-4e05-a5db-c03f9d77cbb")).toBe(false);
    expect(ehUuid(null)).toBe(false);
  });
});

test.describe("Mês de São Paulo", () => {
  test("vira à meia-noite do dia 1 em São Paulo, nunca em UTC", () => {
    // 01/11 02:59:59Z ainda é 31/10 em São Paulo (UTC-3).
    expect(mesSP(Date.parse("2026-11-01T02:59:59.999Z"))).toBe("2026-10-01");
    expect(mesSP(Date.parse("2026-11-01T03:00:00.000Z"))).toBe("2026-11-01");
    expect(mesSP(Date.parse("2027-01-01T02:59:59Z"))).toBe("2026-12-01");
    expect(mesSP(Date.parse("2027-01-01T03:00:00Z"))).toBe("2027-01-01");
    expect(mesSP(new Date("2028-02-29T23:59:00-03:00"))).toBe("2028-02-01");
  });
});

test.describe("Admin (lib/admin-acesso.ts)", () => {
  test("a lista vem da variável; sem ela ninguém é admin", () => {
    expect(idsDeAdmin(undefined)).toEqual([]);
    expect(idsDeAdmin("")).toEqual([]);
    expect(idsDeAdmin(" a , b,,c ")).toEqual(["a", "b", "c"]);
    expect(ehAdmin("a", undefined)).toBe(false);
    expect(ehAdmin(null, "a")).toBe(false);
    expect(ehAdmin("b", "a,b")).toBe(true);
    expect(ehAdmin("ab", "a,b")).toBe(false);
  });

  test("os caminhos do admin", () => {
    expect(caminhoDoAdmin("/admin")).toBe(true);
    expect(caminhoDoAdmin("/admin/x")).toBe(true);
    expect(caminhoDoAdmin("/api/admin/empresas")).toBe(true);
    expect(caminhoDoAdmin("/administrar")).toBe(false);
    expect(caminhoDoAdmin("/design/admin")).toBe(false);
    // A central mora em /clientes: não é caminho 404 (a página redireciona quem não é admin).
    expect(caminhoDoAdmin("/clientes")).toBe(false);
    expect(caminhoDoAdmin("/contatos")).toBe(false);
  });

  test("o limite digitado em milhões vira tokens; vazio é o padrão; lixo é recusado", () => {
    expect(limiteDigitado("")).toBeNull();
    expect(limiteDigitado("10")).toBe(10_000_000);
    expect(limiteDigitado("2,5")).toBe(2_500_000);
    expect(limiteDigitado("2.5")).toBe(2_500_000);
    // Ponto é casa decimal, nunca milhar: "0.5" é meio milhão (era 5 mi).
    expect(limiteDigitado("0.5")).toBe(500_000);
    expect(limiteDigitado("0,5")).toBe(500_000);
    expect(limiteDigitado("1000")).toBe(1_000_000_000);
    expect(limiteDigitado("1.000,5")).toBeUndefined();
    expect(limiteDigitado("10 mi")).toBeUndefined();
    expect(limiteDigitado("0")).toBeUndefined();
    expect(limiteDigitado("-3")).toBeUndefined();
    expect(limiteDigitado("abc")).toBeUndefined();
    expect(limiteDigitado("5000")).toBeUndefined();
    expect(limiteValido(null)).toBe(true);
    expect(limiteValido(10_000_000)).toBe(true);
    expect(limiteValido(1.5)).toBe(false);
    expect(limiteValido(0)).toBe(false);
    expect(limiteValido("10")).toBe(false);
  });

  test("a linha do banco vira o item com a mesma conta; editar o teto recalcula", () => {
    const e = paraEmpresa(
      {
        id: "x",
        name: "Empresa",
        account_type: null,
        billing_plan: null,
        agent_enabled: true,
        agent_published_at: "2026-08-01T00:00:00Z",
        ia_limite_tokens: 1_000_000,
        tokens_entrada: 900_000,
        tokens_cache: 100_000,
        tokens_saida: 150_000,
        ultima_atividade: null,
        subscription_status: "active",
        trial_ends_at: null,
        grace_until: null,
        created_at: "2026-08-01T00:00:00Z",
        tem_instancia: true,
        vitalicio_desde: null,
        bloqueado_em: null,
        desativada_em: null,
      },
      "gpt-9-turbo",
      Date.parse("2026-10-14T12:00:00Z")
    );
    expect(e.usados).toBe(1_050_000);
    expect(e.estado).toBe("parada");
    expect(e.custoUsd).toBeNull();
    const agora = Date.parse("2026-10-14T12:00:00Z");
    const subiu = comLimite(e, 2_000_000, agora);
    expect(subiu.estado).toBe("ativa");
    expect(subiu.percentual).toBeCloseTo(52.5, 5);
    expect(comLimite(e, null, agora).limite).toBe(LIMITE_PADRAO_TOKENS);
    // Os alertas acompanham o teto: parada no limite antes, sem esse alerta depois.
    expect(e.alertas[0].chave).toBe("limite_parado");
    expect(subiu.alertas.some((a) => a.chave === "limite_parado")).toBe(false);
  });
});

test.describe("Textos", () => {
  test("formatos curtos de tokens e dólar", () => {
    expect(tokensCurto(10_000_000)).toBe("10 mi");
    expect(tokensCurto(2_460_000)).toBe("2,5 mi");
    expect(tokensCurto(850_000)).toBe("850 mil");
    expect(tokensCurto(320)).toBe("320");
    expect(usdCurto(3.5)!.replace(/\s/g, " ")).toBe("US$ 3,50");
    expect(usdCurto(0.004)!.replace(/\s/g, " ")).toBe("menos de US$ 0,01");
  });

  test("o aviso de uso de IA: dois níveis, nome da empresa só para o dono, sem travessão", () => {
    const empresa80 = textoDoAvisoDeConsumo({ nivel: "aviso", usados: "8 mi", limite: "10 mi" });
    const dono100 = textoDoAvisoDeConsumo({ nivel: "parado", empresa: "Clínica X", usados: "10 mi", limite: "10 mi" });
    expect(empresa80).toContain("80% do limite");
    expect(empresa80).toContain("8 mi de 10 mi tokens");
    expect(empresa80).not.toContain("Clínica");
    expect(dono100).toContain("*Clínica X:*");
    expect(dono100).toContain("Limite de IA do mês atingido");
    for (const t of [empresa80, dono100]) expect(DASH.test(t)).toBe(false);
  });
});
