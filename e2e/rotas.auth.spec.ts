import { test, expect } from "@playwright/test";
import { servico, tenantDeTeste } from "./semente";

// ENDURECIMENTO DAS ROTAS (F5, 01/10/2026), a parte que exige sessão. Nada aqui
// escreve no banco nem manda mensagem: todas as provas são RECUSAS, que saem
// antes de qualquer envio ou gravação.

let clientId = "";

test.beforeAll(async () => {
  ({ clientId } = await tenantDeTeste(servico()));
});

test.describe("/api/send só assina mídia do próprio tenant (R-09)", () => {
  const OUTRO_TENANT = "00000000-0000-0000-0000-000000000000";
  const mandar = (
    request: import("@playwright/test").APIRequestContext,
    media: Record<string, string>
  ) =>
    request.post("/api/send", {
      data: { phone: "5500000000001@s.whatsapp.net", text: "x", aceite: true, media },
    });

  test("caminho de outro tenant dá 400", async ({ request }) => {
    const res = await mandar(request, { path: `${OUTRO_TENANT}/out/a.png`, type: "image" });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("mídia inválida");
  });

  test("bucket da base de conhecimento dá 400, mesmo com o prefixo certo", async ({ request }) => {
    const res = await mandar(request, {
      bucket: "knowledge",
      path: `${clientId}/doc.pdf`,
      type: "document",
    });
    expect(res.status()).toBe(400);
  });

  test("caminho com .. dá 400", async ({ request }) => {
    const res = await mandar(request, {
      path: `${clientId}/../${OUTRO_TENANT}/out/a.png`,
      type: "image",
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("orientação pendente pela rota (R-34 do plano, instrucao)", () => {
  test("exige phone e texto, e recusa texto acima do teto", async ({ request }) => {
    const semFone = await request.post("/api/conversations/instrucao", {
      data: { instruction: "oi" },
    });
    expect(semFone.status()).toBe(400);
    const longa = await request.post("/api/conversations/instrucao", {
      data: { phone: "5500000000001@s.whatsapp.net", instruction: "a".repeat(2001) },
    });
    expect(longa.status()).toBe(400);
  });
});

test("o dono não é barrado por papel nas rotas que ele já usava", async ({ request }) => {
  // O helper não pode ter endurecido nada além do combinado: o dono do tenant de
  // teste, com a conta ativa, passa pelo gate de `team/invite` (ele recusa por
  // OUTRO motivo, o corpo vazio, e não por 401, 403 ou 402).
  const res = await request.post("/api/team/invite", { data: {} });
  expect(res.status()).toBe(400);
});
