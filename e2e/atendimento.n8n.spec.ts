import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { FONE_TESTE, NOME_TESTE, servico, tenantDeTeste } from "./semente";

// ATENDIMENTO DE PONTA A PONTA (01/10/2026, pedido do dono: "só me mande testar
// depois de estar 100%").
//
// Cada cenário manda à MÃO o que a Evolution mandaria (o webhook de verdade do
// n8n de produção), com o telefone impossível (DDD 00), e confere o resultado no
// banco e na tela de Conversas: n8n -> cérebro real -> Supabase -> CRM. A
// resposta da IA tenta sair pelo WhatsApp e a Evolution recusa (o número não
// existe), então NINGUÉM recebe nada.
//
// ⚠️ O cenário de agendamento troca o destino de avisos do tenant de teste por
// um número impossível enquanto roda, e devolve o original no fim (senão o aviso
// "Conversa marcada" iria de verdade para o grupo do dono).
//
// Paga (modelo, Whisper e visão de verdade): só roda com `npm run test:e2e:n8n`.

const WEBHOOK = process.env.E2E_N8N_WEBHOOK || "https://n8n.obomsobrinho.com.br/webhook/agente_obm";
const INSTANCIA = process.env.E2E_N8N_INSTANCIA || "OBM";
const JID = `${FONE_TESTE}@s.whatsapp.net`;
const AUDIO = fs.readFileSync("e2e/fixtures/audio-whatsapp.ogg").toString("base64");
const SEM_TRANSCRICAO = "[Áudio enviado. Não foi possível transcrever.]";

let clientId = "";
let seq = 0;

type Linha = {
  id: number;
  created_at: string;
  user_message: string | null;
  bot_message: string | null;
  media_type: string | null;
  media_url: string | null;
};

async function limpar() {
  const svc = servico();
  for (const t of ["handoffs", "conversation_qualifications", "agent_turns", "chat_messages", "conversations"]) {
    await svc.from(t).delete().eq("client_id", clientId).like("phone", `${FONE_TESTE}%`);
  }
  await svc.from("dados_cliente").delete().eq("client_id", clientId).like("telefone", `${FONE_TESTE}%`);
}

async function enviar(message: Record<string, unknown>, messageType: string, id?: string) {
  const corpo = {
    event: "messages.upsert",
    instance: INSTANCIA,
    data: {
      key: { remoteJid: JID, fromMe: false, id: id ?? `E2EN8N${Date.now()}${seq++}` },
      pushName: NOME_TESTE,
      message,
      messageType,
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
  const r = await fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  expect(r.status, "o webhook do n8n aceitou").toBe(200);
}

const texto = (t: string) => enviar({ conversation: t }, "conversation");
const audio = () => enviar({ audioMessage: { mimetype: "audio/ogg; codecs=opus" }, base64: AUDIO }, "audioMessage");
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function linhas(): Promise<Linha[]> {
  const { data } = await servico()
    .from("chat_messages")
    .select("id, created_at, user_message, bot_message, media_type, media_url")
    .eq("client_id", clientId)
    .like("phone", `${FONE_TESTE}%`)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  return (data ?? []) as Linha[];
}

const respostas = (l: Linha[]) => l.filter((x) => x.bot_message?.trim());
const recebidas = (l: Linha[]) => l.filter((x) => x.user_message?.trim() || x.media_url);

/** Espera a primeira resposta da IA e depois mais um tempo, para pegar uma SEGUNDA que não devia existir. */
async function respostaUnica(folgaMs = 25_000): Promise<Linha[]> {
  await expect
    .poll(async () => respostas(await linhas()).length, { timeout: 120_000, intervals: [3000] })
    .toBeGreaterThanOrEqual(1);
  await espera(folgaMs);
  const l = await linhas();
  expect(respostas(l).map((x) => x.bot_message), "uma resposta só para o lote").toHaveLength(1);
  return l;
}

async function imagemBase64(page: Page): Promise<string> {
  await page.setContent(
    `<div style="font:28px sans-serif;padding:24px;background:#fff;color:#111;width:520px">Orçamento: troca de tela do celular, modelo X12, R$ 450</div>`
  );
  return (await page.locator("div").screenshot()).toString("base64");
}

test.beforeAll(async () => {
  clientId = (await tenantDeTeste(servico())).clientId;
});

test.beforeEach(async () => {
  await limpar();
  // Folga para o Redis da espera (chaves com 120s) não misturar cenários.
  await espera(3000);
});

test.afterAll(async () => {
  await limpar();
});

test("lote misto: texto, áudio real do WhatsApp, texto e imagem viram quatro linhas e UMA resposta", async ({ page }) => {
  const img = await imagemBase64(page);
  await texto("Boa noite, tudo bem?");
  await espera(2000);
  await audio();
  await espera(2000);
  await texto("e essa imagem aqui");
  await espera(2000);
  await enviar({ imageMessage: { mimetype: "image/png", caption: "" }, base64: img }, "imageMessage");

  const l = await respostaUnica();
  const r = recebidas(l);
  expect(r).toHaveLength(4);
  // Ordem de chegada, com cada mídia na própria linha.
  expect(r[0].user_message).toBe("Boa noite, tudo bem?");
  expect(r[1].media_type).toBe("audio");
  expect(r[1].media_url).toMatch(/\.ogg$/);
  expect(r[1].user_message).not.toBe(SEM_TRANSCRICAO);
  expect(r[1].user_message?.toLowerCase()).toContain("contato");
  expect(r[2].user_message).toBe("e essa imagem aqui");
  expect(r[3].media_type).toBe("image");
  expect(r[3].user_message).toMatch(/^\[Imagem enviada: /);
  // A resposta vem depois de todas as mensagens.
  const resp = respostas(l)[0];
  expect(Date.parse(resp.created_at)).toBeGreaterThan(Date.parse(r[3].created_at));

  // E a tela de Conversas mostra o áudio tocável e a imagem.
  await page.goto(`/inbox/${encodeURIComponent(JID)}`);
  const player = page.locator("main audio").first();
  await expect(player).toBeAttached({ timeout: 30_000 });
  const src = await player.getAttribute("src");
  expect(src, "o áudio tem endereço").toBeTruthy();
  const arquivo = await page.request.get(src!);
  expect(arquivo.status(), "o arquivo de áudio abre").toBe(200);
  await expect(page.locator("main img[src*='whatsapp-media'], main img[src*='token']").first()).toBeAttached();
});

test("áudio chegando no fim da espera não abre um segundo turno", async () => {
  await texto("Oi");
  await espera(11_000);
  await audio();
  await espera(2000);
  await audio();
  await espera(4000);
  await texto("conseguiu ver?");
  const l = await respostaUnica();
  expect(recebidas(l)).toHaveLength(4);
});

test("reação no meio do lote não segura a resposta até o teto", async () => {
  const t0 = Date.now();
  await texto("Oi, tudo bem?");
  await espera(3000);
  await enviar({ reactionMessage: { text: "👍", key: { id: "qualquer" } } }, "reactionMessage");
  await espera(3000);
  await texto("queria saber como funciona");
  const l = await respostaUnica(15_000);
  const resp = respostas(l)[0];
  expect(Date.parse(resp.created_at) - t0, "resposta antes do teto de espera").toBeLessThan(45_000);
  // A reação não vira mensagem nem gera resposta.
  expect(recebidas(l)).toHaveLength(2);
});

test("documento é guardado com o nome e a IA responde", async () => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n").toString("base64");
  await enviar(
    { documentMessage: { mimetype: "application/pdf", fileName: "proposta.pdf" }, base64: pdf },
    "documentMessage"
  );
  const l = await respostaUnica(10_000);
  const doc = recebidas(l)[0];
  expect(doc.media_type).toBe("document");
  expect(doc.media_url).toMatch(/\.pdf$/);
  expect(doc.user_message).toContain("Documento enviado: proposta.pdf");
});

test("pedir uma pessoa abre pedido de ajuda", async () => {
  await texto("Quero falar com uma pessoa do time, por favor");
  await respostaUnica(8000);
  const { data } = await servico()
    .from("handoffs")
    .select("id, closed_at")
    .eq("client_id", clientId)
    .like("phone", `${FONE_TESTE}%`);
  expect(data ?? []).toHaveLength(1);
  expect(data![0].closed_at).toBeNull();
});

test("conversa marcada é agendar e NÃO abre pedido de ajuda", async () => {
  const svc = servico();
  const { data: antes } = await svc.from("clients").select("notify_group_jid").eq("id", clientId).single();
  await svc.from("clients").update({ notify_group_jid: "5500000000099@s.whatsapp.net" }).eq("id", clientId);
  try {
    // Uma conversa já encaminhada, gravada direto no banco.
    const base = Date.now() - 10 * 60_000;
    await svc.from("dados_cliente").insert({ client_id: clientId, telefone: JID, nomewpp: NOME_TESTE, atendimento_ia: "ativa" });
    await svc.from("chat_messages").insert([
      { client_id: clientId, phone: JID, nomewpp: NOME_TESTE, user_message: "Tenho uma loja e perco cliente porque demoro a responder no WhatsApp", created_at: new Date(base).toISOString() },
      { client_id: clientId, phone: JID, bot_message: "Faz sentido, e esse é um dos cenários que a gente mais resolve. | Posso te mostrar numa conversa rápida como ficaria pra sua loja. Quer marcar?", message_type: "text", created_at: new Date(base + 30_000).toISOString() },
      { client_id: clientId, phone: JID, nomewpp: NOME_TESTE, user_message: "Quero sim", created_at: new Date(base + 60_000).toISOString() },
      { client_id: clientId, phone: JID, bot_message: "Ótimo. Me diz um dia e um período que fiquem melhores pra você.", message_type: "text", created_at: new Date(base + 90_000).toISOString() },
    ]);
    await texto("Pode ser amanhã às 15h");
    await respostaUnica(8000);
    const { data: q } = await svc
      .from("conversation_qualifications")
      .select("action")
      .eq("client_id", clientId)
      .like("phone", `${FONE_TESTE}%`)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(q?.[0]?.action).toBe("agendar");
    const { data: h } = await svc.from("handoffs").select("id").eq("client_id", clientId).like("phone", `${FONE_TESTE}%`);
    expect(h ?? [], "agendar não abre pedido").toHaveLength(0);
  } finally {
    await svc.from("clients").update({ notify_group_jid: antes?.notify_group_jid ?? null }).eq("id", clientId);
  }
});

test("com a IA pausada, a mensagem é guardada e ninguém responde", async () => {
  const svc = servico();
  await svc.from("dados_cliente").insert({ client_id: clientId, telefone: JID, nomewpp: NOME_TESTE, atendimento_ia: "pause" });
  await texto("Alguém aí?");
  await expect
    .poll(async () => recebidas(await linhas()).length, { timeout: 60_000, intervals: [3000] })
    .toBe(1);
  await espera(30_000);
  expect(respostas(await linhas())).toHaveLength(0);
});

test("a mesma mensagem entregue duas vezes vira uma linha só", async () => {
  const id = `E2EN8NDUP${Date.now()}`;
  await enviar({ conversation: "Mensagem repetida" }, "conversation", id);
  await enviar({ conversation: "Mensagem repetida" }, "conversation", id);
  await respostaUnica(8000);
  expect(recebidas(await linhas())).toHaveLength(1);
});
