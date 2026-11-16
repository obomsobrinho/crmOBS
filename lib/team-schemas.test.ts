import { describe, expect, it } from "vitest";
import { corpoDoConvite, corpoDoRemover } from "./team-schemas";

const motivo = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error?.issues[0]?.message);

describe("corpos das rotas de equipe, com as frases de antes", () => {
  it("convite: e-mail aparado e em minúsculas, papel dono ou atendente", () => {
    expect(corpoDoConvite.parse({ email: " Ana@X.com ", role: "atendente" })).toEqual({ email: "ana@x.com", role: "atendente" });
    expect(motivo(corpoDoConvite.safeParse(null))).toBe("JSON inválido");
    expect(motivo(corpoDoConvite.safeParse({ email: "ana", role: "dono" }))).toBe("e-mail inválido");
    expect(motivo(corpoDoConvite.safeParse({ role: "dono" }))).toBe("e-mail inválido");
    expect(motivo(corpoDoConvite.safeParse([]))).toBe("e-mail inválido");
    expect(motivo(corpoDoConvite.safeParse({ email: "a@b.co", role: "admin" }))).toBe("papel inválido");
    // O e-mail vem antes do papel, como na rota.
    expect(motivo(corpoDoConvite.safeParse({ email: "x", role: "x" }))).toBe("e-mail inválido");
  });
  it("remover: userId aparado e obrigatório", () => {
    expect(corpoDoRemover.parse({ userId: " u1 " })).toEqual({ userId: "u1" });
    expect(motivo(corpoDoRemover.safeParse(null))).toBe("JSON inválido");
    expect(motivo(corpoDoRemover.safeParse({ userId: "  " }))).toBe("userId é obrigatório");
    expect(motivo(corpoDoRemover.safeParse({}))).toBe("userId é obrigatório");
  });
});
