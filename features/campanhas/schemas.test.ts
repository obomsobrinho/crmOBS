import { describe, expect, it } from "vitest";
import {
  consultaDaBusca,
  consultaDasCampanhas,
  consultaDaPrevia,
  consultaDosLeads,
  consultaDosResultados,
  corpoDaAcao,
  corpoDaMarcacao,
  corpoDaNovaBusca,
  corpoDoRascunho,
  corpoDoTelefone,
  formularioDaPlanilha,
} from "./schemas";

// Os esquemas das rotas de Campanhas recusam com a MESMA frase de antes do Zod
// (a tela mostra o motivo) e entregam o que o servidor já recebia.
const motivo = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error?.issues[0]?.message);
const ID = "3f0c8f5e-8a51-4c1f-9a3e-2b1f6f0d9a10";

describe("consultas", () => {
  it("página, texto e situação, com os padrões de antes", () => {
    expect(consultaDasCampanhas.parse({})).toEqual({ com_envio: undefined, pagina: 1, texto: "", situacao: null });
    expect(consultaDasCampanhas.parse({ pagina: "3", texto: "  ab ", situacao: "rodando" })).toMatchObject({ pagina: 3, texto: "ab", situacao: "rodando" });
    expect(motivo(consultaDasCampanhas.safeParse({ pagina: "0" }))).toBe("página inválida");
    expect(motivo(consultaDasCampanhas.safeParse({ situacao: "x" }))).toBe("situação inválida");
  });
  it("busca e campanha opcionais, uuid ou recusa", () => {
    expect(consultaDaBusca.parse({})).toEqual({ busca: null });
    expect(consultaDaBusca.parse({ busca: ID })).toEqual({ busca: ID });
    expect(motivo(consultaDaBusca.safeParse({ busca: "1" }))).toBe("busca inválida");
    expect(motivo(consultaDosResultados.safeParse({ campanha: "x" }))).toBe("campanha inválida");
    expect(motivo(consultaDosResultados.safeParse({ periodo: "ano" }))).toBe("período inválido");
  });
  it("leads: o recorte, os pedidos de filtro e a página", () => {
    const r = consultaDosLeads.parse({ cidades: "1", texto: "padaria", filtros: "bons" });
    expect(r.cidades).toBe(true);
    expect(r.categorias).toBe(false);
    expect(r.recorte).toMatchObject({ texto: "padaria", filtros: ["bons"], site: "todos" });
    expect(consultaDosLeads.parse({ pagina: "x" }).pagina).toBeNull();
    expect(motivo(consultaDosLeads.safeParse({ filtros: "outro" }))).toBe("filtro inválido");
  });
  it("prévia: o recorte do passo Contatos", () => {
    expect(consultaDaPrevia.parse({ bons: "1" })).toMatchObject({ buscaId: "todas", soMarcadosComoBons: true, soSemSiteProprio: false });
    expect(motivo(consultaDaPrevia.safeParse({ origem: "x" }))).toBe("recorte inválido");
  });
});

describe("corpos", () => {
  it("marcação: bom, descartado ou null", () => {
    expect(corpoDaMarcacao.parse({ marcacao: null })).toEqual({ marcacao: null });
    expect(corpoDaMarcacao.parse({ marcacao: "bom" })).toEqual({ marcacao: "bom" });
    expect(motivo(corpoDaMarcacao.safeParse({}))).toBe("marcação inválida");
    expect(motivo(corpoDaMarcacao.safeParse(null))).toBe("marcação inválida");
  });
  it("telefone: o celular no formato do lead, ou o motivo da tela", () => {
    expect(motivo(corpoDoTelefone.safeParse({}))).toBe("telefone inválido");
    expect(motivo(corpoDoTelefone.safeParse({ telefone: "123" }))).toBeTruthy();
  });
  it("ação e rascunho", () => {
    expect(corpoDaAcao.parse({ acao: "pausar" })).toEqual({ acao: "pausar" });
    expect(motivo(corpoDaAcao.safeParse({ acao: "apagar" }))).toBe("ação inválida");
    expect(motivo(corpoDoRascunho(ID).safeParse({ nome: 1 }))).toBe("rascunho inválido");
  });
  it("nova busca: opções tortas", () => {
    expect(motivo(corpoDaNovaBusca.safeParse({ opcoes: {} }))).toBe("opções da busca inválidas");
    expect(motivo(corpoDaNovaBusca.safeParse(null))).toBe("opções da busca inválidas");
  });
  it("planilha: arquivo, tamanho, extensão e o nome padrão", () => {
    expect(motivo(formularioDaPlanilha.safeParse({}))).toBe("falta o arquivo");
    const grande = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "a.xlsx");
    expect(motivo(formularioDaPlanilha.safeParse({ arquivo: grande }))).toBe("O arquivo passa de 4 MB. Divida a planilha em partes.");
    expect(motivo(formularioDaPlanilha.safeParse({ arquivo: new File(["x"], "a.csv") }))).toBe("Envie uma planilha do Excel (.xlsx).");
    expect(formularioDaPlanilha.parse({ arquivo: new File(["x"], "b.xlsx"), confirmar: "1" })).toMatchObject({ confirmar: true, nome: "Planilha b.xlsx" });
  });
});
