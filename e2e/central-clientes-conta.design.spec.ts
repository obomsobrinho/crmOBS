import fs from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { test, expect } from "@playwright/test";
import { accessState, atualizacaoDoEvento, type AccessKind, type BillingRow } from "../lib/billing";
import {
  FILTROS_DE_SITUACAO,
  alertasDaConta,
  situacaoDaConta,
  situacaoNoFiltro,
  type SituacaoChave,
} from "../lib/admin-alertas";
import { estadoDaIa } from "../lib/custo-ia";
import {
  ACOES_DA_CONTA,
  PARADAS_DO_APAGAR,
  PRAZOS_DO_TESTE,
  RESPOSTA_DO_SQL,
  SEM_EFEITOS,
  acoesDoFinanceiro,
  pendenciasDosEfeitos,
  respostaDoApagar,
  diasDigitados,
  financeiroDe,
  mascararId,
  nomeConfere,
  pedidoDeAcao,
  respostaDoSql,
  rotuloDaCobranca,
} from "../lib/admin-conta";
import {
  COLUNAS_DO_CLIENTE,
  LEITURA_DA_EXPORTACAO,
  TABELAS_DA_EXPORTACAO,
  TABELAS_DO_CLIENTE,
  TABELAS_MANTIDAS,
  celulaCsv,
  linhaCsv,
  nomeDoArquivo,
} from "../lib/admin-purga";
import { crc32, zipEmPartes } from "../lib/zip";

// A CENTRAL "CLIENTES", ENTREGA 2 (docs/plano-central-clientes.md): o tipo de
// acesso com vitalício e bloqueio manual, o webhook que não rebaixa um vitalício,
// a situação e os filtros que MAPEIAM do tipo, as ações da conta, a lista de tabelas do "Apagar de vez" contra o schema e o ZIP da
// exportação. Sem banco e sem tela.

const H = 3_600_000;
const D = 24 * H;
const AGORA = Date.parse("2026-10-14T18:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function conta(
  status: string,
  o: {
    trial?: number | null;
    grace?: number | null;
    vitalicio?: boolean;
    bloqueado?: boolean;
    desativada?: boolean;
  } = {}
): BillingRow {
  return {
    subscription_status: status,
    trial_ends_at: o.trial == null ? null : iso(AGORA + o.trial),
    grace_until: o.grace == null ? null : iso(AGORA + o.grace),
    vitalicio_desde: o.vitalicio ? iso(AGORA - 5 * D) : null,
    bloqueado_em: o.bloqueado ? iso(AGORA - D) : null,
    desativada_em: o.desativada ? iso(AGORA - 2 * D) : null,
  };
}

const acesso = (row: BillingRow) => accessState(row, new Date(AGORA));

/** Todos os estados gravados que o banco permite, mais um que o código não conhece. */
const TODAS_AS_CONTAS: BillingRow[] = [
  conta("active"),
  conta("trialing"),
  conta("trialing", { trial: 3 * D }),
  conta("trialing", { trial: -2 * D }),
  conta("past_due", { grace: 2 * D }),
  conta("past_due", { grace: -D }),
  conta("past_due"),
  conta("canceled"),
  conta("outra-coisa"),
];

test.describe("Tipo de acesso (accessState, lib/billing.ts)", () => {
  test("cada estado gravado tem o seu tipo, e o bloqueio de antes não mudou", () => {
    const esperado: [BillingRow, AccessKind, boolean][] = [
      [conta("active"), "ativo", false],
      [conta("trialing"), "em_teste", false],
      [conta("trialing", { trial: 3 * D }), "em_teste", false],
      [conta("trialing", { trial: -2 * D }), "teste_encerrado", true],
      [conta("past_due", { grace: 2 * D }), "carencia", false],
      [conta("past_due", { grace: -D }), "atrasado_bloqueado", true],
      [conta("past_due"), "atrasado_bloqueado", true],
      [conta("canceled"), "cancelado", true],
      [conta("outra-coisa"), "desconhecido", false],
    ];
    for (const [row, kind, bloqueia] of esperado) {
      const a = acesso(row);
      expect(a.kind, row.subscription_status).toBe(kind);
      expect(a.blocked, row.subscription_status).toBe(bloqueia);
    }
    // Os campos de antes, iguais: dias do teste, aviso, motivo e frase.
    expect(acesso(conta("trialing", { trial: 2.5 * D }))).toMatchObject({
      trialDaysLeft: 3,
      warn: "Seu teste gratuito termina em 3 dias.",
      reason: null,
    });
    expect(acesso(conta("trialing", { trial: -D }))).toMatchObject({ reason: "trial_expired", trialDaysLeft: 0 });
    expect(acesso(conta("past_due"))).toMatchObject({ reason: "past_due" });
    expect(acesso(conta("canceled"))).toMatchObject({ reason: "canceled" });
    expect(acesso(conta("outra-coisa")).warn).toBe("Não conseguimos confirmar o estado da sua assinatura.");
  });

  test("vitalício NUNCA é bloqueado: nem teste vencido, nem atraso, nem cancelamento, nem estado desconhecido", () => {
    for (const row of TODAS_AS_CONTAS) {
      const a = acesso({ ...row, vitalicio_desde: iso(AGORA - D) });
      expect(a.kind, row.subscription_status).toBe("vitalicio");
      expect(a.blocked).toBe(false);
      expect(a.warn).toBeNull();
      expect(a.reason).toBeNull();
    }
  });

  test("sem chave do beta (removida em 15/10/2026): teste vencido bloqueia e o bloqueio manual vale para todos", () => {
    expect(acesso(conta("trialing", { trial: -D }))).toMatchObject({ kind: "teste_encerrado", blocked: true });
    for (const row of TODAS_AS_CONTAS) {
      expect(acesso({ ...row, bloqueado_em: iso(AGORA) })).toMatchObject({
        kind: "bloqueado",
        blocked: true,
        reason: "bloqueio_manual",
      });
    }
    const billing = fs.readFileSync(path.join(process.cwd(), "lib/billing.ts"), "utf8");
    expect(billing).not.toContain("beta_aberto");
    expect(billing).not.toContain("betaAberto");
    expect(fs.existsSync(path.join(process.cwd(), "lib/beta.ts"))).toBe(false);
  });

  test("desativada vem antes de tudo: bloqueia mesmo vitalícia ou bloqueada", () => {
    for (const row of TODAS_AS_CONTAS) {
      for (const extra of [{}, { vitalicio_desde: iso(AGORA) }, { bloqueado_em: iso(AGORA) }]) {
        expect(acesso({ ...row, ...extra, desativada_em: iso(AGORA - D) })).toMatchObject({
          kind: "desativado",
          blocked: true,
          reason: "desativada",
        });
      }
    }
  });

  test("bloqueio manual vence o vitalício (é uma decisão explícita sobre UMA conta)", () => {
    expect(acesso(conta("active", { vitalicio: true, bloqueado: true })).kind).toBe("bloqueado");
  });
});

test.describe("Webhook do Asaas nunca rebaixa um vitalício (atualizacaoDoEvento)", () => {
  const EVENTOS = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED", "PAYMENT_DELETED", "OUTRO"];

  test("o mapa de eventos é o de antes", () => {
    const agora = new Date(AGORA);
    expect(atualizacaoDoEvento("PAYMENT_CONFIRMED", agora)).toEqual({
      subscription_status: "active",
      grace_until: null,
      trial_ends_at: null,
    });
    expect(atualizacaoDoEvento("PAYMENT_RECEIVED", agora)?.subscription_status).toBe("active");
    expect(atualizacaoDoEvento("PAYMENT_OVERDUE", agora)).toEqual({
      subscription_status: "past_due",
      grace_until: iso(AGORA + 5 * D),
    });
    expect(atualizacaoDoEvento("PAYMENT_REFUNDED", agora)).toEqual({
      subscription_status: "past_due",
      grace_until: null,
    });
    expect(atualizacaoDoEvento("PAYMENT_DELETED", agora)).toBeNull();
    expect(atualizacaoDoEvento("OUTRO", agora)).toBeNull();
  });

  test("o mapa é só evento para escrita; quem decide o vitalício é o webhook, antes de gravar", () => {
    // O mapa não sabe de vitalício (uma regra só, no chamador).
    expect(EVENTOS.filter((e) => atualizacaoDoEvento(e, new Date(AGORA)) !== null)).toEqual([
      "PAYMENT_CONFIRMED",
      "PAYMENT_RECEIVED",
      "PAYMENT_OVERDUE",
      "PAYMENT_REFUNDED",
    ]);
  });

  test("e mesmo que algo escreva o estado por baixo, o acesso continua vitalício", () => {
    for (const status of ["past_due", "canceled", "trialing"]) {
      expect(acesso(conta(status, { trial: -D, vitalicio: true })).blocked).toBe(false);
    }
  });

  test("o webhook usa a regra pura e confere o vitalício antes de gravar", () => {
    const fonte = fs.readFileSync(path.join(process.cwd(), "app/api/billing/webhook/route.ts"), "utf8");
    expect(fonte).toContain("atualizacaoDoEvento(evento, agora)");
    // As três buscas do tenant já trazem a marca (nenhuma leitura a mais).
    expect(fonte.split('.select("id, vitalicio_desde")').length - 1).toBe(3);
    expect(fonte).toMatch(/if \(tenant\?\.vitalicio_desde\) \{\s+erro = "ignorado: cliente vitalicio";\s+\} else if \(update\)/);
    expect(fonte).not.toMatch(/case "PAYMENT_/);
  });
});

test.describe("Situação, alertas e filtros mapeiam do tipo de acesso (lib/admin-alertas.ts)", () => {
  test("vitalício, bloqueado e desativado na tela", () => {
    expect(situacaoDaConta(conta("trialing", { trial: -9 * D, vitalicio: true }), AGORA)).toMatchObject({
      chave: "vitalicio",
      rotulo: "Vitalício",
      tom: "bom",
      kind: "vitalicio",
    });
    expect(situacaoDaConta(conta("active", { bloqueado: true }), AGORA)).toMatchObject({
      chave: "bloqueado",
      rotulo: "Bloqueado",
      tom: "perigo",
    });
    // Desativado vem antes de tudo (nada entra), inclusive do vitalício.
    expect(situacaoDaConta(conta("active", { vitalicio: true, desativada: true }), AGORA)).toMatchObject({
      chave: "desativado",
      rotulo: "Desativado",
      kind: "desativado",
    });
  });

  test("toda situação que a central mostra está em EXATAMENTE um filtro", () => {
    const vistas = new Set<SituacaoChave>();
    for (const row of TODAS_AS_CONTAS) {
      for (const extra of [{}, { vitalicio_desde: iso(AGORA) }, { bloqueado_em: iso(AGORA) }, { desativada_em: iso(AGORA) }]) {
        vistas.add(situacaoDaConta({ ...row, ...extra }, AGORA).chave);
      }
    }
    vistas.delete("desconhecido"); // o CHECK do banco não deixa outro status existir
    for (const s of vistas) {
      const filtros = FILTROS_DE_SITUACAO.filter((f) => situacaoNoFiltro(s, f.chave));
      expect(filtros.length, s).toBe(1);
    }
    expect(situacaoNoFiltro("teste_encerrado", "trialing")).toBe(true);
    expect(situacaoNoFiltro("vitalicio", "trialing")).toBe(false);
  });

  test("o filtro em SQL repete a precedência (desativado, bloqueado, vitalício, status)", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261015043128_central_clientes_financeiro_e_acoes.sql"),
      "utf8"
    );
    expect(sql).toContain("(v_sit = 'desativado' and c.desativada_em is not null)");
    expect(sql).toContain("(v_sit = 'bloqueado' and c.desativada_em is null and c.bloqueado_em is not null)");
    expect(sql).toMatch(/c\.desativada_em is null and c\.bloqueado_em is null and c\.vitalicio_desde is null\s+and c\.subscription_status = v_sit/);
  });

  test("pagamento atrasado alerta pelo tipo; vitalício e desativado não alertam pagamento", () => {
    const entrada = (c: BillingRow) => ({
      conta: c,
      estado: estadoDaIa({ publicada: true, ligada: true, consumo: "normal" }),
      publicada: true,
      temInstancia: true,
      ultimaAtividade: iso(AGORA - H),
      criadaEm: iso(AGORA - 60 * D),
      agora: AGORA,
    });
    expect(alertasDaConta(entrada(conta("past_due", { grace: D })))[0]).toMatchObject({ chave: "pagamento", tom: "aviso" });
    expect(alertasDaConta(entrada(conta("past_due")))[0]).toMatchObject({ chave: "pagamento", tom: "perigo" });
    expect(alertasDaConta(entrada(conta("past_due", { vitalicio: true })))).toEqual([]);
    // Desativada: a situação já diz tudo, nada mais pede atenção.
    expect(
      alertasDaConta({ ...entrada(conta("past_due", { desativada: true })), ultimaAtividade: iso(AGORA - 30 * D) })
    ).toEqual([]);
  });
});

test.describe("Ações da conta (lib/admin-conta.ts)", () => {
  test("o pedido da rota é validado: ação da lista, dias inteiros positivos, plano de PLANS", () => {
    expect(ACOES_DA_CONTA).toContain("vitalicio");
    expect(pedidoDeAcao({ acao: "vitalicio" })).toEqual({ acao: "vitalicio" });
    expect(pedidoDeAcao({ acao: "desativar" })).toEqual({ acao: "desativar" });
    expect(pedidoDeAcao({ acao: "apagar" })).toHaveProperty("erro");
    expect(pedidoDeAcao(null)).toHaveProperty("erro");
    expect(pedidoDeAcao({ acao: "estender_teste", dias: 7 })).toEqual({ acao: "estender_teste", dias: 7 });
    for (const dias of [0, -1, 1.5, "7", null, undefined, Number.NaN]) {
      expect(pedidoDeAcao({ acao: "estender_teste", dias })).toHaveProperty("erro");
    }
    expect(pedidoDeAcao({ acao: "mudar_plano", plano: "profissional" })).toEqual({ acao: "mudar_plano", plano: "profissional" });
    for (const plano of ["inventado", null, "", "toString"]) {
      expect(pedidoDeAcao({ acao: "mudar_plano", plano })).toHaveProperty("erro");
    }
    expect(diasDigitados("7")).toBe(7);
    expect(diasDigitados(" 30 ")).toBe(30);
    expect(diasDigitados("0")).toBeUndefined();
    expect(diasDigitados("2,5")).toBeUndefined();
    expect(diasDigitados("")).toBeUndefined();
  });

  test("toda resposta do SQL tem status e texto; desconhecida é 500, nunca sucesso", () => {
    expect(respostaDoSql("ok").status).toBe(200);
    expect(respostaDoSql("sem_mudanca").status).toBe(200);
    expect(respostaDoSql("tem_assinatura").status).toBe(409);
    expect(respostaDoSql("nao_desativado").status).toBe(409);
    expect(respostaDoSql("nome_diferente").status).toBe(400);
    expect(respostaDoSql("nao_encontrado").status).toBe(404);
    expect(respostaDoSql("inventado").status).toBe(500);
    expect(respostaDoSql(null).status).toBe(500);
    // Cada resposta que a função SQL devolve tem a sua tradução.
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261015043128_central_clientes_financeiro_e_acoes.sql"),
      "utf8"
    );
    const devolvidas = new Set([...sql.matchAll(/return '([a-z_]+)'/g)].map((m) => m[1]));
    for (const r of devolvidas) expect(respostaDoSql(r).status, r).not.toBe(500);
  });

  test("ids do gateway saem mascarados; plano fora de PLANS vira nulo", () => {
    expect(mascararId("sub_1234567abcd")).toBe("•••• abcd");
    expect(mascararId(null)).toBeNull();
    const f = financeiroDe({
      billing_plan: "avancado",
      billing_provider: "asaas",
      billing_customer_id: "cus_000000099999",
      billing_subscription_id: "sub_000000088888",
      billing_seats: 3,
      billing_updated_at: null,
    });
    expect(f).toMatchObject({ planoChave: "avancado", temAssinatura: true, assentosCobrados: 3 });
    expect(JSON.stringify(f)).not.toContain("000000099999");
    expect(JSON.stringify(f)).not.toContain("000000088888");
    const semPlano = financeiroDe({
      billing_plan: "inventado",
      billing_provider: null,
      billing_customer_id: null,
      billing_subscription_id: null,
      billing_seats: null,
      billing_updated_at: null,
    });
    expect(semPlano).toMatchObject({ planoChave: null, temAssinatura: false, clienteNoGateway: null });
    expect(rotuloDaCobranca("OVERDUE")).toBe("Vencida");
    expect(rotuloDaCobranca("ALGO_NOVO")).toBe("ALGO_NOVO");
  });

  test("o nome digitado confere só igual (espaços nas pontas não contam), como o SQL", () => {
    expect(nomeConfere("Barbearia do Zé", "Barbearia do Zé")).toBe(true);
    expect(nomeConfere("  Barbearia do Zé ", "Barbearia do Zé")).toBe(true);
    expect(nomeConfere("barbearia do zé", "Barbearia do Zé")).toBe(false);
    expect(nomeConfere("Barbearia", "Barbearia do Zé")).toBe(false);
    expect(nomeConfere("", "")).toBe(false);
  });
});

test.describe("Apagar de vez: a lista de tabelas contra o schema (lib/admin-purga.ts)", () => {
  /** As tabelas de `public` com `client_id` no Row, lidas do tipo gerado do banco. */
  function tabelasComClientId(): string[] {
    const tipos = fs.readFileSync(path.join(process.cwd(), "lib/database.types.ts"), "utf8").replace(/\r\n/g, "\n");
    const ini = tipos.indexOf("    Tables: {\n");
    const fim = tipos.indexOf("\n    Views: {", ini);
    const bloco = tipos.slice(ini, fim);
    const saida: string[] = [];
    for (const m of bloco.matchAll(/\n {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/g)) {
      if (/\n {10}client_id\??: /.test(`\n${m[2]}`)) saida.push(m[1]);
    }
    return saida.sort();
  }

  test("TODA tabela com client_id está na rotina (apagada ou mantida), e só elas", () => {
    const doSchema = tabelasComClientId();
    expect(doSchema.length).toBeGreaterThan(10);
    expect([...TABELAS_DO_CLIENTE, ...TABELAS_MANTIDAS].sort()).toEqual(doSchema);
    expect(new Set(TABELAS_DA_EXPORTACAO).size).toBe(TABELAS_DA_EXPORTACAO.length);
    expect([...TABELAS_DA_EXPORTACAO].sort()).toEqual(doSchema);
  });

  test("o histórico de cobrança fica (registro fiscal): mantido, com as colunas que guardam de quem era", () => {
    expect(TABELAS_MANTIDAS).toEqual(["billing_events"]);
    expect(TABELAS_DO_CLIENTE as readonly string[]).not.toContain("billing_events");
    const tipos = fs.readFileSync(path.join(process.cwd(), "lib/database.types.ts"), "utf8").replace(/\r\n/g, "\n");
    const linha = tipos.slice(tipos.indexOf("      billing_events: {"), tipos.indexOf("      chat_messages: {"));
    expect(linha).toContain("deleted_client_id: string | null");
    expect(linha).toContain("deleted_client_name: string | null");
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261015191433_apagar_de_vez_mantem_billing_events.sql"),
      "utf8"
    );
    expect(sql).toContain("tabela ao mesmo tempo apagada e mantida");
    expect(sql).toContain("k.confdeltype <> 'n'");
    expect(sql).toContain("p_mantidas text[] default '{}'::text[]");
    const rotina = fs.readFileSync(path.join(process.cwd(), "lib/admin.ts"), "utf8");
    expect(rotina).toContain("p_mantidas: mantidas");
    expect(rotina).toContain("p_tabelas: [...tabelas, ...mantidas]");
  });

  test("o registro do apagamento não tem client_id (sobrevive à purga)", () => {
    expect(tabelasComClientId()).not.toContain("admin_acoes");
  });

  test("a ordem respeita as chaves sem cascata (filhas antes das mães)", () => {
    const i = (t: string) => TABELAS_DO_CLIENTE.indexOf(t as (typeof TABELAS_DO_CLIENTE)[number]);
    expect(i("conversations")).toBeLessThan(i("pipeline_stages"));
    expect(i("knowledge_chunks")).toBeLessThan(i("knowledge_documents"));
    expect(i("conversation_tags")).toBeLessThan(i("conversations"));
    expect(i("conversation_tags")).toBeLessThan(i("tags"));
    expect(i("conversation_notes")).toBeLessThan(i("conversations"));
  });

  test("o SQL confere o catálogo antes de apagar, e a rotina confere antes de tocar no Asaas e no Storage", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261015191433_apagar_de_vez_mantem_billing_events.sql"),
      "utf8"
    );
    expect(sql).toContain("tabelas com client_id fora da rotina de apagar");
    expect(sql).toMatch(/if c\.desativada_em is null then\r?\n\s+return 'nao_desativado';/);
    const rotina = fs.readFileSync(path.join(process.cwd(), "lib/admin.ts"), "utf8");
    const ini = rotina.indexOf("export async function apagarCliente(");
    const corpo = rotina.slice(ini);
    const pos = (s: string) => corpo.indexOf(s);
    expect(pos("admin_tabelas_fora_da_purga")).toBeGreaterThan(0);
    expect(pos("admin_tabelas_fora_da_purga")).toBeLessThan(pos("deleteSubscription("));
    expect(pos("deleteSubscription(")).toBeLessThan(pos("admin_arquivos_do_cliente"));
    expect(pos("admin_arquivos_do_cliente")).toBeLessThan(pos("logoutInstance("));
    expect(pos("logoutInstance(")).toBeLessThan(pos("deleteInstance("));
    expect(pos("deleteInstance(")).toBeLessThan(pos('"admin_apagar_cliente"'));
    expect(pos('"admin_apagar_cliente"')).toBeLessThan(pos("deleteUser("));
    // Nunca apaga o login de um admin.
    expect(corpo).toContain("filter((u) => !ehAdminPeloAmbiente(u))");
  });
});

test.describe("Exportação: CSV e ZIP em fluxo", () => {
  test("o CRC-32 bate com o valor de conferência padrão", () => {
    // "123456789" -> 0xCBF43926 (o valor de verificação do CRC-32 do ZIP).
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  test("célula CSV: nulo vazio, objeto em JSON, aspas e vírgula entre aspas", () => {
    expect(celulaCsv(null)).toBe("");
    expect(celulaCsv(12)).toBe("12");
    expect(celulaCsv("a,b")).toBe('"a,b"');
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""');
    expect(celulaCsv("linha\nnova")).toBe('"linha\nnova"');
    expect(celulaCsv({ a: 1 })).toBe('"{""a"":1}"');
    expect(linhaCsv(["x", null, 2])).toBe("x,,2\r\n");
    expect(nomeDoArquivo("Clínica Sorriso & Cia")).toBe("clinica-sorriso-cia");
    expect(nomeDoArquivo("***")).toBe("cliente");
  });

  test("o ZIP abre: um arquivo por entrada, nomes, conteúdo e CRC conferem", async () => {
    const grande = "id,texto\r\n" + Array.from({ length: 3000 }, (_, i) => `${i},linha número ${i}\r\n`).join("");
    async function* partes(): AsyncGenerator<string> {
      // Em pedaços, como os lotes da exportação.
      for (let i = 0; i < grande.length; i += 7000) yield grande.slice(i, i + 7000);
    }
    const pedacos: Uint8Array[] = [];
    for await (const p of zipEmPartes(
      [
        { nome: "cliente.csv", partes: ["a,b\r\n", "1,2\r\n"] },
        { nome: "chat_messages.csv", partes: partes() },
        { nome: "vazio.csv", partes: [] },
      ],
      new Date(AGORA)
    )) {
      pedacos.push(p);
    }
    const zip = Buffer.concat(pedacos);
    // Fim do diretório central.
    const fimDir = zip.length - 22;
    expect(zip.readUInt32LE(fimDir)).toBe(0x06054b50);
    const total = zip.readUInt16LE(fimDir + 10);
    let pos = zip.readUInt32LE(fimDir + 16);
    expect(total).toBe(3);
    const lidos: Record<string, string> = {};
    for (let i = 0; i < total; i++) {
      expect(zip.readUInt32LE(pos)).toBe(0x02014b50);
      const crc = zip.readUInt32LE(pos + 16);
      const comp = zip.readUInt32LE(pos + 20);
      const tam = zip.readUInt32LE(pos + 24);
      const nLen = zip.readUInt16LE(pos + 28);
      const local = zip.readUInt32LE(pos + 42);
      const nome = zip.subarray(pos + 46, pos + 46 + nLen).toString("utf8");
      expect(zip.readUInt32LE(local)).toBe(0x04034b50);
      const ini = local + 30 + zip.readUInt16LE(local + 26);
      const dados = inflateRawSync(zip.subarray(ini, ini + comp));
      expect(dados.length).toBe(tam);
      expect(crc32(dados)).toBe(crc);
      lidos[nome] = dados.toString("utf8");
      pos += 46 + nLen;
    }
    expect(lidos["cliente.csv"]).toBe("a,b\r\n1,2\r\n");
    expect(lidos["chat_messages.csv"]).toBe(grande);
    expect(lidos["vazio.csv"]).toBe("");
  });
});

test.describe("Desativar barra o login no servidor (páginas, rotas e IA)", () => {
  const ler = (arq: string) => fs.readFileSync(path.join(process.cwd(), arq), "utf8");

  test("a rota de sessão, o layout do app, as páginas fora dele e o turno da IA conferem a desativação", () => {
    expect(ler("lib/rota.ts")).toMatch(/if \(mine\.contaDesativada\) \{\s+return \{ erro: NextResponse\.json\(\{ error: "conta desativada" \}, \{ status: 403 \}\) \};/);
    expect(ler("lib/auth.ts")).toContain('contaDesativada: access.kind === "desativado" && !ehAdminPeloAmbiente(userId)');
    expect(ler("lib/auth.ts")).toMatch(/barrarContaDesativada\(client\);\s+if \(client\.access\.blocked\)/);
    expect(ler("app/(app)/layout.tsx")).toContain("barrarContaDesativada(client);");
    // O turno silencia ANTES do número de avisos, da assinatura e do modelo.
    const turno = ler("lib/agent-turn.ts");
    const gate = turno.indexOf('if (access.kind === "desativado")');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(turno.indexOf("ehNumeroDeAvisos(phone, avisos)"));
    // Nenhuma leitura solta da coluna: a regra é do accessState.
    expect(turno).not.toContain("if (client.desativada_em)");
  });

  test("toda página fora de app/(app) que lê a sessão do tenant barra a conta desativada", () => {
    const raiz = path.join(process.cwd(), "app");
    const paginas: string[] = [];
    const andar = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (["(app)", "design", "api", "conta-desativada"].includes(e.name)) continue;
          andar(p);
        } else if (/^(page|layout)\.tsx$/.test(e.name)) paginas.push(p);
      }
    };
    andar(raiz);
    const comSessao = paginas.filter((p) => /getMyClient\(\)|requireActiveTenant\(\)/.test(fs.readFileSync(p, "utf8")));
    expect(comSessao.length).toBeGreaterThan(2);
    for (const p of comSessao) {
      const f = fs.readFileSync(p, "utf8");
      expect(/barrarContaDesativada\(|requireActiveTenant\(\)/.test(f), path.relative(process.cwd(), p)).toBe(true);
    }
  });
});

test.describe("Aba Financeiro: o que pode e por que não (acoesDoFinanceiro)", () => {
  const fin = (temAssinatura: boolean) => ({ temAssinatura });

  test("cada recusa é uma resposta do SQL (409), na mesma ordem de admin_mudar_conta", () => {
    const casos: [BillingRow, boolean][] = [];
    for (const row of TODAS_AS_CONTAS) {
      for (const extra of [{}, { vitalicio_desde: iso(AGORA) }, { bloqueado_em: iso(AGORA) }]) {
        for (const assinatura of [false, true]) casos.push([{ ...row, ...extra }, assinatura]);
      }
    }
    for (const [row, assinatura] of casos) {
      const a = acoesDoFinanceiro(row, fin(assinatura));
      const t = a.estenderTeste;
      for (const acao of [a.vitalicio, t.dias, ...(t.vitalicio ? [t.vitalicio] : []), a.mudarPlano, a.bloqueio]) {
        expect(ACOES_DA_CONTA).toContain(acao.acao);
        if (acao.recusa) expect(RESPOSTA_DO_SQL[acao.recusa]?.status, acao.recusa).toBe(409);
      }
    }
  });

  test("vitalício, teste, plano e bloqueio", () => {
    const vit = acoesDoFinanceiro(conta("trialing", { trial: D, vitalicio: true }), fin(false));
    expect(vit.vitalicio).toEqual({ acao: "remover_vitalicio", recusa: null });
    expect(vit.estenderTeste.recusa).toBe("vitalicio");
    expect(vit.estenderTeste.vitalicio).toBeNull();
    expect(acoesDoFinanceiro(conta("active"), fin(true)).vitalicio).toEqual({ acao: "vitalicio", recusa: "tem_assinatura" });
    expect(acoesDoFinanceiro(conta("active"), fin(true)).mudarPlano.recusa).toBe("tem_assinatura");
    expect(acoesDoFinanceiro(conta("active"), fin(false)).mudarPlano.recusa).toBeNull();
    expect(acoesDoFinanceiro(conta("active"), fin(false)).estenderTeste.dias.recusa).toBe("nao_em_teste");
    expect(acoesDoFinanceiro(conta("trialing"), fin(false)).estenderTeste.dias.recusa).toBe("sem_prazo");
    expect(acoesDoFinanceiro(conta("trialing", { trial: -D }), fin(false)).estenderTeste.dias.recusa).toBeNull();
    expect(acoesDoFinanceiro(conta("trialing", { trial: -D }), fin(false)).estenderTeste.recusa).toBeNull();
  });

  test("Estender teste é UM controle: 7 dias, 15 dias, Personalizado e Vitalício", () => {
    expect(PRAZOS_DO_TESTE).toEqual([7, 15]);
    for (const n of PRAZOS_DO_TESTE) expect(diasDigitados(String(n))).toBe(n);
    // Sem teste a estender, o controle segue aberto pelo Vitalício.
    const ativo = acoesDoFinanceiro(conta("active"), fin(false)).estenderTeste;
    expect(ativo.dias.recusa).toBe("nao_em_teste");
    expect(ativo.vitalicio).toEqual({ acao: "vitalicio", recusa: null });
    expect(ativo.recusa).toBeNull();
    // Com assinatura no Asaas, o Vitalício é recusado como antes; sem teste, o controle trava pelos dias.
    const comAssinatura = acoesDoFinanceiro(conta("past_due", { grace: D }), fin(true)).estenderTeste;
    expect(comAssinatura.vitalicio).toEqual({ acao: "vitalicio", recusa: "tem_assinatura" });
    expect(comAssinatura.recusa).toBe("nao_em_teste");
    // Em teste e com assinatura: os dias passam, o Vitalício não.
    const emTeste = acoesDoFinanceiro(conta("trialing", { trial: D }), fin(true)).estenderTeste;
    expect(emTeste.dias.recusa).toBeNull();
    expect(emTeste.vitalicio?.recusa).toBe("tem_assinatura");
    expect(emTeste.recusa).toBeNull();
    expect(acoesDoFinanceiro(conta("active", { bloqueado: true }), fin(false)).bloqueio.acao).toBe("liberar");
    expect(acoesDoFinanceiro(conta("active"), fin(false)).bloqueio.acao).toBe("bloquear");
  });

  test("as paradas do apagar ficam ao lado das respostas do SQL", () => {
    for (const k of Object.keys(PARADAS_DO_APAGAR)) expect(respostaDoApagar(k)).toBe(PARADAS_DO_APAGAR[k]);
    expect(respostaDoApagar("nome_diferente").status).toBe(400);
    expect(respostaDoApagar("inventado").status).toBe(500);
  });
});

test.describe("Exportação: nada some em silêncio", () => {
  const tipos = () => fs.readFileSync(path.join(process.cwd(), "lib/database.types.ts"), "utf8").replace(/\r\n/g, "\n");
  /** As colunas do Row de uma tabela em lib/database.types.ts. */
  function colunasDe(tabela: string): string[] {
    const t = tipos();
    const m = t.match(new RegExp(String.raw`\n {6}${tabela}: \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}`));
    expect(m, tabela).not.toBeNull();
    return [...(m?.[1] ?? "").matchAll(/^ {10}(\w+):/gm)].map((x) => x[1]).sort();
  }

  test("cliente.csv leva TODAS as colunas de clients", () => {
    expect(COLUNAS_DO_CLIENTE.split(",").map((c) => c.trim()).sort()).toEqual(colunasDe("clients"));
  });

  test("a ordem de leitura de cada tabela usa colunas que existem, a última o id", () => {
    for (const [tabela, leitura] of Object.entries(LEITURA_DA_EXPORTACAO)) {
      if (!leitura?.ordem) continue;
      const cols = colunasDe(tabela);
      for (const c of leitura.ordem) expect(cols, `${tabela}.${c}`).toContain(c);
      expect(leitura.ordem[leitura.ordem.length - 1]).toBe("id");
    }
    expect(LEITURA_DA_EXPORTACAO.knowledge_chunks?.lote).toBe(200);
  });
});

test.describe("Toda rota com a sessão do usuário passa por sessaoDaRota (conta desativada: 403)", () => {
  test("nenhuma rota lê a sessão por fora", () => {
    const raiz = path.join(process.cwd(), "app/api");
    const rotas: string[] = [];
    const andar = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) andar(p);
        else if (e.name === "route.ts") rotas.push(p);
      }
    };
    andar(raiz);
    expect(rotas.length).toBeGreaterThan(20);
    for (const arq of rotas) {
      const f = fs.readFileSync(arq, "utf8");
      const nome = path.relative(process.cwd(), arq);
      // Quem importa getMyClient ou o cliente de sessão do servidor tem de usar a guarda.
      expect(/import[^;]*\bgetMyClient\b/.test(f), nome).toBe(false);
      if (/from "@\/lib\/supabase\/server"/.test(f)) expect(/sessaoDaRota|rotaDoAdmin/.test(f), nome).toBe(true);
    }
    const fotos = fs.readFileSync(path.join(process.cwd(), "app/api/fotos/[...path]/route.ts"), "utf8");
    expect(fotos).toContain("await sessaoDaRota()");
  });
});

test.describe("Apagar de vez: uma parada depois de efeitos externos diz o que já foi feito", () => {
  test("pendenciasDosEfeitos: cada efeito vira uma linha; sem efeito, nenhuma", () => {
    expect(pendenciasDosEfeitos(SEM_EFEITOS)).toEqual([]);
    expect(
      pendenciasDosEfeitos({ assinaturaCancelada: true, arquivosRemovidos: 3, whatsappDesconectado: true, instanciaApagada: false })
    ).toEqual([
      "A assinatura já foi cancelada no Asaas.",
      "3 arquivos já foram removidos do Storage.",
      "O WhatsApp já foi desconectado na Evolution.",
    ]);
    // A instância apagada já inclui a sessão derrubada: uma linha só.
    expect(pendenciasDosEfeitos({ ...SEM_EFEITOS, whatsappDesconectado: true, instanciaApagada: true })).toEqual([
      "A instância do WhatsApp já foi apagada na Evolution.",
    ]);
    expect(pendenciasDosEfeitos({ ...SEM_EFEITOS, arquivosRemovidos: 1 })).toEqual(["1 arquivo já foi removido do Storage."]);
    expect(respostaDoApagar("falha_banco").status).toBe(500);
  });

  test("depois do primeiro efeito, toda parada e todo erro passam por parar() (que soma os efeitos e loga o id)", () => {
    const fonte = fs.readFileSync(path.join(process.cwd(), "lib/admin.ts"), "utf8");
    const corpo = fonte.slice(fonte.indexOf("export async function apagarCliente("));
    const efeitos = corpo.slice(corpo.indexOf("const efeitos: EfeitosDoApagar"), corpo.indexOf("for (const u of usuarios)"));
    expect(efeitos.length).toBeGreaterThan(500);
    // Nenhum throw nem return direto de parada no trecho dos efeitos: só parar().
    expect(efeitos).not.toMatch(/\bthrow\b/);
    expect(efeitos).not.toMatch(/return \{ resultado:/);
    expect(efeitos).toContain('return parar("falha_banco", e);');
    expect(efeitos).toContain('if (pErr) return parar("falha_banco", pErr);');
    expect(efeitos).toContain("apagar cliente " + "$" + "{a.id}");
  });
});
