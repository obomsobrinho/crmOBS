import { test, expect } from "@playwright/test";
import {
  JANELA_PRIMEIRA_RESPOSTA_MS,
  decisaoDoTurno,
  ehLoteDeRoboNaPrimeiraResposta,
  ehPrimeiraRespostaAoEnvio,
  ehRespostaAutomatica,
  respostasAutomaticas,
  sinaisDaResposta,
  temCaraDeAutomacao,
  temPadraoDeAutomacao,
} from "../lib/resposta-automatica";
import { textoDoAvisoDeLeadDaCampanha } from "../lib/avisos";
import casosReais from "./fixtures/campanha-robos-2026-11.json";
import { ehPedidoParaParar, respostasDosEnvios } from "../features/campanhas/regras";

// A trava do robô de menu: a janela da primeira resposta (24/11/2026) e os 2 de 3
// sinais (07/11/2026). Com robô, silêncio. Puro, sem banco.

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

  test("menu logo depois da campanha: silêncio (nenhuma mensagem ao robô)", () => {
    const linhas = [{ user_message: MENU, bot_message: null, created_at: iso(T + 2_000) }, campanha];
    expect(decisaoDoTurno(linhas, 1, campanha.created_at)).toBe("silenciar");
  });

  test("o robô de novo depois do silêncio: silêncio", () => {
    const linhas = [
      { user_message: "Aguarde, você será atendido.", bot_message: null, created_at: iso(T + 40_000) },
      { user_message: MENU, bot_message: null, created_at: iso(T + 2_000) },
      campanha,
    ];
    expect(decisaoDoTurno(linhas, 1, campanha.created_at)).toBe("silenciar");
  });

  test("o mesmo menu horas depois (lento, mas repetido): ainda é robô", () => {
    const linhas = [
      { user_message: MENU, bot_message: null, created_at: iso(T + 3 * 3_600_000) },
      { user_message: MENU, bot_message: null, created_at: iso(T + 2_000) },
      campanha,
    ];
    expect(decisaoDoTurno(linhas, 1, campanha.created_at)).toBe("silenciar");
  });

  test("uma pessoa responde depois do robô: atendimento normal", () => {
    const linhas = [
      { user_message: "Oi, aqui é a Marta. Do que se trata?", bot_message: null, created_at: iso(T + 600_000) },
      { user_message: MENU, bot_message: null, created_at: iso(T + 2_000) },
      campanha,
    ];
    expect(decisaoDoTurno(linhas, 1, campanha.created_at)).toBe("atender");
  });

  test("lote com uma pessoa no meio FORA da janela: atendimento normal", () => {
    const linhas = [
      { user_message: "sou eu que cuido", bot_message: null, created_at: iso(T + 600_000) },
      { user_message: MENU, bot_message: null, created_at: iso(T + 599_000) },
      campanha,
    ];
    expect(decisaoDoTurno(linhas, 2, campanha.created_at)).toBe("atender");
  });

  // Risco aceito da opção B (24/11/2026): na janela da primeira resposta o lote é
  // julgado inteiro, e uma pessoa que escreve junto com o robô fica sem resposta
  // naquele lote. A próxima mensagem dela é atendida.
  test("lote com uma pessoa no meio DENTRO da janela: silêncio (risco aceito)", () => {
    const linhas = [
      { user_message: "sou eu que cuido", bot_message: null, created_at: iso(T + 4_000) },
      { user_message: MENU, bot_message: null, created_at: iso(T + 2_000) },
      campanha,
    ];
    expect(decisaoDoTurno(linhas, 2, campanha.created_at)).toBe("silenciar");
  });

  test("a resposta da IA em 2 mensagens: o robô que responde à segunda ainda é rápido", () => {
    const linhas = [
      { user_message: MENU, bot_message: null, created_at: iso(T + 100_000 + 9_000) },
      { user_message: null, bot_message: "Oi! | Tudo bem?", created_at: iso(T + 100_000) },
      { user_message: "oi", bot_message: null, created_at: iso(T + 80_000) },
      campanha,
    ];
    expect(decisaoDoTurno(linhas, 1, campanha.created_at)).toBe("silenciar");
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
// travava: só tinham o sinal "rápida". Esperado: 6 de 7 robôs ficam em silêncio; a ausência
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
      expect(decisaoDoTurno(linhas, r.lote.length, envio.created_at)).toBe("silenciar");
    });
  }

  test("a ausência que chega 22 min depois (1 sinal) continua com o Tony", () => {
    const texto =
      "Olá!\nNo momento não estou disponível, posso estar em atendimento, reunião ou audiência.\nPeço que deixe seu nome e uma breve mensagem sobre como posso ajudar.\nAssim que possível, retornarei o contato com toda atenção.\n\n💼 Atendimento de segunda a sexta, das 8h às 17h.\n\nAgradeço desde já pela compreensão e pela confiança!";
    expect(temPadraoDeAutomacao(texto)).toBe(true);
    expect(decisaoDoTurno([recebida(texto, 1_318_000), envio], 1, envio.created_at)).toBe("atender");
  });

  test("o \"Sair\" de uma pessoa minutos depois é atendido e para a campanha", () => {
    expect(decisaoDoTurno([recebida("Sair", 190_000), envio], 1, envio.created_at)).toBe("atender");
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
      expect(decisaoDoTurno([recebida(p, 3_000), envio], 1, envio.created_at)).toBe("atender");
    });
  }

  test("menu de marcadores: 3 linhas contam, 2 não, e negrito no começo da linha não é marcador", () => {
    expect(temPadraoDeAutomacao("Serviços:\n• Corte\n• Barba\n• Sobrancelha")).toBe(true);
    expect(temPadraoDeAutomacao("- Vendas\n- Suporte\n- Financeiro")).toBe(true);
    expect(temPadraoDeAutomacao("✅ Corte\n✅ Barba")).toBe(false);
    expect(temPadraoDeAutomacao("*Oi*\n*tudo bem?*\n*quem fala?*")).toBe(false);
  });
});

// ── A campanha "Lajinha segunda campanha complementar" (12 a 17/11/2026) ──────
// Os 19 casos reais do diagnóstico de 23/11/2026 (`e2e/fixtures/campanha-robos-2026-11.json`,
// sem telefone): 17 robôs, 1 número errado por áudio e 1 pessoa. Com a regra de
// 07/11/2026 e a origem consertada, 9 de 17 robôs travavam; com a janela da
// primeira resposta (opção B, 24/11/2026), os 17 ficam em silêncio e as 2 pessoas
// são atendidas. Cada caso entra até a primeira resposta do Tony de então, porque
// com o silêncio o resto da conversa (o robô respondendo ao Tony) não acontece.
test.describe("Casos reais da segunda campanha de Lajinha (23/11/2026)", () => {
  type Caso = { empresa: string; conversa: { de: string; segundos: number; tipo: string; texto: string }[] };
  const casos = (casosReais as { casos: Caso[] }).casos;
  const ENVIO = Date.parse("2026-11-12T14:35:04.500Z");
  const envio = { user_message: null, bot_message: "Bom dia! Sou o Tony, da OBS.", created_at: iso(ENVIO) };
  const linha = (m: Caso["conversa"][number]) => ({
    user_message: m.de === "lead" ? m.texto : null,
    bot_message: m.de === "lead" ? null : m.texto,
    created_at: iso(ENVIO + Math.round(m.segundos * 1000)),
    message_type: m.tipo,
  });
  const PESSOAS = new Set(["Belizário Supermercado", "Lolostore Cosmeticos"]);
  /** As mensagens do lead antes da primeira resposta do Tony. */
  const primeiroLote = (c: Caso) => {
    const k = c.conversa.findIndex((m) => m.de !== "lead");
    return (k === -1 ? c.conversa : c.conversa.slice(0, k)).filter((m) => m.de === "lead");
  };

  test("a fixture tem os 19 casos, 17 robôs e nenhum telefone", () => {
    expect(casos).toHaveLength(19);
    expect(casos.filter((c) => !PESSOAS.has(c.empresa))).toHaveLength(17);
    expect(JSON.stringify(casosReais)).not.toMatch(/[1-9]\d{9,}/);
  });

  for (const c of casos) {
    const robo = !PESSOAS.has(c.empresa);
    const lote = primeiroLote(c);
    test(`${c.empresa}: ${robo ? "silêncio" : "atende"} (lote inteiro de uma vez)`, () => {
      const linhas = [...lote.map(linha).reverse(), envio];
      expect(decisaoDoTurno(linhas, lote.length, envio.created_at)).toBe(robo ? "silenciar" : "atender");
    });
    if (robo && lote.length > 1) {
      // O n8n pode partir o lote em turnos (debounce): cada pedaço, com os de antes no histórico.
      test(`${c.empresa}: silêncio também mensagem a mensagem`, () => {
        for (let n = 1; n <= lote.length; n++) {
          const linhas = [...lote.slice(0, n).map(linha).reverse(), envio];
          expect(decisaoDoTurno(linhas, 1, envio.created_at)).toBe("silenciar");
        }
      });
    }
  }

  test("o cron da campanha conta só as 2 pessoas como \"respondeu\"", () => {
    const fone = (i: number) => `55000000${String(i).padStart(5, "0")}`;
    const envios = casos.map((_, i) => ({ campanhaId: "c1", leadId: `l${i}`, telefone: fone(i), situacao: "enviado" as const, enviadoEm: ENVIO }));
    const mensagens = casos.flatMap((c, i) =>
      primeiroLote(c).map((m) => ({ telefone: fone(i), texto: m.texto, em: ENVIO + Math.round(m.segundos * 1000), audio: m.tipo === "audio" }))
    );
    const r = respostasDosEnvios(envios, mensagens);
    expect(r.map((x) => casos[Number(x.leadId.slice(1))].empresa).sort()).toEqual([...PESSOAS].sort());
  });

  test("Lolô: a primeira resposta avisa o dono; o \"Ok\" depois da resposta do Tony não", () => {
    const lolo = casos.find((c) => c.empresa === "Lolostore Cosmeticos")!;
    const [fazSim, tony, ok] = lolo.conversa;
    expect(ehPrimeiraRespostaAoEnvio([linha(fazSim), envio], envio.created_at)).toBe(true);
    expect(decisaoDoTurno([linha(ok), linha(tony), linha(fazSim), envio], 1, envio.created_at)).toBe("atender");
    expect(ehPrimeiraRespostaAoEnvio([linha(ok), linha(tony), linha(fazSim), envio], envio.created_at)).toBe(false);
  });

  test("Belizário: áudio nunca é robô, nem dentro da janela", () => {
    const audio = {
      user_message: "Boa tarde, esse número não é do mercado, eu tentei fazer um cadastro.",
      bot_message: null,
      created_at: iso(ENVIO + 3_000),
      message_type: "audio",
    };
    expect(decisaoDoTurno([audio, envio], 1, envio.created_at)).toBe("atender");
    // Áudio sem transcrição também conta (é uma pessoa), e no lote derruba o silêncio.
    expect(decisaoDoTurno([{ ...audio, user_message: null }, envio], 1, envio.created_at)).toBe("atender");
    const robo = { user_message: MENU, bot_message: null, created_at: iso(ENVIO + 2_000) };
    expect(decisaoDoTurno([audio, robo, envio], 2, envio.created_at)).toBe("atender");
  });
});

// ── Casos sintéticos do diagnóstico (20 a 24) ──────────────────────────────────
test.describe("Janela da primeira resposta: casos sintéticos", () => {
  const campanha = { user_message: null, bot_message: "Oi, tudo bem? Sou o Tony, da OBS.", created_at: iso(T) };
  const recebida = (texto: string, depoisMs: number) => ({ user_message: texto, bot_message: null, created_at: iso(T + depoisMs) });
  const LONGO =
    "Oi Tony, aqui é a Carla, dona do salão. A gente responde quando dá, mas no sábado fica corrido e muita gente fica sem resposta.";

  test("20. \"Oi, quem é?\" em 5 s: atende (curto, sem padrão, sem link)", () => {
    expect(decisaoDoTurno([recebida("Oi, quem é?", 5_000), campanha], 1, campanha.created_at)).toBe("atender");
    expect(ehPrimeiraRespostaAoEnvio([recebida("Oi, quem é?", 5_000), campanha], campanha.created_at)).toBe(true);
  });

  test("21. \"Sair\" em qualquer tempo: atende e o cron para a campanha", () => {
    for (const ms of [3_000, 60_000, 7_200_000]) {
      expect(decisaoDoTurno([recebida("Sair", ms), campanha], 1, campanha.created_at)).toBe("atender");
      const r = respostasDosEnvios(
        [{ campanhaId: "c1", leadId: "l1", telefone: "5500000000001", situacao: "enviado", enviadoEm: T }],
        [{ telefone: "5500000000001", texto: "Sair", em: T + ms }]
      );
      expect(r).toEqual([{ campanhaId: "c1", leadId: "l1", respondeuEm: T + ms, parouEm: T + ms }]);
    }
  });

  test("22. robô em silêncio e, 20 min depois, uma pessoa: atende, e é a primeira resposta (aviso)", () => {
    const linhas = [recebida("Oi, sou a dona. O que você queria?", 1_200_000), recebida(MENU, 2_000), campanha];
    expect(decisaoDoTurno(linhas, 1, campanha.created_at)).toBe("atender");
    expect(ehPrimeiraRespostaAoEnvio(linhas, campanha.created_at)).toBe(true);
  });

  test("23. pessoa com texto longo em 60 s: silêncio (o risco aceito da opção B)", () => {
    expect(LONGO.length).toBeGreaterThanOrEqual(80);
    expect(decisaoDoTurno([recebida(LONGO, 60_000), campanha], 1, campanha.created_at)).toBe("silenciar");
    // Depois da janela, o mesmo texto é atendido.
    expect(decisaoDoTurno([recebida(LONGO, JANELA_PRIMEIRA_RESPOSTA_MS + 1_000), campanha], 1, campanha.created_at)).toBe("atender");
  });

  test("24. conversa que não é de campanha, com saudação automática: atende", () => {
    // `processTurn` só consulta a trava com origem de campanha; sem envio, a regra 1 não existe.
    const saudacao =
      "Olá! Seja bem vindo(a). Agradecemos sua mensagem. Não estamos disponíveis no momento, mas responderemos assim que possível.";
    expect(decisaoDoTurno([recebida(saudacao, 2_000)], 1, null)).toBe("atender");
  });

  test("a janela abre 5 s antes do envio e fecha em 120 s; uma mensagem nossa no meio a fecha", () => {
    expect(decisaoDoTurno([recebida(LONGO, -4_000), campanha], 1, campanha.created_at)).toBe("silenciar");
    expect(decisaoDoTurno([recebida(LONGO, JANELA_PRIMEIRA_RESPOSTA_MS), campanha], 1, campanha.created_at)).toBe("silenciar");
    const comResposta = [
      recebida(LONGO, 40_000),
      { user_message: null, bot_message: "Oi! Tudo bem?", created_at: iso(T + 30_000) },
      recebida("Oi", 5_000),
      campanha,
    ];
    expect(decisaoDoTurno(comResposta, 1, campanha.created_at)).toBe("atender");
  });

  test("cara de automação: 80 caracteres, link ou padrão", () => {
    expect(temCaraDeAutomacao("x".repeat(80))).toBe(true);
    expect(temCaraDeAutomacao("x".repeat(79))).toBe(false);
    expect(temCaraDeAutomacao("Peça aqui: pedido.anota.ai")).toBe(true);
    expect(temCaraDeAutomacao("https://calendar.app.google/abc")).toBe(true);
    expect(temCaraDeAutomacao("Seja bem vindo!")).toBe(true);
    expect(temCaraDeAutomacao("Faz sim")).toBe(false);
    expect(ehLoteDeRoboNaPrimeiraResposta([])).toBe(false);
  });
});

test.describe("Aviso de lead da campanha (texto do dono, 24/11/2026)", () => {
  test("empresa, mensagem e link numa linha", () => {
    expect(
      textoDoAvisoDeLeadDaCampanha({
        empresa: "Lolostore Cosmeticos",
        phone: "5500000000001@s.whatsapp.net",
        mensagem: " Faz sim ",
        abrir: "https://exemplo.test/inbox/x",
      })
    ).toBe('Lead da campanha respondeu: Lolostore Cosmeticos. Mensagem: "Faz sim". Abrir: https://exemplo.test/inbox/x');
  });

  test("sem nome, o número; sem link, a parte Abrir some; mensagem longa é cortada", () => {
    const t = textoDoAvisoDeLeadDaCampanha({ empresa: null, phone: "5500000000001", mensagem: "a".repeat(600), abrir: null });
    expect(t).not.toContain("Abrir");
    expect(t).toContain(`${"a".repeat(500)}..."`);
    expect(t).not.toContain("Lead da campanha respondeu: .");
  });
});
