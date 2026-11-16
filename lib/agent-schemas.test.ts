import { describe, expect, it } from "vitest";
import {
  corpoDaBancada,
  corpoDaConfigDoAgente,
  corpoDasRegras,
  corpoDoConectar,
  corpoDoDestinoDosAvisos,
  corpoDoDocumento,
  corpoDoEnvioDeArquivo,
  corpoDoPublicar,
  formularioDoAudio,
} from "./agent-schemas";

const motivo = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error?.issues[0]?.message);

describe("corpos das rotas do agente, com as frases de antes", () => {
  it("corpo que não é JSON diz 'JSON inválido' em toda rota que dizia", () => {
    for (const e of [corpoDaConfigDoAgente, corpoDasRegras, corpoDoPublicar, corpoDoDestinoDosAvisos, corpoDoDocumento, corpoDoEnvioDeArquivo, corpoDaBancada]) {
      expect(motivo(e.safeParse(null))).toBe("JSON inválido");
    }
  });
  it("agent-config: só guiado, avancado ou horario", () => {
    expect(corpoDaConfigDoAgente.parse({ mode: "guiado", config: { a: 1 } })).toMatchObject({ mode: "guiado", config: { a: 1 } });
    expect(motivo(corpoDaConfigDoAgente.safeParse({ mode: "outro" }))).toBe("modo inválido");
    expect(motivo(corpoDaConfigDoAgente.safeParse({}))).toBe("modo inválido");
    expect(motivo(corpoDaConfigDoAgente.safeParse([]))).toBe("modo inválido");
  });
  it("publish: enabled precisa ser booleano", () => {
    expect(corpoDoPublicar.parse({ enabled: false })).toEqual({ enabled: false });
    expect(motivo(corpoDoPublicar.safeParse({ enabled: "true" }))).toBe("informe enabled");
  });
  it("os campos que o handler confere passam como vieram", () => {
    expect(corpoDasRegras.parse({ texto: 5, pedidoId: "x" })).toEqual({ texto: 5, pedidoId: "x" });
    expect(corpoDoDestinoDosAvisos.parse({ numero: " 11 " })).toEqual({ numero: " 11 " });
    expect(corpoDoEnvioDeArquivo.parse({ filename: "a.pdf", size: 3 })).toEqual({ filename: "a.pdf", size: 3 });
    expect(corpoDaBancada.parse({ message: "oi", history: [] })).toEqual({ message: "oi", history: [] });
  });
  it("connect-whatsapp: sem corpo, ou corpo torto, é o QR", () => {
    expect(corpoDoConectar.parse(null)).toEqual({});
    expect(corpoDoConectar.parse("x")).toEqual({});
    expect(corpoDoConectar.parse({ number: "11" })).toEqual({ number: "11" });
  });
  it("transcrever: áudio vazio ou ausente", () => {
    expect(motivo(formularioDoAudio.safeParse({ audio: null }))).toBe("áudio vazio");
    expect(motivo(formularioDoAudio.safeParse({ audio: new File([], "a.webm") }))).toBe("áudio vazio");
    expect(formularioDoAudio.safeParse({ audio: new File(["x"], "a.webm") }).success).toBe(true);
  });
});
