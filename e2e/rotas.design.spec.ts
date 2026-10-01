import { test, expect } from "@playwright/test";

// ENDURECIMENTO DAS ROTAS (F5, 01/10/2026). Sem login e sem escrever nada:
// prova que as rotas de sessão respondem 401 pela mesma porta (`sessaoDaRota`),
// que as de segredo recusam sem o header, e que os cabeçalhos de segurança
// saem. O que exige sessão (mídia de outro tenant em `/api/send`, 402 de conta
// bloqueada) está em `rotas.auth.spec.ts`.

const ROTAS_DE_SESSAO: { metodo: "POST" | "PUT" | "DELETE"; url: string }[] = [
  { metodo: "POST", url: "/api/send" },
  { metodo: "POST", url: "/api/contacts" },
  { metodo: "POST", url: "/api/conversations/orientar" },
  { metodo: "POST", url: "/api/conversations/resolve" },
  { metodo: "POST", url: "/api/conversations/instrucao" },
  { metodo: "DELETE", url: "/api/conversations/instrucao" },
  { metodo: "POST", url: "/api/team/invite" },
  { metodo: "POST", url: "/api/team/remove" },
  { metodo: "POST", url: "/api/playground" },
  { metodo: "POST", url: "/api/clients/00000000-0000-0000-0000-000000000000/connect-whatsapp" },
  { metodo: "PUT", url: "/api/clients/00000000-0000-0000-0000-000000000000/agent-config" },
];

for (const { metodo, url } of ROTAS_DE_SESSAO) {
  test(`${metodo} ${url} sem sessão responde 401`, async ({ request }) => {
    const res = await request.fetch(url, { method: metodo, data: {} });
    // `/api/send` confere a configuração do n8n antes da sessão (500 sem a
    // variável); em qualquer ambiente com ela, é 401.
    expect([401, 500]).toContain(res.status());
    if (res.status() === 401) {
      expect(await res.json()).toEqual({ error: "não autenticado" });
    }
  });
}

test("rotas protegidas por segredo recusam sem o header", async ({ request }) => {
  const agente = await request.post("/api/agent", { data: {} });
  expect(agente.status()).toBe(401);
  const media = await request.post("/api/inbound-media", { data: {} });
  expect(media.status()).toBe(401);
  const instancia = await request.get("/api/clients/by-instance/qualquer");
  expect(instancia.status()).toBe(401);
  const errado = await request.post("/api/agent", {
    data: {},
    headers: { "x-lookup-secret": "segredo-errado" },
  });
  expect(errado.status()).toBe(401);
});

test("as páginas saem com os cabeçalhos de segurança", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("microphone=(self)");
});
