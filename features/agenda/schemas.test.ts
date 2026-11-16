import { describe, expect, it } from "vitest";
import { consultaDoBloqueio, consultaDoCronDeLembretes, consultaDosHorarios, corpoDaConfigDaAgenda, corpoDaMudancaDoAgendamento, corpoDoAgendamento, corpoDoBloqueio } from "./schemas";

describe("query do cron de lembretes (modo sombra)", () => {
  it("aceita o que o Vercel Cron e a própria rota mandam", () => {
    expect(consultaDoCronDeLembretes.safeParse({}).success).toBe(true);
    expect(consultaDoCronDeLembretes.safeParse({ continuacao: "1" }).success).toBe(true);
  });
  it("aponta o que foge do formato (só para o log)", () => {
    expect(consultaDoCronDeLembretes.safeParse({ continuacao: "sim" }).success).toBe(false);
    expect(consultaDoCronDeLembretes.safeParse({ outra: "1" }).success).toBe(false);
  });
});

describe("as rotas da agenda que a tela chama (varredura do passo 5)", () => {
  const motivo = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error?.issues[0]?.message);
  it("corpo que não é JSON diz 'JSON inválido'; os campos passam como vieram", () => {
    for (const e of [corpoDoAgendamento, corpoDaMudancaDoAgendamento, corpoDoBloqueio, corpoDaConfigDaAgenda]) {
      expect(motivo(e.safeParse(null))).toBe("JSON inválido");
    }
    expect(corpoDoAgendamento.parse({ servicoId: "3", inicio: 1 })).toEqual({ servicoId: "3", inicio: 1 });
    expect(consultaDosHorarios.parse({ servico: "2", dia: "2026-11-16" })).toEqual({ servico: "2", dia: "2026-11-16" });
    expect(consultaDoBloqueio.parse({})).toEqual({});
  });
});
