import { describe, expect, it } from "vitest";
import { consultaDaLista, consultaDosPedidos, corpoDaConta, corpoDoApagar, corpoDoLimite } from "./schemas";

const motivo = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error?.issues[0]?.message);
const UUID = "00000000-0000-4000-8000-000000000001";

describe("entradas das rotas da central, com as frases de antes", () => {
  it("lista: cursor e situação conferidos, nessa ordem", () => {
    expect(consultaDaLista.parse({ busca: "zé", depoisId: UUID, situacao: "active" })).toMatchObject({ busca: "zé" });
    expect(motivo(consultaDaLista.safeParse({ depoisId: "x", situacao: "x" }))).toBe("cursor inválido");
    expect(motivo(consultaDaLista.safeParse({ situacao: "x" }))).toBe("situação inválida");
  });
  it("pedidos: sem cursor é a primeira página; cursor torto é 'cursor inválido'", () => {
    expect(consultaDosPedidos.parse({})).toBeNull();
    expect(motivo(consultaDosPedidos.safeParse({ em: "ontem", id: "x" }))).toBe("cursor inválido");
  });
  it("conta: a frase de pedidoDeAcao", () => {
    expect(motivo(corpoDaConta.safeParse(null))).toBe("corpo inválido");
    expect(motivo(corpoDaConta.safeParse({ acao: "voar" }))).toBe("ação inválida");
  });
  it("limite: inteiro positivo ou null", () => {
    expect(corpoDoLimite.parse({ limite: null })).toEqual({ limite: null });
    expect(corpoDoLimite.parse({ limite: 10 })).toEqual({ limite: 10 });
    expect(motivo(corpoDoLimite.safeParse({ limite: 0 }))).toMatch(/^limite inválido/);
    expect(motivo(corpoDoLimite.safeParse(null))).toBe("JSON inválido");
  });
  it("apagar: o nome vai como veio; vazio pede o nome", () => {
    expect(corpoDoApagar.parse({ nome: " OBS " })).toEqual({ nome: " OBS " });
    expect(motivo(corpoDoApagar.safeParse({ nome: "  " }))).toBe("digite o nome do cliente para confirmar");
    expect(motivo(corpoDoApagar.safeParse({}))).toBe("digite o nome do cliente para confirmar");
  });
});
