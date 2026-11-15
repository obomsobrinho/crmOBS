import { describe, expect, it } from "vitest";
import { consultaDoCronDeLembretes } from "./schemas";

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
