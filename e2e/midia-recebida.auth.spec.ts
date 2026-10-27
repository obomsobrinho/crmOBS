import { test, expect } from "@playwright/test";
import { segredoDoAgente, servico, tenantDeTeste } from "./semente";

// `/api/inbound-media` contra o Storage de verdade (27/10/2026), no tenant de
// teste. Prova os dois modos: o base64 no corpo (antigo, o n8n de produção
// ainda manda assim até a troca) e a URL assinada (o binário sobe direto no
// Storage, sem passar pelo limite de corpo da Vercel). Cada arquivo criado é
// apagado no fim, mesmo se o teste falhar. Não manda WhatsApp nem acorda a IA.

const BUCKET = "whatsapp-media";
const criados: string[] = [];
let clientId = "";

test.beforeAll(async () => {
  clientId = (await tenantDeTeste(servico())).clientId;
});

test.afterAll(async () => {
  if (criados.length) await servico().storage.from(BUCKET).remove(criados);
});

test("sem o segredo: 401", async ({ request }) => {
  const res = await request.post("/api/inbound-media", { data: { client_id: clientId, assinar: true } });
  expect(res.status()).toBe(401);
});

test("texto (sem base64, sem assinar): path null", async ({ request }) => {
  const res = await request.post("/api/inbound-media", {
    headers: { "x-lookup-secret": segredoDoAgente() },
    data: { client_id: clientId, base64: "", mime: "", filename: "", type: "text" },
  });
  expect(await res.json()).toEqual({ path: null, type: null });
});

test("modo base64: a rota sobe o arquivo", async ({ request }) => {
  const conteudo = Buffer.from("e2e base64 " + Date.now());
  const res = await request.post("/api/inbound-media", {
    headers: { "x-lookup-secret": segredoDoAgente() },
    data: { client_id: clientId, base64: conteudo.toString("base64"), mime: "application/pdf", filename: "e2e.pdf", type: "document" },
  });
  const j = await res.json();
  expect(j.type).toBe("document");
  expect(j.path).toMatch(new RegExp(`^${clientId}/in/[0-9a-f-]+\\.pdf$`));
  expect(j.signedUploadUrl).toBeUndefined();
  criados.push(j.path);
  const { data } = await servico().storage.from(BUCKET).download(j.path);
  expect(Buffer.from(await data!.arrayBuffer()).equals(conteudo)).toBe(true);
});

test("modo assinar: devolve URL, o PUT do binário grava e responde Key", async ({ request }) => {
  const res = await request.post("/api/inbound-media", {
    headers: { "x-lookup-secret": segredoDoAgente() },
    data: { client_id: clientId, assinar: true, mime: "video/mp4", filename: "", type: "video" },
  });
  const j = await res.json();
  expect(j.type).toBe("video");
  expect(j.path).toMatch(new RegExp(`^${clientId}/in/[0-9a-f-]+\\.mp4$`));
  expect(typeof j.signedUploadUrl).toBe("string");
  criados.push(j.path);

  // O mesmo PUT que o nó "Envia arquivo" do n8n faz: corpo binário cru.
  // Maior que o limite de corpo da Vercel (4,5 MB), que é o motivo do modo.
  const conteudo = Buffer.alloc(6 * 1024 * 1024, 7);
  const put = await request.put(j.signedUploadUrl, {
    headers: { "content-type": "video/mp4" },
    data: conteudo,
  });
  expect(put.ok()).toBe(true);
  // O n8n só grava media_url quando a resposta do PUT traz `Key`.
  expect((await put.json()).Key).toBe(`${BUCKET}/${j.path}`);

  const { data } = await servico().storage.from(BUCKET).download(j.path);
  expect(data!.size).toBe(conteudo.length);
});
