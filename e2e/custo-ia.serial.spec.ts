import { test, expect } from "@playwright/test";
import { FONE_TESTE, segredoDoAgente, servico, tenantDeTeste } from "./semente";
import { mesSP } from "../lib/custo-ia";

// TETO DE IA DO MÊS contra o banco de verdade (P1 item 6, docs/plano-custo-ia.md).
//
// ⚠️ NADA AQUI CHAMA O MODELO NEM MANDA WHATSAPP. O turno parado no teto é
// silencioso ANTES do modelo (é isso que se prova), e o telefone é o de teste
// (DDD 00), que nunca dispara nem marca aviso (`telefoneImpossivel`).
// "Subir o teto reativa" é provado pela faixa sumir e pela regra pura
// (`estadoDoConsumo`, e2e/custo-ia.design.spec.ts); o turno de verdade passando
// abaixo do teto é o que as suítes pagas (`ia`, `bateria`) fazem a cada rodada.
//
// ⚠️ SERIAL porque o teste PARA a IA do tenant de teste por alguns segundos (o
// teto vira o próprio uso) e devolve tudo no fim, mesmo se falhar: o teto
// original e os tokens que ele somou. Nesse intervalo, uma mensagem real no
// número do tenant de teste ficaria sem resposta da IA.

let clientId = "";
let limiteOriginal: number | null = null;

test.beforeAll(async () => {
  const svc = servico();
  clientId = (await tenantDeTeste(svc)).clientId;
  const { data } = await svc.from("clients").select("ia_limite_tokens").eq("id", clientId).single();
  limiteOriginal = (data?.ia_limite_tokens as number | null) ?? null;
});

test.afterAll(async () => {
  await servico().from("clients").update({ ia_limite_tokens: limiteOriginal }).eq("id", clientId);
});

type Linha = { tokens_entrada: number; tokens_cache: number; tokens_saida: number };

async function lerMes(mes: string): Promise<Linha> {
  const { data } = await servico()
    .from("consumo_ia_mensal")
    .select("tokens_entrada, tokens_cache, tokens_saida")
    .eq("client_id", clientId)
    .eq("mes", mes)
    .maybeSingle();
  return (data as Linha | null) ?? { tokens_entrada: 0, tokens_cache: 0, tokens_saida: 0 };
}

/** Tira do mês o que o teste somou (a função do banco só soma, nunca subtrai). */
async function descontar(mes: string, d: Linha) {
  const atual = await lerMes(mes);
  const { error } = await servico()
    .from("consumo_ia_mensal")
    .update({
      tokens_entrada: Math.max(0, atual.tokens_entrada - d.tokens_entrada),
      tokens_cache: Math.max(0, atual.tokens_cache - d.tokens_cache),
      tokens_saida: Math.max(0, atual.tokens_saida - d.tokens_saida),
    })
    .eq("client_id", clientId)
    .eq("mes", mes);
  expect(error).toBeNull();
}

test("a soma do mês é atômica e devolve o total já somado", async () => {
  const svc = servico();
  const mes = mesSP(Date.now());
  const antes = await lerMes(mes);
  const delta = { tokens_entrada: 1000, tokens_cache: 400, tokens_saida: 50 };
  try {
    const [a, b] = await Promise.all([
      svc.rpc("somar_consumo_ia", { p_client: clientId, p_mes: mes, p_entrada: 500, p_cache: 200, p_saida: 25 }),
      svc.rpc("somar_consumo_ia", { p_client: clientId, p_mes: mes, p_entrada: 500, p_cache: 200, p_saida: 25 }),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    const depois = await lerMes(mes);
    // Duas somas ao mesmo tempo: nenhuma se perde (upsert atômico).
    expect(depois.tokens_entrada - antes.tokens_entrada).toBeGreaterThanOrEqual(1000);
    expect(depois.tokens_cache - antes.tokens_cache).toBeGreaterThanOrEqual(400);
    expect(depois.tokens_saida - antes.tokens_saida).toBeGreaterThanOrEqual(50);
    // Negativo conta como zero: a soma nunca desconta.
    const neg = await svc.rpc("somar_consumo_ia", { p_client: clientId, p_mes: mes, p_entrada: -999, p_cache: -1, p_saida: -1 });
    expect(neg.error).toBeNull();
    expect((await lerMes(mes)).tokens_entrada).toBeGreaterThanOrEqual(depois.tokens_entrada);
  } finally {
    await descontar(mes, delta);
  }
});

test("cada aviso é reivindicado uma vez; liberar devolve; o admin troca o teto e limpa marcas na mesma transação", async () => {
  const svc = servico();
  const { userId } = await tenantDeTeste(svc);
  // Um mês do passado, para nunca mexer no aviso do mês de verdade.
  const mes = "2000-01-01";
  try {
    await svc.rpc("somar_consumo_ia", { p_client: clientId, p_mes: mes, p_entrada: 900, p_cache: 0, p_saida: 0 });
    for (const nivel of ["aviso", "parado"]) {
      const primeiro = await svc.rpc("reivindicar_aviso_consumo", { p_client: clientId, p_mes: mes, p_nivel: nivel });
      const segundo = await svc.rpc("reivindicar_aviso_consumo", { p_client: clientId, p_mes: mes, p_nivel: nivel });
      expect(primeiro.data).toBe(true);
      expect(segundo.data).toBe(false);
    }
    // Envio que falhou: a marca volta, e a próxima tentativa ganha de novo.
    await svc.rpc("liberar_aviso_consumo", { p_client: clientId, p_mes: mes, p_nivel: "parado" });
    expect((await svc.rpc("reivindicar_aviso_consumo", { p_client: clientId, p_mes: mes, p_nivel: "parado" })).data).toBe(true);

    // O admin sobe o teto (uso 900): limiares 1000/1250 deixam as duas marcas
    // para trás, e elas são limpas junto com o registro em admin_acoes.
    const { count: acoesAntes } = await svc
      .from("admin_acoes")
      .select("id", { count: "exact", head: true })
      .eq("alvo", clientId);
    const troca = await svc.rpc("admin_mudar_limite_ia", {
      p_quem: userId,
      p_client: clientId,
      p_limite: limiteOriginal,
      p_mes: mes,
      p_limiar_aviso: 1000,
      p_limiar_parado: 1250,
    });
    expect(troca.error).toBeNull();
    expect(troca.data?.length).toBe(1);
    const { data: marcas } = await svc
      .from("consumo_ia_mensal")
      .select("aviso_80_em, aviso_100_em")
      .eq("client_id", clientId)
      .eq("mes", mes)
      .single();
    expect(marcas?.aviso_80_em).toBeNull();
    expect(marcas?.aviso_100_em).toBeNull();
    const { count: acoesDepois } = await svc
      .from("admin_acoes")
      .select("id", { count: "exact", head: true })
      .eq("alvo", clientId);
    expect((acoesDepois ?? 0) - (acoesAntes ?? 0)).toBe(1);
    // Empresa que não existe: nada muda, nada é registrado.
    const fantasma = await svc.rpc("admin_mudar_limite_ia", {
      p_quem: userId,
      p_client: "00000000-0000-4000-8000-000000000000",
      p_limite: 1,
      p_mes: mes,
      p_limiar_aviso: 1,
      p_limiar_parado: 1,
    });
    expect(fantasma.data?.length ?? 0).toBe(0);
  } finally {
    await svc.from("consumo_ia_mensal").delete().eq("client_id", clientId).eq("mes", mes);
    await svc.from("clients").update({ ia_limite_tokens: limiteOriginal }).eq("id", clientId);
  }
});

test("trocar o plano limpa as marcas que o teto novo deixou para trás (limpar_marcas_consumo_ia), e só elas", async () => {
  const svc = servico();
  const mes = "2000-02-01";
  const marcar = async () => {
    await svc.rpc("somar_consumo_ia", { p_client: clientId, p_mes: mes, p_entrada: 900, p_cache: 0, p_saida: 0 });
    await svc.rpc("reivindicar_aviso_consumo", { p_client: clientId, p_mes: mes, p_nivel: "aviso" });
    await svc.rpc("reivindicar_aviso_consumo", { p_client: clientId, p_mes: mes, p_nivel: "parado" });
  };
  const ler = async () =>
    (
      await svc
        .from("consumo_ia_mensal")
        .select("aviso_80_em, aviso_100_em")
        .eq("client_id", clientId)
        .eq("mes", mes)
        .single()
    ).data;
  try {
    await marcar();
    // Teto que DESCEU (limiares 500/600): o uso (900) segue acima dos dois, nada é limpo.
    const desceu = await svc.rpc("limpar_marcas_consumo_ia", {
      p_client: clientId,
      p_mes: mes,
      p_limiar_aviso: 500,
      p_limiar_parado: 600,
    });
    expect(desceu.error).toBeNull();
    expect(desceu.data).toBe(0);
    expect((await ler())?.aviso_80_em).not.toBeNull();
    // Teto que subiu o bastante para o aviso (800/1000): fica a marca do 80%, sai a do 100%.
    const meio = await svc.rpc("limpar_marcas_consumo_ia", {
      p_client: clientId,
      p_mes: mes,
      p_limiar_aviso: 800,
      p_limiar_parado: 1000,
    });
    expect(meio.data).toBe(1);
    const depoisDoMeio = await ler();
    expect(depoisDoMeio?.aviso_80_em).not.toBeNull();
    expect(depoisDoMeio?.aviso_100_em).toBeNull();
    // Teto muito maior (1000/1250): limpa o que sobrou. A linha de outro mês nunca é tocada.
    const tudo = await svc.rpc("limpar_marcas_consumo_ia", {
      p_client: clientId,
      p_mes: mes,
      p_limiar_aviso: 1000,
      p_limiar_parado: 1250,
    });
    expect(tudo.data).toBe(1);
    const limpo = await ler();
    expect(limpo?.aviso_80_em).toBeNull();
    expect(limpo?.aviso_100_em).toBeNull();
  } finally {
    await svc.from("consumo_ia_mensal").delete().eq("client_id", clientId).eq("mes", mes);
  }
});

test("turno de bancada no teto nunca marca nem manda aviso de uso (só turno real do WhatsApp avisa)", async ({
  request,
  page,
}) => {
  const svc = servico();
  const mes = mesSP(Date.now());
  // Se o aviso de 100% do mês já saiu de verdade, a deduplicação esconderia a
  // regra: a prova não vale e o teste diz por quê.
  const { data: linhaAntes } = await svc
    .from("consumo_ia_mensal")
    .select("aviso_100_em")
    .eq("client_id", clientId)
    .eq("mes", mes)
    .maybeSingle();
  test.skip(!!linhaAntes?.aviso_100_em, "o aviso de 100% deste mês já foi marcado; a prova fica para o mês seguinte");

  let somado: Linha = { tokens_entrada: 0, tokens_cache: 0, tokens_saida: 0 };
  let uso = await lerMes(mes);
  if (uso.tokens_entrada + uso.tokens_saida === 0) {
    somado = { tokens_entrada: 1000, tokens_cache: 0, tokens_saida: 0 };
    await svc.rpc("somar_consumo_ia", { p_client: clientId, p_mes: mes, p_entrada: 1000, p_cache: 0, p_saida: 0 });
    uso = await lerMes(mes);
  }
  const { data: t } = await svc.from("clients").select("notify_group_jid").eq("id", clientId).single();
  const destinoOriginal = (t?.notify_group_jid as string | null) ?? null;
  try {
    // Cinto e suspensório: sem destino de avisos durante o teste, nem uma
    // regressão mandaria WhatsApp ao grupo do tenant de teste.
    await svc
      .from("clients")
      .update({ ia_limite_tokens: uso.tokens_entrada + uso.tokens_saida, notify_group_jid: null })
      .eq("id", clientId);
    // Telefone da bancada (NÃO é DDD 00): só o `dryRun` impede o aviso.
    const res = await request.post("/api/agent", {
      headers: { "x-lookup-secret": segredoDoAgente() },
      data: { client_id: clientId, phone: "playground:e2e-custo-ia", message: "Oi", dryRun: true },
      timeout: 60_000,
    });
    expect(res.status(), await res.text()).toBe(200);
    expect(((await res.json()) as { diagnostics: { limiteIa?: boolean } }).diagnostics.limiteIa).toBe(true);
    await page.waitForTimeout(1500);
    const { data: depois } = await svc
      .from("consumo_ia_mensal")
      .select("aviso_100_em")
      .eq("client_id", clientId)
      .eq("mes", mes)
      .single();
    expect(depois?.aviso_100_em).toBeNull();
  } finally {
    await svc
      .from("clients")
      .update({ ia_limite_tokens: limiteOriginal, notify_group_jid: destinoOriginal })
      .eq("id", clientId);
    if (somado.tokens_entrada > 0) await descontar(mes, somado);
  }
});

test("no teto a IA fica muda antes do modelo (WhatsApp e bancada), a faixa aparece, e subir o teto a tira", async ({
  page,
  request,
}) => {
  const svc = servico();
  const mes = mesSP(Date.now());
  // Sem uso no mês, o teste soma um pouco para ter um "uso" onde pôr o teto.
  let somado: Linha = { tokens_entrada: 0, tokens_cache: 0, tokens_saida: 0 };
  let uso = await lerMes(mes);
  if (uso.tokens_entrada + uso.tokens_saida === 0) {
    somado = { tokens_entrada: 1000, tokens_cache: 0, tokens_saida: 0 };
    await svc.rpc("somar_consumo_ia", { p_client: clientId, p_mes: mes, p_entrada: 1000, p_cache: 0, p_saida: 0 });
    uso = await lerMes(mes);
  }
  const usados = uso.tokens_entrada + uso.tokens_saida;
  const { data: avisosAntes } = await svc
    .from("consumo_ia_mensal")
    .select("aviso_80_em, aviso_100_em")
    .eq("client_id", clientId)
    .eq("mes", mes)
    .single();

  try {
    // O teto vira o próprio uso: 100%, parada.
    await svc.from("clients").update({ ia_limite_tokens: usados }).eq("id", clientId);

    for (const dryRun of [false, true]) {
      const res = await request.post("/api/agent", {
        headers: { "x-lookup-secret": segredoDoAgente() },
        data: { client_id: clientId, phone: FONE_TESTE, message: "Oi, tudo bem?", dryRun },
        timeout: 60_000,
      });
      expect(res.status(), await res.text()).toBe(200);
      const corpo = (await res.json()) as {
        output: { messages: string[]; action: string };
        diagnostics: { limiteIa?: boolean; personaOrigem: string };
      };
      expect(corpo.diagnostics.limiteIa).toBe(true);
      expect(corpo.diagnostics.personaOrigem).toBe("nenhuma");
      expect(corpo.output.messages).toEqual([]);
      expect(corpo.output.action).toBe("none");
    }

    // O turno registrado diz por que ficou mudo, e não somou nada (sem modelo).
    const { data: turno } = await svc
      .from("agent_turns")
      .select("silenced, input_tokens")
      .eq("client_id", clientId)
      .eq("phone", FONE_TESTE)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(turno?.silenced).toBe("limite_ia");
    expect(turno?.input_tokens).toBeNull();
    const agora = await lerMes(mes);
    expect(agora.tokens_entrada + agora.tokens_saida).toBe(usados);

    // O telefone de teste nunca marca aviso (nem gasta o aviso do mês).
    await page.waitForTimeout(1500);
    const { data: avisosDepois } = await svc
    .from("consumo_ia_mensal")
    .select("aviso_80_em, aviso_100_em")
    .eq("client_id", clientId)
    .eq("mes", mes)
    .single();
    expect(avisosDepois).toEqual(avisosAntes);

    // A faixa aparece para a empresa.
    await page.goto("/inbox");
    await expect(page.locator("[data-limite-ia]")).toBeVisible();
    await expect(page.locator("[data-limite-ia]")).toContainText("Limite de IA do mês atingido");

    // Subir o teto acima do uso tira a parada na próxima leitura.
    await svc.from("clients").update({ ia_limite_tokens: usados + 10_000_000 }).eq("id", clientId);
    await page.reload();
    await expect(page.locator("[data-limite-ia]")).toHaveCount(0);
  } finally {
    await svc.from("clients").update({ ia_limite_tokens: limiteOriginal }).eq("id", clientId);
    if (somado.tokens_entrada > 0) await descontar(mes, somado);
  }
});
