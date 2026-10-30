import { test, expect } from "@playwright/test";
import {
  JANELA,
  LINHA_DE_SAIDA,
  OPCOES_PADRAO,
  PAUSA_MINUTOS,
  TETO_DIARIO,
  contagemPorSemana,
  diaDaSemanaSP,
  ehPedidoParaParar,
  faixaDaNota,
  faixaDaPontuacao,
  horaSP,
  podeEntrarNaCampanha,
  pontuarLead,
  problemasDaVariante,
  problemasParaIniciar,
  proximoEnvioEm,
  respostasDosEnvios,
  respostasPorEspera,
  resultadoDaCampanha,
  resultadoDasLinhas,
  resumoDaBase,
  resumoDasLinhas,
  serieDasLinhas,
  enviosPorDia,
  siteDoLead,
  telefoneDoLead,
  textoParaLead,
  tipoDoTelefone,
  varianteDaOrdem,
  type EnvioParaResultado,
  type LeadParaResumo,
  type LinhaDoResultado,
  type LinhaDoResumo,
  type OpcoesDaBusca,
} from "../lib/prospeccao";
import { entradaApify, itemDoApify, leituraDoStatus, webhooksDaExecucao } from "../lib/apify-campos";
import { filtrarPelasOpcoes, itemParaOBanco } from "../lib/fonte-de-leads";
import { filtroDe, opcoesDe, paginaDe, rascunhoDe, textoDe } from "../lib/campanhas-pedidos";
import { diaIsoSP, inicioDoDiaSP, somarDias } from "../lib/fuso";
import { dadosDeMentira } from "../app/design/campanhas/dados";

// CAMPANHAS, as regras puras (docs/plano-campanhas.md): a agenda de envio, o
// pedido para parar, quem pode entrar, a mensagem com a linha de saída, a leitura
// das respostas, os gêmeos do SQL (o formato longo dobrado nas MESMAS formas das
// contas em memória), a tradução da fonte Apify e os pedidos das rotas. Sem banco,
// sem tela e sem rede.

const MIN = 60_000;
const H = 60 * MIN;
// Quarta, 29/10/2026, 10:00 em São Paulo.
const AGORA = Date.parse("2026-10-29T13:00:00Z");
const HOJE = diaIsoSP(AGORA);
const as = (dia: string, hora: number, min = 0) => inicioDoDiaSP(dia) + hora * H + min * MIN;

test.describe("Agenda de envio (proximoEnvioEm)", () => {
  test("espalha: o envio N do dia cai na faixa N da janela, nunca antes de agora mais a pausa mínima", () => {
    const faixa = ((JANELA.fimHora - JANELA.inicioHora) * H) / TETO_DIARIO;
    for (let n = 0; n < TETO_DIARIO; n++) {
      for (const sorteio of [0, 0.5, 0.999]) {
        const agora = as(HOJE, 7); // antes da janela: só a faixa decide
        const t = proximoEnvioEm(agora, n, { sorteio: () => sorteio });
        const inicio = as(HOJE, JANELA.inicioHora) + n * faixa;
        expect(t).toBeGreaterThanOrEqual(inicio);
        expect(t).toBeLessThan(inicio + faixa);
        expect(diaIsoSP(t)).toBe(HOJE);
      }
    }
    // Já dentro da janela: nunca antes de agora + 4 minutos (a pausa mínima).
    const agora = as(HOJE, 14, 30);
    const t = proximoEnvioEm(agora, 0, { sorteio: () => 0 });
    expect(t - agora).toBeGreaterThanOrEqual(PAUSA_MINUTOS[0] * MIN);
    expect(t - agora).toBeLessThanOrEqual(PAUSA_MINUTOS[1] * MIN);
  });

  test("cota do dia cheia ou janela fechada: a primeira faixa do próximo dia de envio, nunca domingo (D2)", () => {
    const cheia = proximoEnvioEm(as(HOJE, 11), TETO_DIARIO, { sorteio: () => 0 });
    expect(diaIsoSP(cheia)).toBe(somarDias(HOJE, 1));
    expect(horaSP(cheia)).toBe(JANELA.inicioHora);
    // Depois das 18h: amanhã.
    const tarde = proximoEnvioEm(as(HOJE, 17, 58), 3, { sorteio: () => 0.9 });
    expect(diaIsoSP(tarde)).toBe(somarDias(HOJE, 1));
    // Sábado cheio vai para segunda (domingo fora da janela).
    const sabado = "2026-10-31";
    expect(diaDaSemanaSP(as(sabado, 12))).toBe(6);
    const segunda = proximoEnvioEm(as(sabado, 12), TETO_DIARIO, { sorteio: () => 0 });
    expect(diaIsoSP(segunda)).toBe("2026-11-02");
    expect(diaDaSemanaSP(segunda)).toBe(1);
    // Domingo: o primeiro envio já cai na segunda às 8h.
    const domingo = proximoEnvioEm(as("2026-11-01", 10), 0, { sorteio: () => 0 });
    expect(diaIsoSP(domingo)).toBe("2026-11-02");
    expect(horaSP(domingo)).toBe(8);
  });

  test("10 por dia: um dia inteiro de envios fica dentro da janela, sem dois na mesma faixa", () => {
    let agora = as(HOJE, 8);
    const horas: number[] = [];
    for (let n = 0; n < TETO_DIARIO; n++) {
      agora = proximoEnvioEm(agora, n, { sorteio: () => 0.5 });
      horas.push(horaSP(agora));
    }
    expect(horas).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });
});

test.describe("Pedido para parar e quem pode entrar", () => {
  test("ehPedidoParaParar: as frases de D4, sem acento e sem caixa, por palavra inteira", () => {
    for (const s of ["SAIR", "sair", "Não quero", "nao quero, obrigado", "Pare de mandar", "parar", "me remove? REMOVER", "Não tenho interesse."]) {
      expect(ehPedidoParaParar(s), s).toBe(true);
    }
    for (const s of ["Oi, tudo bem?", "Quero saber o preço", "vou separar os documentos", "sairemos amanhã", "comparar preços", ""]) {
      expect(ehPedidoParaParar(s), s).toBe(false);
    }
    // A linha de saída manda responder uma palavra que a regra reconhece.
    expect(LINHA_DE_SAIDA).toContain("SAIR");
    expect(ehPedidoParaParar("SAIR")).toBe(true);
  });

  test("podeEntrarNaCampanha: nunca quem parou, sem celular ou descartado; quem já passou só de propósito", () => {
    const base = { telefone: "(33) 99999-0001", parouEm: null, marcacao: null, campanhas: 0 } as const;
    expect(podeEntrarNaCampanha(base)).toBe(true);
    expect(podeEntrarNaCampanha({ ...base, parouEm: AGORA })).toBe(false);
    expect(podeEntrarNaCampanha({ ...base, parouEm: AGORA }, true)).toBe(false);
    expect(podeEntrarNaCampanha({ ...base, telefone: "(33) 3333-0001" })).toBe(false);
    expect(podeEntrarNaCampanha({ ...base, telefone: null })).toBe(false);
    expect(podeEntrarNaCampanha({ ...base, marcacao: "descartado" })).toBe(false);
    expect(podeEntrarNaCampanha({ ...base, marcacao: "bom" })).toBe(true);
    expect(podeEntrarNaCampanha({ ...base, campanhas: 1 })).toBe(false);
    expect(podeEntrarNaCampanha({ ...base, campanhas: 1 }, true)).toBe(true);
  });

  test("telefone: celular vira a chave 55 + DDD + número; fixo e inválido ficam sem chave", () => {
    expect(tipoDoTelefone("+55 33 99999-0001")).toBe("celular");
    expect(telefoneDoLead("+55 33 99999-0001")).toBe("5533999990001");
    expect(telefoneDoLead("(33) 99999-0001")).toBe("5533999990001");
    expect(tipoDoTelefone("(33) 3333-0001")).toBe("fixo");
    expect(telefoneDoLead("(33) 3333-0001")).toBeNull();
    expect(tipoDoTelefone("0800 123 4567")).toBe("invalido");
  });
});

test.describe("A mensagem", () => {
  test("textoParaLead troca {empresa} e põe a linha de saída no fim, sempre", () => {
    const t = textoParaLead("Oi, aqui é da OBS. Vi a {empresa} no Google.   ", "  Clínica Bela ");
    expect(t).toBe(`Oi, aqui é da OBS. Vi a Clínica Bela no Google.\n\n${LINHA_DE_SAIDA}`);
    expect(t.endsWith(LINHA_DE_SAIDA)).toBe(true);
  });

  test("problemasDaVariante: vazia, sem {empresa} ou com campo desconhecido trava", () => {
    expect(problemasDaVariante("  ")).toEqual(["A mensagem está vazia"]);
    expect(problemasDaVariante("Oi, tudo bem?")).toEqual(["Falta {empresa} no texto"]);
    expect(problemasDaVariante("Oi {nome}, vi a {empresa}")).toEqual(["Campo desconhecido: {nome}"]);
    expect(problemasDaVariante("Vi a {empresa}")).toEqual([]);
  });

  test("problemasParaIniciar repete no servidor o que trava o assistente", () => {
    const ok = { nome: "Estética", conexaoId: "x", agendadaPara: null, variantes: ["Vi a {empresa}"], agora: AGORA };
    expect(problemasParaIniciar(ok)).toEqual([]);
    expect(problemasParaIniciar({ ...ok, nome: " " })).toContain("Falta o nome da campanha");
    expect(problemasParaIniciar({ ...ok, conexaoId: null })).toContain("Falta o número que envia");
    expect(problemasParaIniciar({ ...ok, agendadaPara: AGORA - H })).toContain("A data agendada já passou");
    expect(problemasParaIniciar({ ...ok, variantes: [] })).toContain("Falta a mensagem");
    expect(problemasParaIniciar({ ...ok, variantes: ["a {empresa}", "b {empresa}", "c {empresa}", "d {empresa}"] })).toContain(
      "No máximo 3 variantes",
    );
    expect(problemasParaIniciar({ ...ok, variantes: ["Vi a {empresa}", "sem campo"] })).toContain("Variante 2: Falta {empresa} no texto");
  });

  test("varianteDaOrdem reveza na ordem da fila", () => {
    expect([0, 1, 2, 3, 4, 5].map((o) => varianteDaOrdem(o, 3))).toEqual([0, 1, 2, 0, 1, 2]);
    expect(varianteDaOrdem(7, 1)).toBe(0);
    expect(varianteDaOrdem(3, 0)).toBe(0);
  });
});

test.describe("Respostas (respostasDosEnvios, o cron só lê chat_messages)", () => {
  const envio = (extra: Partial<Parameters<typeof respostasDosEnvios>[0][number]> = {}) => ({
    campanhaId: "c1",
    leadId: "l1",
    telefone: "5533999990001",
    situacao: "enviado" as const,
    enviadoEm: as(HOJE, 9),
    ...extra,
  });

  test("a primeira mensagem depois do envio é a resposta, com e sem o nono dígito", () => {
    const r = respostasDosEnvios(
      [envio()],
      [
        { telefone: "553399990001", texto: "Oi! Como funciona?", em: as(HOJE, 9, 30) },
        { telefone: "553399990001", texto: "quanto custa", em: as(HOJE, 9, 40) },
        // Antes do envio não conta.
        { telefone: "5533999990001", texto: "mensagem antiga", em: as(HOJE, 8) },
      ],
    );
    expect(r).toEqual([{ campanhaId: "c1", leadId: "l1", respondeuEm: as(HOJE, 9, 30) }]);
  });

  test("um pedido para parar marca parou; quem já respondeu só ganha o parou", () => {
    expect(
      respostasDosEnvios([envio()], [{ telefone: "5533999990001", texto: "SAIR", em: as(HOJE, 10) }]),
    ).toEqual([{ campanhaId: "c1", leadId: "l1", respondeuEm: as(HOJE, 10), parouEm: as(HOJE, 10) }]);
    expect(
      respostasDosEnvios(
        [envio({ situacao: "respondeu" })],
        [
          { telefone: "5533999990001", texto: "legal", em: as(HOJE, 10) },
          { telefone: "5533999990001", texto: "pensando bem, não tenho interesse", em: as(HOJE, 11) },
        ],
      ),
    ).toEqual([{ campanhaId: "c1", leadId: "l1", parouEm: as(HOJE, 11) }]);
    // Respondeu sem pedir para parar e já estava "respondeu": nada a gravar.
    expect(respostasDosEnvios([envio({ situacao: "respondeu" })], [{ telefone: "5533999990001", texto: "ok", em: as(HOJE, 10) }])).toEqual([]);
  });

  test("a resposta conta só até o próximo envio ao mesmo lead (a segunda chance fica com a dela)", () => {
    const primeira = envio({ campanhaId: "c1", enviadoEm: as("2026-10-20", 9) });
    const segunda = envio({ campanhaId: "c2", enviadoEm: as(HOJE, 9) });
    const r = respostasDosEnvios([primeira, segunda], [{ telefone: "5533999990001", texto: "opa", em: as(HOJE, 9, 5) }]);
    expect(r).toEqual([{ campanhaId: "c2", leadId: "l1", respondeuEm: as(HOJE, 9, 5) }]);
  });

  test("outro telefone e mensagem vazia não contam", () => {
    expect(
      respostasDosEnvios(
        [envio()],
        [
          { telefone: "5533999990002", texto: "oi", em: as(HOJE, 10) },
          { telefone: "5533999990001", texto: "   ", em: as(HOJE, 10) },
        ],
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Os gêmeos do SQL: as linhas que `prospeccao_resultados` e
// `prospeccao_resumo_da_base` devolvem (montadas aqui com a MESMA regra do SQL)
// dobradas pelo app dão exatamente a conta em memória do preview.
// ---------------------------------------------------------------------------

function linhasDoResultadoComoOSql(envios: EnvioParaResultado[], serieDe: string, dias: number): LinhaDoResultado[] {
  const linhas: LinhaDoResultado[] = [];
  const conta = (dimensao: string, chave: number, n: number | null, enviados: number | null, responderam: number | null) =>
    linhas.push({ dimensao, chave, n, enviados, responderam });
  const saidos = envios.filter((e) => e.enviadoEm !== null);
  const resp = (l: EnvioParaResultado[]) => l.filter((e) => e.respondeuEm !== null).length;
  conta("total", 0, envios.length, null, null);
  conta("na_fila", 0, envios.filter((e) => e.situacao === "na_fila").length, null, null);
  conta("falharam", 0, envios.filter((e) => e.situacao === "falhou").length, null, null);
  conta("pararam", 0, envios.filter((e) => e.situacao === "parou").length, null, null);
  conta("enviados", 0, null, saidos.length, resp(saidos));
  const agrupar = (dimensao: string, chave: (e: EnvioParaResultado) => number | null, de = saidos) => {
    const m = new Map<number, EnvioParaResultado[]>();
    for (const e of de) {
      const k = chave(e);
      if (k !== null) m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  };
  for (const [k, l] of agrupar("variante", (e) => e.variante)) conta("variante", k, null, l.length, resp(l));
  for (const [k, l] of agrupar("hora_envio", (e) => horaSP(e.enviadoEm as number))) conta("hora_envio", k, null, l.length, resp(l));
  for (const [k, l] of agrupar("dia_semana", (e) => diaDaSemanaSP(e.enviadoEm as number))) conta("dia_semana", k, null, l.length, resp(l));
  const responderam = saidos.filter((e) => e.respondeuEm !== null);
  for (const [k, l] of agrupar("hora_resposta", (e) => horaSP(e.respondeuEm as number), responderam)) conta("hora_resposta", k, l.length, null, null);
  const espera = (e: EnvioParaResultado) => ((e.respondeuEm as number) - (e.enviadoEm as number)) / MIN;
  for (const [k, l] of agrupar("espera", (e) => (espera(e) < 15 ? 0 : espera(e) < 60 ? 1 : espera(e) < 180 ? 2 : 3), responderam))
    conta("espera", k, l.length, null, null);
  if (responderam.length > 0) {
    // percentile_cont(0.5) sobre os minutos já arredondados, arredondado no fim.
    const v = responderam.map((e) => Math.max(0, Math.round(espera(e)))).sort((a, b) => a - b);
    const m = Math.floor(v.length / 2);
    conta("mediana", 0, Math.round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2), null, null);
  }
  const fim = somarDias(serieDe, dias);
  for (const [k, l] of agrupar("dia", (e) => {
    const d = diaIsoSP(e.enviadoEm as number);
    return d >= serieDe && d < fim ? Math.round((inicioDoDiaSP(d) - inicioDoDiaSP(serieDe)) / (24 * H)) : null;
  }))
    conta("dia", k, null, l.length, resp(l));
  return linhas;
}

test.describe("Gêmeos do SQL (resultadoDasLinhas, serieDasLinhas, resumoDasLinhas)", () => {
  const dados = dadosDeMentira(AGORA, false);

  test("cada campanha do preview: as linhas no formato do SQL dobram no MESMO resultado da conta em memória", () => {
    for (const c of dados.campanhas) {
      const quantas = Math.max(1, c.variantes.length);
      const linhas = linhasDoResultadoComoOSql(c.envios, somarDias(HOJE, -13), 14);
      const { resultado, espera } = resultadoDasLinhas(linhas, quantas);
      expect(resultado, c.nome).toEqual(resultadoDaCampanha(c.envios, quantas));
      expect(espera, c.nome).toEqual(respostasPorEspera(c.envios));
      expect(serieDasLinhas(linhas, somarDias(HOJE, -13), 14), c.nome).toEqual(enviosPorDia(c.envios, HOJE, 14));
    }
    // Todas juntas também.
    const todos = dados.campanhas.flatMap((c) => c.envios);
    expect(resultadoDasLinhas(linhasDoResultadoComoOSql(todos, HOJE, 1), 3).resultado).toEqual(resultadoDaCampanha(todos, 3));
  });

  test("sem nenhum envio: zeros, taxa nula (a tela diz \"sem envios\") e mediana nula", () => {
    const { resultado } = resultadoDasLinhas([], 2);
    expect(resultado).toEqual(resultadoDaCampanha([], 2));
    expect(resultado.taxa).toBeNull();
    expect(resultado.minutosAteResponder).toBeNull();
  });

  test("o resumo da base: as linhas do SQL dobram no MESMO resumoDaBase, e as semanas em contagemPorSemana", () => {
    const respondeu = new Set(dados.campanhas.flatMap((c) => c.envios.filter((e) => e.respondeuEm !== null).map((e) => e.leadId)));
    const leads: (LeadParaResumo & { criadoEm: number })[] = dados.leads.map((l, i) => ({
      ...l,
      campanhas: l.campanhaIds.length,
      respondeu: respondeu.has(l.id),
      criadoEm: AGORA - (i % 60) * 24 * H,
    }));
    const linhas: LinhaDoResumo[] = [];
    const total = (l: typeof leads) => {
      const pode = l.filter((x) => podeEntrarNaCampanha(x));
      return { n: l.length, aContatar: pode.length, contatados: l.filter((x) => x.campanhas > 0).length, responderam: l.filter((x) => x.respondeu).length };
    };
    const t = total(leads);
    linhas.push({ dimensao: "total", chave: "", ...t, soma: null });
    linhas.push({ dimensao: "com_celular", chave: "", n: leads.filter((l) => telefoneDoLead(l.telefone)).length, aContatar: null, contatados: null, responderam: null, soma: null });
    linhas.push({ dimensao: "bons", chave: "", n: leads.filter((l) => l.marcacao === "bom").length, aContatar: null, contatados: null, responderam: null, soma: null });
    const grupo = (dimensao: string, chave: (l: (typeof leads)[number]) => string, comContas = true) => {
      const m = new Map<string, typeof leads>();
      for (const l of leads) m.set(chave(l), [...(m.get(chave(l)) ?? []), l]);
      for (const [k, l] of m) {
        const g = total(l);
        linhas.push(comContas ? { dimensao, chave: k, ...g, soma: null } : { dimensao, chave: k, n: g.n, aContatar: null, contatados: null, responderam: null, soma: null });
      }
    };
    grupo("cidade", (l) => l.cidade);
    grupo("segmento", (l) => l.segmento || "Sem segmento");
    grupo("bairro", (l) => l.bairro || "Sem bairro");
    grupo("telefone", (l) => (l.telefone && tipoDoTelefone(l.telefone) !== "invalido" ? tipoDoTelefone(l.telefone) : "sem"), false);
    grupo("site", (l) => siteDoLead(l.site), false);
    grupo("faixa", (l) => faixaDaPontuacao(pontuarLead(l).pontos), false);
    grupo("nota", (l) => faixaDaNota(l.nota), false);
    const notas = leads.filter((l) => l.nota !== null);
    linhas.push({ dimensao: "nota_media", chave: "", n: notas.length, aContatar: null, contatados: null, responderam: null, soma: notas.reduce((a, l) => a + (l.nota as number), 0) });
    // As semanas pela fórmula do SQL: semanas - 1 - floor((hoje - dia) / 7).
    for (const l of leads) {
      const dias = Math.round((inicioDoDiaSP(HOJE) - inicioDoDiaSP(diaIsoSP(l.criadoEm))) / (24 * H));
      const i = 8 - 1 - Math.floor(dias / 7);
      if (i < 0) continue;
      const linha = linhas.find((x) => x.dimensao === "novos_semana" && x.chave === String(i));
      if (linha) linha.n++;
      else linhas.push({ dimensao: "novos_semana", chave: String(i), n: 1, aContatar: null, contatados: null, responderam: null, soma: null });
    }
    const dobrado = resumoDasLinhas(linhas, HOJE, 8, 14);
    expect(dobrado.resumo).toEqual(resumoDaBase(leads));
    expect(dobrado.novosPorSemana).toEqual(contagemPorSemana(leads.map((l) => l.criadoEm), AGORA, 8));
    expect(dobrado.respostasPorDia).toHaveLength(14);
    expect(dobrado.respostasPorDia[13].dia).toBe(HOJE);
  });
});

test.describe("Fonte Apify (lib/apify-campos.ts) e o filtro do nosso lado", () => {
  const opcoes: OpcoesDaBusca = { ...OPCOES_PADRAO, termos: ["clínica de estética", " estética "], cidade: "Mutum", uf: "MG", notaMinima: 4.5, site: "sem_site" };

  test("a entrada do actor: termos aparados, cidade com o estado, teto por termo e os filtros", () => {
    expect(entradaApify(opcoes)).toEqual({
      searchStringsArray: ["clínica de estética", "estética"],
      locationQuery: "Mutum, MG, Brasil",
      maxCrawledPlacesPerSearch: 50,
      language: "pt-BR",
      skipClosedPlaces: true,
      scrapeContacts: false,
      website: "withoutWebsite",
      placeMinimumStars: "fourAndHalf",
    });
    expect(entradaApify({ ...opcoes, notaMinima: null, site: "todos" })).not.toHaveProperty("placeMinimumStars");
  });

  test("o webhook da execução: vai em base64 na query, com o segredo num header e nunca na URL", () => {
    const b64 = webhooksDaExecucao("https://exemplo.test/api/prospeccao/apify?busca=abc", "segredo-de-teste");
    const def = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    expect(def).toHaveLength(1);
    expect(def[0].requestUrl).toBe("https://exemplo.test/api/prospeccao/apify?busca=abc");
    expect(def[0].requestUrl).not.toContain("segredo");
    expect(JSON.parse(def[0].headersTemplate)).toEqual({ "x-apify-secret": "segredo-de-teste" });
    expect(def[0].eventTypes).toContain("ACTOR.RUN.SUCCEEDED");
    expect(def[0].eventTypes).toContain("ACTOR.RUN.FAILED");
  });

  test("um lugar do dataset vira lead: telefone, site, nota, pontos e fechado", () => {
    const item = itemDoApify(
      {
        title: "Clínica Bela",
        categoryName: "Clínica de estética",
        address: "Rua A, 10, Centro, Mutum - MG",
        neighborhood: "Centro",
        city: "Mutum",
        phone: "(33) 99999-0001",
        phoneUnformatted: "+5533999990001",
        website: "https://instagram.com/clinicabela",
        totalScore: 4.86,
        reviewsCount: 212,
        placeId: "ChIJ-teste",
        permanentlyClosed: false,
      },
      "estética",
    );
    expect(item).toMatchObject({
      telefone: "5533999990001",
      telefone_original: "+5533999990001",
      tipo_telefone: "celular",
      fonte_id: "ChIJ-teste",
      nome: "Clínica Bela",
      segmento: "Clínica de estética",
      bairro: "Centro",
      cidade: "Mutum",
      site_classe: "so_rede_social",
      nota: 4.9,
      avaliacoes: 212,
      fechado: false,
    });
    expect(item.pontuacao).toBe(100);
    // Lixo não quebra: vira um lead sem nada, que nunca entra em campanha.
    expect(itemDoApify(null, "barbearia")).toMatchObject({ nome: "Sem nome", segmento: "barbearia", telefone: null, nota: null });
    expect(itemDoApify({ title: "X", totalScore: 0, phone: "(33) 3333-0001" }, "x")).toMatchObject({ nota: null, telefone: null, tipo_telefone: "fixo" });
    // O que vai ao banco não leva o campo "fechado".
    expect(itemParaOBanco(item)).not.toHaveProperty("fechado");
  });

  test("filtrarPelasOpcoes aplica nota, site e fechadas do nosso lado e tira os repetidos", () => {
    const base = itemDoApify({ title: "A", phone: "+5533999990001", totalScore: 4.8, placeId: "p1" }, "x");
    const itens = [
      base,
      { ...base, fonte_id: "p2" }, // mesmo celular
      { ...itemDoApify({ title: "B", phone: "+5533999990002", totalScore: 4.1, placeId: "p3" }, "x") }, // nota baixa
      { ...itemDoApify({ title: "C", phone: "+5533999990003", totalScore: 4.9, placeId: "p4", website: "c.com.br" }, "x") }, // tem site
      { ...itemDoApify({ title: "D", phone: "+5533999990004", totalScore: 4.9, placeId: "p5", permanentlyClosed: true }, "x") }, // fechado
    ];
    expect(filtrarPelasOpcoes(itens, opcoes).map((i) => i.nome)).toEqual(["A"]);
    expect(filtrarPelasOpcoes(itens, { ...opcoes, notaMinima: null, site: "todos", ignorarFechados: false }).map((i) => i.nome)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  test("leituraDoStatus: rodando espera, terminado bem lê o dataset, o resto falha com uma frase", () => {
    expect(leituraDoStatus("RUNNING")).toEqual({ situacao: "rodando" });
    expect(leituraDoStatus("READY")).toEqual({ situacao: "rodando" });
    expect(leituraDoStatus("SUCCEEDED")).toBeNull();
    expect(leituraDoStatus("TIMED-OUT")).toMatchObject({ situacao: "falhou" });
    expect(leituraDoStatus("FAILED")).toMatchObject({ situacao: "falhou" });
    expect(leituraDoStatus(undefined)).toMatchObject({ situacao: "falhou" });
  });
});

test.describe("Pedidos das rotas (lib/campanhas-pedidos.ts): o que não confere é 400", () => {
  test("página, texto e opções da busca", () => {
    expect(paginaDe(null)).toBe(1);
    expect(paginaDe("3")).toBe(3);
    expect(paginaDe("0")).toBeNull();
    expect(paginaDe("1.5")).toBeNull();
    expect(paginaDe("abc")).toBeNull();
    expect(textoDe("  x ".repeat(80)).length).toBeLessThanOrEqual(100);
    const ok = { ...OPCOES_PADRAO, termos: ["dentista"], cidade: "Manhuaçu", uf: "MG" };
    expect(opcoesDe(ok)).toEqual(ok);
    expect(opcoesDe({ ...ok, uf: "XX" })).toBeNull();
    expect(opcoesDe({ ...ok, porTermo: 5000 })).toBeNull();
    expect(opcoesDe({ ...ok, notaMinima: 2 })).toBeNull();
    expect(opcoesDe({ ...ok, termos: [] })).toBeNull();
    expect(opcoesDe("nada")).toBeNull();
  });

  test("o recorte e o rascunho: ids uuid, passo de 1 a 4, no máximo 3 variantes", () => {
    const id = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
    expect(filtroDe({ buscaId: "todas" })).toEqual({ buscaId: "todas", soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null });
    expect(filtroDe({ buscaId: id, quemNaoRespondeuDe: id, soMarcadosComoBons: true })).toMatchObject({ buscaId: id, quemNaoRespondeuDe: id, soMarcadosComoBons: true });
    expect(filtroDe({ buscaId: "b1" })).toBeNull();
    expect(filtroDe({ buscaId: "todas", quemNaoRespondeuDe: "c2" })).toBeNull();
    const r = { nome: "Estética", conexaoId: id, agendadaPara: null, filtro: { buscaId: "todas" }, passo: 2, variantes: ["Vi a {empresa}"] };
    expect(rascunhoDe(id, r)).toMatchObject({ id, nome: "Estética", passo: 2 });
    expect(rascunhoDe(id, { ...r, passo: 5 })).toBeNull();
    expect(rascunhoDe(id, { ...r, variantes: ["a", "b", "c", "d"] })).toBeNull();
    expect(rascunhoDe(id, { ...r, conexaoId: "obs" })).toBeNull();
    expect(rascunhoDe(id, { ...r, agendadaPara: "amanhã" })).toBeNull();
  });
});
