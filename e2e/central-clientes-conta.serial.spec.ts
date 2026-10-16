import { inflateRawSync } from "node:zlib";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { segredoDoAgente, servico, tenantDeTeste } from "./semente";
import { TABELAS_DA_EXPORTACAO, TABELAS_DO_CLIENTE, TABELAS_MANTIDAS } from "../lib/admin-purga";

// A CENTRAL "CLIENTES", ENTREGA 2, CONTRA O BANCO DE VERDADE (docs/plano-central-clientes.md).
// Roda com a sessão do DONO de teste, que está em ADMIN_USER_IDS (projeto
// `logado-serial`). As ações passam pelas rotas da central, como na tela.
//
// 1. No tenant OBS (autorizado pelo dono): marcar e remover vitalício, a recusa de
//    estender um teste que não existe, desativar e reativar (o atendente vê a tela
//    clara, as rotas dele dão 403, a IA silencia antes do modelo). TUDO volta ao
//    que era no fim, mesmo com falha (afterAll).
// 2. "Apagar de vez" NUNCA roda num tenant de verdade: o teste cria um cliente
//    DESCARTÁVEL (login próprio, `provision_tenant`, dados com telefone DDD 00,
//    um arquivo no Storage), estende o teste dele, prova que o webhook não rebaixa
//    um vitalício, exporta, desativa e apaga; depois confere que nada com o
//    client_id dele sobrou em nenhuma tabela da rotina e que o registro do
//    apagamento existe.
//
// ⚠️ Nada aqui chama o modelo nem manda WhatsApp: o turno da conta desativada é
// silencioso ANTES de tudo, o telefone é de teste e o descartável não tem instância.

const PREFIXO = "E2E Descartável";

let obs = "";
let dono = "";
let original: {
  vitalicio_desde: string | null;
  bloqueado_em: string | null;
  desativada_em: string | null;
  trial_ends_at: string | null;
  subscription_status: string;
} | null = null;

/** Volta as marcas da central do OBS pelo caminho oficial (o gatilho barra update direto). */
async function restaurarObs() {
  if (!original) return;
  const svc = servico();
  const { data } = await svc
    .from("clients")
    .select("vitalicio_desde, bloqueado_em, desativada_em")
    .eq("id", obs)
    .single();
  const acoes: string[] = [];
  if (!!data?.vitalicio_desde !== !!original.vitalicio_desde) acoes.push(original.vitalicio_desde ? "vitalicio" : "remover_vitalicio");
  if (!!data?.bloqueado_em !== !!original.bloqueado_em) acoes.push(original.bloqueado_em ? "bloquear" : "liberar");
  if (!!data?.desativada_em !== !!original.desativada_em) acoes.push(original.desativada_em ? "desativar" : "reativar");
  for (const acao of acoes) {
    const { error } = await svc.rpc("admin_mudar_conta", { p_quem: dono, p_client: obs, p_acao: acao });
    expect(error).toBeNull();
  }
  // Fora do vitalício, as colunas da assinatura voltam por update direto.
  await svc
    .from("clients")
    .update({ trial_ends_at: original.trial_ends_at, subscription_status: original.subscription_status })
    .eq("id", obs);
}

test.beforeAll(async () => {
  const svc = servico();
  const t = await tenantDeTeste(svc);
  obs = t.clientId;
  dono = t.userId;
  const { data, error } = await svc
    .from("clients")
    .select("vitalicio_desde, bloqueado_em, desativada_em, trial_ends_at, subscription_status")
    .eq("id", obs)
    .single();
  expect(error).toBeNull();
  original = data;
  // O OBS precisa começar sem marcas da central para o teste saber o que desfazer.
  expect(data?.desativada_em, "o OBS começou desativado: pare e confira à mão").toBeNull();
});

test.afterAll(async () => {
  await restaurarObs();
});

async function acao(request: APIRequestContext, id: string, corpo: Record<string, unknown>) {
  return request.put(`/api/admin/empresas/${id}/conta`, { data: corpo });
}

test.describe.configure({ mode: "serial" });

test("OBS: marcar e remover vitalício, cada um com o seu registro em admin_acoes", async ({ request }) => {
  const svc = servico();
  const vitalicio = !!original?.vitalicio_desde;
  const ida = await acao(request, obs, { acao: vitalicio ? "remover_vitalicio" : "vitalicio" });
  const corpo = await ida.json();
  if (ida.status() === 409) {
    // Com assinatura no Asaas, marcar vitalício é recusado (vitalício nunca é cobrado).
    expect(corpo.resultado).toBe("tem_assinatura");
    return;
  }
  expect(ida.status(), JSON.stringify(corpo)).toBe(200);
  expect(corpo.empresa.situacao.chave === "vitalicio").toBe(!vitalicio);
  const volta = await acao(request, obs, { acao: vitalicio ? "vitalicio" : "remover_vitalicio" });
  expect(volta.status()).toBe(200);
  const { data: registros } = await svc
    .from("admin_acoes")
    .select("acao, quem")
    .eq("alvo", obs)
    .in("acao", ["vitalicio", "remover_vitalicio"])
    .order("id", { ascending: false })
    .limit(2);
  expect((registros ?? []).map((r) => r.acao).sort()).toEqual(["remover_vitalicio", "vitalicio"]);
  expect((registros ?? []).every((r) => r.quem === dono)).toBe(true);
  // Repetir não grava nada (já estava assim).
  const repetida = await acao(request, obs, { acao: vitalicio ? "vitalicio" : "remover_vitalicio" });
  expect((await repetida.json()).resultado).toBe("sem_mudanca");
});

test("OBS: estender o teste é recusado quando não há teste com prazo", async ({ request }) => {
  const res = await acao(request, obs, { acao: "estender_teste", dias: 3 });
  if (original?.subscription_status === "trialing" && original.trial_ends_at && !original.vitalicio_desde) {
    expect(res.status()).toBe(200);
    return; // afterAll devolve o fim do teste original
  }
  expect(res.status()).toBe(409);
  expect(["nao_em_teste", "sem_prazo", "vitalicio"]).toContain((await res.json()).resultado);
  // Pedido torto nem chega ao banco.
  expect((await acao(request, obs, { acao: "estender_teste", dias: 0 })).status()).toBe(400);
  expect((await acao(request, obs, { acao: "mudar_plano", plano: "inventado" })).status()).toBe(400);
});

test("OBS: desativar barra o atendente (tela clara, 403) e silencia a IA; reativar devolve", async ({ request, browser }) => {
  const des = await acao(request, obs, { acao: "desativar" });
  expect(des.status(), await des.text()).toBe(200);
  try {
    const ctx = await browser.newContext({ storageState: "e2e/.auth/atendente.json" });
    try {
      const page = await ctx.newPage();
      await page.goto("/inbox");
      await expect(page).toHaveURL(/\/conta-desativada$/);
      await expect(page.getByRole("heading", { name: "Conta desativada" })).toBeVisible();
      // Uma rota de sessão (leitura) também fecha.
      const rota = await page.request.get(`/api/clients/${obs}/whatsapp-status`);
      expect(rota.status()).toBe(403);
      expect((await rota.json()).error).toBe("conta desativada");
    } finally {
      await ctx.close();
    }
    // A IA silencia antes do modelo (bancada, nada gasto, nada enviado).
    const turno = await request.post("/api/agent", {
      headers: { "x-lookup-secret": segredoDoAgente() },
      data: { client_id: obs, phone: "playground:e2e-desativada", message: "Oi", dryRun: true },
      timeout: 60_000,
    });
    expect(turno.status()).toBe(200);
    const t = (await turno.json()) as { output: { messages: string[] }; diagnostics: { contaDesativada?: boolean } };
    expect(t.diagnostics.contaDesativada).toBe(true);
    expect(t.output.messages).toEqual([]);
    // Apagar de vez continua exigindo o nome certo, mesmo desativado (nada é apagado aqui).
    const errado = await request.post(`/api/admin/empresas/${obs}/apagar`, { data: { nome: "nome que não é" } });
    expect(errado.status()).toBe(400);
  } finally {
    const rea = await acao(request, obs, { acao: "reativar" });
    expect(rea.status()).toBe(200);
  }
  const ctx = await browser.newContext({ storageState: "e2e/.auth/atendente.json" });
  try {
    const page = await ctx.newPage();
    await page.goto("/inbox");
    await expect(page).not.toHaveURL(/conta-desativada/);
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// O cliente DESCARTÁVEL: criado, exportado e apagado pelo próprio teste.
// ---------------------------------------------------------------------------

let descartavel = "";
let nomeDescartavel = "";
let usuarioDescartavel = "";
const ARQUIVO = (id: string) => `${id}/e2e/descartavel.txt`;

let eventoDeTeste = "";

async function limparDescartavel() {
  if (!descartavel) return;
  const svc = servico();
  const { data } = await svc.from("clients").select("id, desativada_em").eq("id", descartavel).maybeSingle();
  if (data) {
    if (!data.desativada_em) await svc.rpc("admin_mudar_conta", { p_quem: dono, p_client: descartavel, p_acao: "desativar" });
    await svc.storage.from("whatsapp-media").remove([ARQUIVO(descartavel)]);
    await svc.rpc("admin_apagar_cliente", {
      p_quem: dono,
      p_client: descartavel,
      p_nome: nomeDescartavel,
      p_tabelas: [...TABELAS_DO_CLIENTE],
      p_usuarios: 1,
      p_mantidas: [...TABELAS_MANTIDAS],
    });
  }
  // O evento de cobrança de teste fica depois do apagar (é a regra); some aqui.
  if (eventoDeTeste) await svc.from("billing_events").delete().eq("asaas_event_id", eventoDeTeste);
  if (usuarioDescartavel) await svc.auth.admin.deleteUser(usuarioDescartavel);
}

test.afterAll(async () => {
  await limparDescartavel();
});

/** Lê as entradas de um ZIP (diretório central), descomprimidas. */
function lerZip(zip: Buffer): Record<string, string> {
  const fim = zip.length - 22;
  expect(zip.readUInt32LE(fim)).toBe(0x06054b50);
  const total = zip.readUInt16LE(fim + 10);
  let pos = zip.readUInt32LE(fim + 16);
  const saida: Record<string, string> = {};
  for (let i = 0; i < total; i++) {
    const comp = zip.readUInt32LE(pos + 20);
    const nLen = zip.readUInt16LE(pos + 28);
    const local = zip.readUInt32LE(pos + 42);
    const nome = zip.subarray(pos + 46, pos + 46 + nLen).toString("utf8");
    const ini = local + 30 + zip.readUInt16LE(local + 26);
    saida[nome] = inflateRawSync(zip.subarray(ini, ini + comp)).toString("utf8");
    pos += 46 + nLen;
  }
  return saida;
}

test("descartável: estender teste, vitalício que o gateway não rebaixa, exportar, desativar e apagar de vez", async ({
  request,
}) => {
  test.setTimeout(180_000);
  const svc = servico();
  const marca = Date.now();
  nomeDescartavel = `${PREFIXO} ${marca}`;
  const fone = `55000${String(marca).slice(-8)}`;

  // 1. Cria o login e o cliente pelo mesmo caminho do cadastro (provision_tenant).
  const { data: u, error: uErr } = await svc.auth.admin.createUser({
    email: `e2e-descartavel-${marca}@exemplo.invalid`,
    email_confirm: true,
  });
  expect(uErr).toBeNull();
  usuarioDescartavel = u.user!.id;
  const fimDoTeste = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const { data: id, error: pErr } = await svc.rpc("provision_tenant", {
    p_user_id: usuarioDescartavel,
    p_company_name: nomeDescartavel,
    p_trial_ends_at: fimDoTeste,
  });
  expect(pErr).toBeNull();
  descartavel = id as string;

  // Dados em várias tabelas, com telefone DDD 00 (nunca notifica).
  expect((await svc.from("dados_cliente").insert({ client_id: descartavel, telefone: fone, nomewpp: "Descartável" })).error).toBeNull();
  expect(
    (await svc.from("chat_messages").insert({ client_id: descartavel, phone: fone, user_message: "Oi, mensagem descartável" })).error
  ).toBeNull();
  expect((await svc.from("tags").insert({ client_id: descartavel, name: "e2e" })).error).toBeNull();
  expect((await svc.from("quick_replies").insert({ client_id: descartavel, title: "e2e", body: "resposta" })).error).toBeNull();
  expect(
    (await svc.from("feedback").insert({ client_id: descartavel, user_id: usuarioDescartavel, message: "e2e" })).error
  ).toBeNull();
  // Um evento de cobrança: o "Apagar de vez" o MANTÉM (registro fiscal).
  eventoDeTeste = `e2e-descartavel-${marca}`;
  expect(
    (await svc.from("billing_events").insert({ asaas_event_id: eventoDeTeste, event: "E2E", client_id: descartavel, payload: {} }))
      .error
  ).toBeNull();
  expect(
    (
      await svc.storage
        .from("whatsapp-media")
        .upload(ARQUIVO(descartavel), new Blob(["arquivo descartável"], { type: "text/plain" }), { upsert: true })
    ).error
  ).toBeNull();

  // 2. Estender o teste: conta a partir do fim atual (ainda no futuro).
  const est = await acao(request, descartavel, { acao: "estender_teste", dias: 3 });
  expect(est.status(), await est.text()).toBe(200);
  const { data: depoisDeEstender } = await svc.from("clients").select("trial_ends_at").eq("id", descartavel).single();
  const ganho = Date.parse(depoisDeEstender!.trial_ends_at!) - Date.parse(fimDoTeste);
  expect(Math.round(ganho / 86_400_000)).toBe(3);

  // 3. Vitalício: uma escrita no estado da assinatura fora do admin (o gateway, por
  // exemplo) FALHA e nada muda; ninguém fora do admin mexe na marca.
  expect((await acao(request, descartavel, { acao: "vitalicio" })).status()).toBe(200);
  const rebaixar = await svc.from("clients").update({ subscription_status: "canceled", trial_ends_at: null }).eq("id", descartavel);
  expect(rebaixar.error?.code).toBe("42501");
  const { data: congelado } = await svc
    .from("clients")
    .select("subscription_status, trial_ends_at, vitalicio_desde")
    .eq("id", descartavel)
    .single();
  expect(congelado?.subscription_status).toBe("trialing");
  expect(congelado?.trial_ends_at).toBe(depoisDeEstender!.trial_ends_at);
  const direto = await svc.from("clients").update({ vitalicio_desde: null }).eq("id", descartavel);
  expect(direto.error?.code).toBe("42501");
  expect((await acao(request, descartavel, { acao: "remover_vitalicio" })).status()).toBe(200);

  // 4. Ainda ativo: apagar é recusado.
  const cedo = await request.post(`/api/admin/empresas/${descartavel}/apagar`, { data: { nome: nomeDescartavel } });
  expect(cedo.status()).toBe(409);

  // 5. Desativar e exportar: um CSV por tabela, com os dados dele.
  expect((await acao(request, descartavel, { acao: "desativar" })).status()).toBe(200);
  const exp = await request.get(`/api/admin/empresas/${descartavel}/exportar`);
  expect(exp.status()).toBe(200);
  expect(exp.headers()["content-type"]).toContain("application/zip");
  const arquivos = lerZip(Buffer.from(await exp.body()));
  expect(Object.keys(arquivos).sort()).toEqual(
    ["cliente.csv", "membros.csv", ...TABELAS_DA_EXPORTACAO.map((t) => `${t}.csv`)].sort()
  );
  expect(arquivos["cliente.csv"]).toContain(nomeDescartavel);
  expect(arquivos["chat_messages.csv"]).toContain("Oi, mensagem descartável");
  expect(arquivos["dados_cliente.csv"]).toContain(fone);
  expect(arquivos["pipeline_stages.csv"]).toContain("qualificado");
  expect(arquivos["membros.csv"]).toContain(`e2e-descartavel-${marca}@exemplo.invalid`);

  // 6. Nome errado: nada acontece.
  const errado = await request.post(`/api/admin/empresas/${descartavel}/apagar`, { data: { nome: "Outro nome" } });
  expect(errado.status()).toBe(400);
  expect((await svc.from("clients").select("id").eq("id", descartavel).maybeSingle()).data).not.toBeNull();

  // 7. Apagar de vez.
  const apagar = await request.post(`/api/admin/empresas/${descartavel}/apagar`, { data: { nome: nomeDescartavel } });
  expect(apagar.status(), await apagar.text()).toBe(200);
  for (const t of TABELAS_DO_CLIENTE) {
    const { count, error } = await svc.from(t).select("client_id", { count: "exact", head: true }).eq("client_id", descartavel);
    expect(error, t).toBeNull();
    expect(count, t).toBe(0);
  }
  expect((await svc.from("clients").select("id").eq("id", descartavel).maybeSingle()).data).toBeNull();
  // O histórico de cobrança ficou, sem a chave para o cliente e com o id e o nome dele.
  const { data: evento } = await svc
    .from("billing_events")
    .select("client_id, deleted_client_id, deleted_client_name")
    .eq("asaas_event_id", eventoDeTeste)
    .single();
  expect(evento).toEqual({ client_id: null, deleted_client_id: descartavel, deleted_client_name: nomeDescartavel });
  await svc.from("billing_events").delete().eq("asaas_event_id", eventoDeTeste);
  eventoDeTeste = "";
  const { data: sobrou } = await svc.storage.from("whatsapp-media").list(`${descartavel}/e2e`);
  expect(sobrou ?? []).toEqual([]);
  const { data: login } = await svc.auth.admin.getUserById(usuarioDescartavel);
  expect(login?.user ?? null).toBeNull();
  usuarioDescartavel = "";

  // O registro sobrevive: quem, quando, nome e id; nenhum conteúdo.
  const { data: registro } = await svc
    .from("admin_acoes")
    .select("quem, acao, antes, depois, em")
    .eq("alvo", descartavel)
    .eq("acao", "apagar_cliente")
    .single();
  expect(registro?.quem).toBe(dono);
  expect(registro?.antes).toMatchObject({ nome: nomeDescartavel, id: descartavel });
  expect(JSON.stringify(registro?.depois)).not.toContain("mensagem descartável");
  descartavel = "";
});
