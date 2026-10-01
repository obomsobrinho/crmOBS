import { test, expect } from "@playwright/test";
import { citaDia, diaDosHorarios, horariosCitados, minutosAgoraSP, notaDeHorarios } from "../lib/horarios";

// A CONTA DE HORÁRIO É DO CÓDIGO (lib/horarios.ts, 01/10/2026): o modelo errava
// para os dois lados ("hoje às 16h" às 22h, "amanhã" às 10h). Aqui a regra pura.

const NOITE = new Date("2026-09-30T22:05:00-03:00");
const MANHA = new Date("2026-09-30T10:00:00-03:00");

test.describe("Horários citados (lib/horarios.ts)", () => {
  test("lê as formas com número e ignora o que não é horário", () => {
    expect(horariosCitados("tenho disponibilidade as 16hrs")).toEqual([960]);
    expect(horariosCitados("pode ser 16h30 ou 18:00")).toEqual([990, 1080]);
    expect(horariosCitados("às 9 eu chego, depois 14 horas")).toEqual([540, 840]);
    expect(horariosCitados("desconto de 10% em 12 vezes")).toEqual([]);
    expect(horariosCitados("às seis")).toEqual([]);
  });

  test("minutos em São Paulo, não no fuso da máquina", () => {
    expect(minutosAgoraSP(NOITE)).toBe(22 * 60 + 5);
    expect(minutosAgoraSP(new Date("2026-10-01T02:30:00Z"))).toBe(23 * 60 + 30);
  });

  test("à noite 16h já passou (amanhã); de manhã ainda vem (hoje)", () => {
    expect(diaDosHorarios("tenho disponibilidade as 16hrs", NOITE)).toBe("amanhã às 16h");
    expect(diaDosHorarios("tenho disponibilidade as 16hrs", MANHA)).toBe("hoje às 16h");
    expect(notaDeHorarios("as 16hrs", NOITE)).toContain("já passou");
    expect(notaDeHorarios("as 16hrs", MANHA)).toContain("ainda não chegou");
    expect(notaDeHorarios("sem horário nenhum", NOITE)).toBeNull();
  });

  test("orientação que já diz o dia não ganha palpite", () => {
    expect(citaDia("amanhã às 16h")).toBe(true);
    expect(citaDia("quinta às 16h")).toBe(true);
    expect(citaDia("dia 02/10 às 16h")).toBe(true);
    expect(diaDosHorarios("quinta às 16h", NOITE)).toBeNull();
  });
});
