import { describe, expect, it } from "vitest";
import { corpoDaMidiaRecebida, corpoDoAgente, corpoDoEnvioManual, parametroDaInstancia } from "./schemas";

// Os esquemas em sombra dos webhooks do n8n: o que a rota já aceita hoje tem de bater
// (senão o log enche de falso alarme), e o que ela recusa hoje tem de aparecer.

describe("corpo do /api/agent", () => {
  it("aceita o corpo mínimo e o completo", () => {
    expect(corpoDoAgente.safeParse({ client_id: "c", phone: "5500000000001@s.whatsapp.net", message: "oi" }).success).toBe(true);
    expect(
      corpoDoAgente.safeParse({
        client_id: "c",
        phone: "p",
        message: "oi",
        instance: "i",
        nomewpp: null,
        dryRun: true,
        history: [{ role: "user", content: "oi" }],
        currentStage: null,
        stageSource: "ia",
      }).success,
    ).toBe(true);
  });

  it("acusa o que a rota recusa: sem empresa, sem telefone, mensagem vazia", () => {
    expect(corpoDoAgente.safeParse({ phone: "p", message: "oi" }).success).toBe(false);
    expect(corpoDoAgente.safeParse({ client_id: "c", message: "oi" }).success).toBe(false);
    expect(corpoDoAgente.safeParse({ client_id: "c", phone: "p", message: "   " }).success).toBe(false);
  });

  it("um campo a mais não é diferença (o n8n pode mandar o que a rota ignora)", () => {
    expect(corpoDoAgente.safeParse({ client_id: "c", phone: "p", message: "oi", extra: 1 }).success).toBe(true);
  });
});

describe("corpo do /api/inbound-media", () => {
  it("aceita assinar e aceita base64", () => {
    expect(corpoDaMidiaRecebida.safeParse({ client_id: "c", assinar: true, mime: "audio/ogg" }).success).toBe(true);
    expect(corpoDaMidiaRecebida.safeParse({ client_id: "c", base64: "AAAA", type: "image" }).success).toBe(true);
  });

  it("acusa o pedido que a rota responde com nada", () => {
    expect(corpoDaMidiaRecebida.safeParse({ client_id: "c" }).success).toBe(false);
    expect(corpoDaMidiaRecebida.safeParse({ base64: "AAAA" }).success).toBe(false);
  });
});

describe("parâmetro do by-instance", () => {
  it("exige um nome com conteúdo", () => {
    expect(parametroDaInstancia.safeParse({ instanceName: "obs" }).success).toBe(true);
    expect(parametroDaInstancia.safeParse({ instanceName: " " }).success).toBe(false);
  });
});

describe("o envio manual (varredura do passo 5)", () => {
  it("corpo que não é JSON diz 'JSON inválido'; os campos passam como vieram", () => {
    const r = corpoDoEnvioManual.safeParse(null);
    expect(r.success ? null : r.error.issues[0]?.message).toBe("JSON inválido");
    expect(corpoDoEnvioManual.parse({ phone: "55", text: "oi", pedidoId: 3 })).toEqual({ phone: "55", text: "oi", pedidoId: 3 });
  });
});
