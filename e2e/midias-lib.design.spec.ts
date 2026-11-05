import { test, expect } from "@playwright/test";
import {
  blocoDeMidias,
  campoMidiaDoEsquema,
  caminhoDaMidiaValido,
  catalogoDasLinhas,
  chavesParaOModelo,
  escolherMidia,
  marcaDeMidiaEnviada,
  midiaDaSaida,
  midiasDisponiveis,
} from "../lib/midias";
import { MIDIA_DA_IA, ehMidiaDaIa, respostaDaIa, respostaHumana } from "../lib/mensagem";
import { TABELAS_DO_CLIENTE } from "../lib/admin-purga";
import { rowsToBubbles } from "../components/thread/bolhas";

// Mídias do agente (04/11/2026, lib/midias.ts): o modelo escolhe pela descrição,
// o código confere o catálogo e manda cada mídia no máximo uma vez por conversa.

const EMPRESA = "11111111-2222-3333-4444-555555555555";
const linha = (o: Partial<Parameters<typeof catalogoDasLinhas>[1][number]> = {}) => ({
  chave: "como_funciona",
  tipo: "video",
  path: `${EMPRESA}/biblioteca/como-funciona.mp4`,
  mime: "video/mp4",
  nome_arquivo: "como-funciona.mp4",
  descricao: "Vídeo de 1 minuto mostrando o atendimento respondendo no WhatsApp.",
  quando_enviar: "quando a pessoa pergunta como funciona.",
  legenda: "",
  ...o,
});

test.describe("lib/midias: catálogo", () => {
  test("só entra mídia da própria empresa, na pasta da biblioteca, com chave, tipo e descrição", () => {
    const cat = catalogoDasLinhas(EMPRESA, [
      linha(),
      linha({ chave: "outra_empresa", path: "99999999-0000-0000-0000-000000000000/biblioteca/x.mp4" }),
      linha({ chave: "fora_da_pasta", path: `${EMPRESA}/outra/x.mp4` }),
      linha({ chave: "subindo", path: `${EMPRESA}/biblioteca/../x.mp4` }),
      linha({ chave: "Chave Torta" }),
      linha({ chave: "audio", tipo: "audio" }),
      linha({ chave: "sem_descricao", descricao: "  " }),
      linha({ chave: "sem_quando", quando_enviar: "" }),
      linha({ chave: "como_funciona", descricao: "repetida" }),
      linha({ chave: "foto_painel", tipo: "image", path: `${EMPRESA}/biblioteca/painel.png`, mime: "" }),
    ]);
    expect(cat.map((m) => m.chave)).toEqual(["como_funciona", "foto_painel"]);
    expect(cat[0].descricao).toContain("1 minuto");
    // Mime vazio ganha o padrão do tipo.
    expect(cat[1].mime).toBe("image/jpeg");
    expect(caminhoDaMidiaValido("", `${EMPRESA}/biblioteca/x.mp4`)).toBe(false);
  });

  test("no máximo 5 mídias no prompt", () => {
    const muitas = Array.from({ length: 8 }, (_, i) => linha({ chave: `m${i}`, path: `${EMPRESA}/biblioteca/${i}.mp4` }));
    expect(catalogoDasLinhas(EMPRESA, muitas)).toHaveLength(5);
  });
});

test.describe("lib/midias: uma vez por conversa e validação da saída", () => {
  const catalogo = catalogoDasLinhas(EMPRESA, [linha(), linha({ chave: "foto_painel", tipo: "image", path: `${EMPRESA}/biblioteca/painel.png` })]);
  const base = { catalogo, enviadas: [] as string[], guardrailBarrou: false, retomada: false };

  test("a chave do catálogo vale; qualquer outra coisa vira nada", () => {
    expect(escolherMidia({ ...base, escolhida: "como_funciona" })?.path).toBe(`${EMPRESA}/biblioteca/como-funciona.mp4`);
    expect(escolherMidia({ ...base, escolhida: "inventada" })).toBeNull();
    expect(escolherMidia({ ...base, escolhida: "" })).toBeNull();
    expect(midiaDaSaida("  como_funciona ")).toBe("como_funciona");
    expect(midiaDaSaida("https://exemplo.com/video.mp4")).toBe("");
    expect(midiaDaSaida(42)).toBe("");
    expect(midiaDaSaida(undefined)).toBe("");
  });

  test("já enviada (pelo caminho gravado em produção ou pela chave do teste) não vai de novo", () => {
    expect(escolherMidia({ ...base, escolhida: "como_funciona", enviadas: [`${EMPRESA}/biblioteca/como-funciona.mp4`] })).toBeNull();
    expect(escolherMidia({ ...base, escolhida: "como_funciona", enviadas: ["como_funciona"] })).toBeNull();
    // A outra continua disponível.
    expect(escolherMidia({ ...base, escolhida: "foto_painel", enviadas: ["como_funciona"] })?.chave).toBe("foto_painel");
    expect(midiasDisponiveis(catalogo, ["como_funciona"]).map((m) => m.chave)).toEqual(["foto_painel"]);
  });

  test("guardrail barrando ou turno de retomada: nunca manda", () => {
    expect(escolherMidia({ ...base, escolhida: "como_funciona", guardrailBarrou: true })).toBeNull();
    expect(escolherMidia({ ...base, escolhida: "como_funciona", retomada: true })).toBeNull();
  });

  test("o esquema só ganha o campo com chave disponível, e o enum é só o catálogo", () => {
    expect(campoMidiaDoEsquema([])).toBeNull();
    expect(campoMidiaDoEsquema([""])).toBeNull();
    expect(campoMidiaDoEsquema(chavesParaOModelo(catalogo))?.enum).toEqual(["como_funciona", "foto_painel", ""]);
    expect(campoMidiaDoEsquema(["como_funciona", "como_funciona", "Torta"])?.enum).toEqual(["como_funciona", ""]);
  });
});

test.describe("lib/midias: prompt e histórico", () => {
  const catalogo = catalogoDasLinhas(EMPRESA, [linha()]);

  test("o bloco lista a descrição e quando enviar; sem mídia disponível, não existe", () => {
    const bloco = blocoDeMidias(catalogo)!;
    expect(bloco.startsWith("### MÍDIAS PARA ENVIAR")).toBe(true);
    expect(bloco).toContain("- como_funciona (vídeo): Vídeo de 1 minuto");
    expect(bloco).toContain("Quando enviar: quando a pessoa pergunta como funciona.");
    expect(bloco).toContain("cada uma só uma vez na conversa");
    expect(blocoDeMidias([])).toBeNull();
    expect(blocoDeMidias(midiasDisponiveis(catalogo, ["como_funciona"]))).toBeNull();
    // Regra de escrita: sem travessão em texto do prompt.
    expect(bloco).not.toMatch(/[–—]/);
  });

  test("a mídia enviada vira uma fala da empresa no histórico", () => {
    expect(marcaDeMidiaEnviada(catalogo[0])).toBe("[Vídeo enviado pela empresa: como_funciona. Vídeo de 1 minuto mostrando o atendimento respondendo no WhatsApp.]");
    expect(marcaDeMidiaEnviada({ tipo: "image", chave: "foto", descricao: "O painel." })).toBe("[Imagem enviada pela empresa: foto. O painel.]");
    expect(marcaDeMidiaEnviada(null)).toBe("[Mídia enviada pela empresa]");
  });
});

test.describe("lib/midias: métricas, conversa e purga", () => {
  const midia = { bot_message: null, message_type: MIDIA_DA_IA };

  test("a mídia da IA não conta como resposta da IA nem do time", () => {
    expect(ehMidiaDaIa(MIDIA_DA_IA)).toBe(true);
    expect(respostaDaIa(midia)).toBe(false);
    expect(respostaHumana(midia)).toBe(false);
  });

  test("na conversa é um balão enviado da IA, com a mídia, nunca recebido do contato", () => {
    const bolhas = rowsToBubbles([
      { id: 7, phone: "5511900000000", nomewpp: null, user_message: null, active: null, created_at: "2026-11-04T12:00:00Z", media_url: `${EMPRESA}/biblioteca/como-funciona.mp4`, media_type: "video", ...midia },
    ]);
    expect(bolhas).toHaveLength(1);
    expect(bolhas[0]).toMatchObject({ side: "out", author: "ia", content: "", mediaType: "video" });
  });

  test("agent_midias sai no Apagar de vez", () => {
    expect(TABELAS_DO_CLIENTE).toContain("agent_midias");
  });
});
