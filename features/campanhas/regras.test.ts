import { describe, expect, it } from "vitest";
import { ehHoraDaLimpeza } from "./regras";
import { minutosAgoraSP } from "@/lib/horarios";

describe("limpeza dos leads antigos, uma vez por dia (D12)", () => {
  it("só o tick das 03h00 (São Paulo) limpa; os outros 287 do dia não", () => {
    const ticks = Array.from({ length: 288 }, (_, i) => i * 5);
    expect(ticks.filter(ehHoraDaLimpeza)).toEqual([180]);
  });
  it("03h00 em São Paulo é 06h00 UTC", () => {
    expect(ehHoraDaLimpeza(minutosAgoraSP(new Date("2026-11-14T06:00:00Z")))).toBe(true);
    expect(ehHoraDaLimpeza(minutosAgoraSP(new Date("2026-11-14T06:05:00Z")))).toBe(false);
  });
});
