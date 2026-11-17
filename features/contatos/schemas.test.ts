import { describe, expect, it } from "vitest";
import { corpoDoNovoContato } from "./schemas";

describe("corpo do novo contato", () => {
  it("corpo que não é JSON diz 'JSON inválido'; os campos passam como vieram (o handler confere)", () => {
    const r = corpoDoNovoContato.safeParse(null);
    expect(r.success ? null : r.error.issues[0]?.message).toBe("JSON inválido");
    expect(corpoDoNovoContato.parse({ telefone: "11 9", nome: 3 })).toEqual({ telefone: "11 9", nome: 3 });
    expect(corpoDoNovoContato.parse([1])).toEqual({});
  });
});
