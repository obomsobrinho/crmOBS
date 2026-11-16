import { describe, expect, it } from "vitest";
import { corpoDaAssinatura, corpoDoCancelamento } from "./billing-schemas";

const motivo = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error?.issues[0]?.message);

describe("corpos da assinatura, com as frases de antes", () => {
  it("assinar: JSON e plano antes de tudo; o resto passa como veio", () => {
    expect(corpoDaAssinatura.parse({ plan: "essencial", cpfCnpj: "123", email: "A@b.co" })).toEqual({
      plan: "essencial",
      cpfCnpj: "123",
      email: "A@b.co",
    });
    expect(motivo(corpoDaAssinatura.safeParse(null))).toBe("JSON inválido");
    expect(motivo(corpoDaAssinatura.safeParse({ plan: "ouro" }))).toBe("plano inválido");
    expect(motivo(corpoDaAssinatura.safeParse({}))).toBe("plano inválido");
  });
  it("cancelar: o motivo é opcional e nunca recusa", () => {
    expect(corpoDoCancelamento.parse(null)).toEqual({ motivo: "" });
    expect(corpoDoCancelamento.parse({ motivo: 5 })).toEqual({ motivo: "" });
    expect(corpoDoCancelamento.parse({ motivo: "  caro " })).toEqual({ motivo: "caro" });
    expect(corpoDoCancelamento.parse({ motivo: "x".repeat(600) }).motivo).toHaveLength(500);
  });
});
