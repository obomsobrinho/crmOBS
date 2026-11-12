import { test, expect } from "@playwright/test";
import {
  PEDIDO_AO_ROBO,
  decisaoDoTurno,
  ehRespostaAutomatica,
  respostasAutomaticas,
  sinaisDaResposta,
  temPadraoDeAutomacao,
} from "../lib/resposta-automatica";
import { ehPedidoParaParar, respostasDosEnvios } from "../lib/prospeccao";

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
    // O envio da campanha é gravado quando a Evolution confirma: o robô pode responder até 5 s "antes".
    expect(sinaisDaResposta({ texto: "x", em: T - 4_900 }, { nossas: [{ em: T, partes: 1 }], anteriores: new Set<string>() }).rapida).toBe(true);
    expect(sinaisDaResposta({ texto: "x", em: T - 5_100 }, { nossas: [{ em: T, partes: 1 }], anteriores: new Set<string>() }).rapida).toBe(false);
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

// As respostas reais da "Campanha Lajinha primeira" (10 e 11/11/2026), com o
// tempo depois do envio confirmado. Antes da ampliação de 11/11/2026 nenhuma
// travava: só tinham o sinal "rápida". Esperado: 6 de 7 robôs travam; a ausência
// da advogada chegou 22 min depois (só a frase, 1 sinal) e continua passando,
// porque uma frase de ausência sozinha não basta (decisão do dono, 11/11/2026).
test.describe("Respostas reais da campanha de Lajinha (11/11/2026)", () => {
  const envio = { user_message: null, bot_message: "Oi, tudo bem? Sou o Tony, da OBS.", created_at: iso(T) };
  const recebida = (texto: string, depoisMs: number) => ({ user_message: texto, bot_message: null, created_at: iso(T + depoisMs) });

  const ROBOS: { quem: string; lote: [string, number][] }[] = [
    { quem: "Espaço Suellen Mota", lote: [["‎Espaço Suellen Mota agradece seu contato. Como podemos ajudar?", 4_800]] },
    {
      quem: "Clínica AME (2 no mesmo segundo, a 1ª um menu de ✅)",
      lote: [
        [
          "🩺Olá, seja bem vindo (a)! \n\nPara agilizar seu atendimento, me informa, em que posso ajudar: \n\nEspecialidades:\n✅Ginecologista/Obstetra\n✅Pediatra\n✅Dermatologista\n✅Depilação a laser\n✅Vacinação \n\n📌 Qual o tipo de atendimento que deseja, e com qual especialista;\n\n🛎️ *Para agilizarmos o seu atendimento, gentileza não enviar áudio* 🛎️",
          900,
        ],
        ["Olá. Somos da clínica AME. Não estamos disponíveis no momento, mas aguarde que assim que possível retornaremos o contato! Para agilizar seu atendimento, nos informe o que deseja agendar!", 1_900],
      ],
    },
    { quem: "Dentista do Trabalhador", lote: [["‎Dentista Do Trabalhador agradece seu contato. Como podemos ajudar?", 4_250]] },
    {
      quem: "Clínica Mateus Machado",
      lote: [["Olá,tudo bem? 😃💎\n\nÉ um prazer lhe atender! Dentro de alguns minutos estarei te respondendo. \n\nGostaria de me adiantar, por qual tratamento você se interessou?✨", 2_200]],
    },
    {
      quem: "Dra. Hinglid",
      lote: [["Olá, Consultório Odontológica Dra Hinglid, obrigada pelo contato!\nRecebemos a sua mensagem e entraremos em contato com você assim que possível", 2_850]],
    },
    {
      quem: "Espaço Costa",
      lote: [
        [
          "Olá! Atendo de segunda a sexta, com horário marcado. No momento não estou disponível, mas retornarei em breve. ✨\n\nPor favor, informe o procedimento desejado para agilizarmos.\n\nAviso: Cancelamentos devem ser feitos com até 24h de antecedência. O não comparecimento sem aviso prévio gera a cobrança de 50% do valor do serviço.",
          2_700,
        ],
      ],
    },
  ];

  for (const r of ROBOS) {
    test(`robô travado: ${r.quem}`, () => {
      const linhas = [...r.lote.map(([t, ms]) => recebida(t, ms)).reverse(), envio];
      expect(decisaoDoTurno(linhas, r.lote.length)).toBe("pedir");
    });
  }

  test("a ausência que chega 22 min depois (1 sinal) continua com o Tony", () => {
    const texto =
      "Olá!\nNo momento não estou disponível, posso estar em atendimento, reunião ou audiência.\nPeço que deixe seu nome e uma breve mensagem sobre como posso ajudar.\nAssim que possível, retornarei o contato com toda atenção.\n\n💼 Atendimento de segunda a sexta, das 8h às 17h.\n\nAgradeço desde já pela compreensão e pela confiança!";
    expect(temPadraoDeAutomacao(texto)).toBe(true);
    expect(decisaoDoTurno([recebida(texto, 1_318_000), envio], 1)).toBe("atender");
  });

  test("o \"Sair\" de uma pessoa minutos depois é atendido e para a campanha", () => {
    expect(decisaoDoTurno([recebida("Sair", 190_000), envio], 1)).toBe("atender");
    expect(ehPedidoParaParar("Sair")).toBe(true);
  });

  // Frases de pessoa, mesmo chegando 3 s depois do envio (sinal "rápida"): nenhuma é padrão.
  const PESSOAS = [
    "Sair",
    "Quanto custa?",
    "Não tenho interesse, obrigado",
    "Agora não posso, te chamo mais tarde",
    "Oi, quem é?",
    "Bom dia! Do que se trata?",
    "Sim, a gente responde na hora",
    "Aqui quem responde sou eu mesma",
    "Pode falar, sou a dona",
    "Me manda mais informações por favor",
  ];
  for (const p of PESSOAS) {
    test(`pessoa não trava: "${p}"`, () => {
      expect(temPadraoDeAutomacao(p)).toBe(false);
      expect(decisaoDoTurno([recebida(p, 3_000), envio], 1)).toBe("atender");
    });
  }

  test("menu de marcadores: 3 linhas contam, 2 não, e negrito no começo da linha não é marcador", () => {
    expect(temPadraoDeAutomacao("Serviços:\n• Corte\n• Barba\n• Sobrancelha")).toBe(true);
    expect(temPadraoDeAutomacao("- Vendas\n- Suporte\n- Financeiro")).toBe(true);
    expect(temPadraoDeAutomacao("✅ Corte\n✅ Barba")).toBe(false);
    expect(temPadraoDeAutomacao("*Oi*\n*tudo bem?*\n*quem fala?*")).toBe(false);
  });
});
