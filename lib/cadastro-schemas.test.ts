import { describe, expect, it } from "vitest";
import { corpoDoCadastro } from "./cadastro-schemas";

describe("corpo do cadastro (modo sombra)", () => {
  it("o que a tela manda bate; tipo errado é diferença (só para o log)", () => {
    expect(corpoDoCadastro.safeParse({ companyName: "OBS", email: "a@b.co" }).success).toBe(true);
    expect(corpoDoCadastro.safeParse({ companyName: "OBS", email: "a@b.co", extra: 1 }).success).toBe(true);
    expect(corpoDoCadastro.safeParse({ email: 5 }).success).toBe(false);
  });
});
