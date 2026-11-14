import { describe, expect, it } from "vitest";
import { corpoDoOrientar, corpoDoResolver } from "./schemas";

const motivo = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error?.issues[0]?.message);

describe("corpos das rotas que fecham um pedido", () => {
  it("resolver: telefone aparado e obrigatório, pedidoId só número", () => {
    expect(corpoDoResolver.parse({ phone: " 55 ", pedidoId: 4 })).toEqual({ phone: "55", pedidoId: 4 });
    expect(corpoDoResolver.parse({ phone: "55", pedidoId: "4" })).toEqual({ phone: "55", pedidoId: null });
    expect(motivo(corpoDoResolver.safeParse({}))).toBe("phone é obrigatório");
    expect(motivo(corpoDoResolver.safeParse(null))).toBe("phone é obrigatório");
  });
  it("orientar: telefone e orientação obrigatórios, com a frase de antes", () => {
    expect(corpoDoOrientar.parse({ phone: "55", instruction: " diga sim " })).toEqual({ phone: "55", instruction: "diga sim", pedidoId: null });
    expect(motivo(corpoDoOrientar.safeParse({ phone: "55" }))).toBe("phone e instruction são obrigatórios");
    expect(motivo(corpoDoOrientar.safeParse({ phone: 5, instruction: "x" }))).toBe("phone e instruction são obrigatórios");
  });
});
