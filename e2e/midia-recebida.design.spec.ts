import { test, expect } from "@playwright/test";
import { caminhoDaMidia, extensaoDaMidia, lerPedidoDeMidia } from "../lib/midia-recebida";

// Regra pura da mídia recebida (`lib/midia-recebida.ts`, 27/10/2026): os dois
// modos da `/api/inbound-media`. A rota contra o Storage de verdade está em
// `midia-recebida.auth.spec.ts`.

const CLIENTE = "00000000-0000-0000-0000-000000000000";

test("sem client_id, corpo vazio ou texto sem base64: nada a subir", () => {
  expect(lerPedidoDeMidia(null)).toEqual({ modo: "nada" });
  expect(lerPedidoDeMidia("x")).toEqual({ modo: "nada" });
  expect(lerPedidoDeMidia({ base64: "aGVsbG8=" })).toEqual({ modo: "nada" });
  expect(lerPedidoDeMidia({ client_id: CLIENTE, base64: "", type: "text" })).toEqual({ modo: "nada" });
});

test("modo base64 (o antigo) continua aceito, inclusive como data URI", () => {
  const p = lerPedidoDeMidia({ client_id: CLIENTE, base64: "data:audio/ogg;base64,aGVsbG8=", mime: "audio/ogg", type: "audio" });
  expect(p.modo).toBe("base64");
  if (p.modo !== "base64") return;
  expect(p.bytes.toString("utf8")).toBe("hello");
  expect(p.type).toBe("audio");
});

test("modo assinar: só os dados do arquivo, sem base64", () => {
  expect(
    lerPedidoDeMidia({ client_id: CLIENTE, assinar: true, mime: "video/mp4", filename: "", type: "video" })
  ).toEqual({ modo: "assinar", clientId: CLIENTE, mime: "video/mp4", filename: "", type: "video" });
  // `assinar` precisa ser exatamente true: a string "false" do n8n não liga o modo.
  expect(lerPedidoDeMidia({ client_id: CLIENTE, assinar: "false", type: "text" })).toEqual({ modo: "nada" });
  // assinar sem mime nem type cai nos padrões
  expect(lerPedidoDeMidia({ client_id: CLIENTE, assinar: true })).toMatchObject({
    modo: "assinar",
    mime: "application/octet-stream",
    type: "document",
  });
});

test("extensão e caminho com o prefixo do tenant", () => {
  expect(extensaoDaMidia("audio/ogg; codecs=opus", "")).toBe("ogg");
  expect(extensaoDaMidia("video/mp4", "")).toBe("mp4");
  expect(extensaoDaMidia("application/octet-stream", "Contrato.DOCX")).toBe("docx");
  expect(extensaoDaMidia("application/x-algo", "")).toBe("xalgo");
  expect(caminhoDaMidia(CLIENTE, "application/pdf", "a.pdf", "abc")).toBe(`${CLIENTE}/in/abc.pdf`);
});
