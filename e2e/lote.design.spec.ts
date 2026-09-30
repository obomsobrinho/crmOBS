import { test, expect } from "@playwright/test";
import { JANELA_DO_LOTE_MS, semLoteAtual } from "../lib/mensagem";
import { escolherVerbatim, type CandidatoVerbatim } from "../lib/painel";

// VÁRIAS MENSAGENS DE UMA VEZ (30/09/2026, achado do dono: "se o cliente mandar
// áudio, msg, áudio, imagem tudo de uma vez, temos que suportar").
//
// O n8n passou a gravar cada mensagem recebida na hora, com a própria mídia, e a
// resposta da IA numa linha separada. Estas são as duas regras do app que
// acompanham essa mudança.

test.describe("Lote atual fora do histórico (lib/mensagem.ts)", () => {
  const agora = Date.parse("2026-09-30T20:20:00Z");
  const ha = (s: number) => new Date(agora - s * 1000).toISOString();

  test("as mensagens do lote que está sendo respondido saem; o passado fica", () => {
    // Da mais nova para a mais antiga, como vem do banco.
    const linhas = [
      { user_message: "[Imagem enviada: um carro]", bot_message: null, created_at: ha(5) },
      { user_message: "e esse aqui?", bot_message: null, created_at: ha(10) },
      { user_message: "transcrição do áudio", bot_message: null, created_at: ha(20) },
      { user_message: null, bot_message: "Claro, me conta mais", created_at: ha(600) },
      { user_message: "Oi", bot_message: null, created_at: ha(620) },
    ];
    const pedido = "transcrição do áudio \n e esse aqui? \n [Imagem enviada: um carro]";
    const r = semLoteAtual(linhas, agora, pedido);
    expect(r.map((l) => l.user_message ?? l.bot_message)).toEqual(["Claro, me conta mais", "Oi"]);
  });

  test("mensagem sem resposta que NÃO veio no pedido fica (a IA não esquece)", () => {
    const linhas = [
      { user_message: "chegou agora", bot_message: null, created_at: ha(5) },
      { user_message: "mandei com a IA pausada", bot_message: null, created_at: ha(60) },
    ];
    const r = semLoteAtual(linhas, agora, "chegou agora");
    expect(r.map((l) => l.user_message)).toEqual(["mandei com a IA pausada"]);
  });

  test("linha antiga (pergunta e resposta juntas) não é cortada", () => {
    const linhas = [{ user_message: "Oi", bot_message: "Olá!", created_at: ha(5) }];
    expect(semLoteAtual(linhas, agora, "Oi")).toHaveLength(1);
  });

  test("mensagem sem resposta mais velha que a janela fica no histórico", () => {
    const velha = ha(JANELA_DO_LOTE_MS / 1000 + 60);
    const linhas = [{ user_message: "mandei ontem", bot_message: null, created_at: velha }];
    expect(semLoteAtual(linhas, agora, "mandei ontem")).toHaveLength(1);
  });
});

test.describe("Frase real do agente com a resposta gravada sozinha (lib/painel.ts)", () => {
  const c = (m: Partial<CandidatoVerbatim> & { created_at: string }): CandidatoVerbatim => ({
    phone: "5511912345678",
    nomewpp: "Ana",
    user_message: null,
    bot_message: null,
    message_type: null,
    ...m,
  });

  test("a pergunta junta as mensagens do cliente desde a resposta anterior", () => {
    const v = escolherVerbatim([
      c({ user_message: "Oi", created_at: "2026-09-30T10:00:00Z" }),
      c({ bot_message: "Olá! Como posso ajudar?", created_at: "2026-09-30T10:00:20Z" }),
      c({ user_message: "Quanto custa a lente com antirreflexo?", created_at: "2026-09-30T10:01:00Z" }),
      c({ user_message: "[Imagem enviada: uma receita de óculos]", created_at: "2026-09-30T10:01:05Z" }),
      c({
        bot_message: "A lente com antirreflexo sai a partir de R$ 250, e com a sua receita dá para fazer em 3 dias úteis.",
        created_at: "2026-09-30T10:01:30Z",
      }),
    ]);
    expect(v?.pergunta).toBe(
      "Quanto custa a lente com antirreflexo?\n[Imagem enviada: uma receita de óculos]"
    );
  });
});
