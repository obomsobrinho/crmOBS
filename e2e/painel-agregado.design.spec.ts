import { test } from "@playwright/test";
import { agregarLinhas, massaDeTeste, NUMERO_AVISOS } from "./painel-agregado-referencia";
import { provarIgualdade } from "./painel-agregado-prova";
import { agregadoDe, montarJanelas } from "../lib/painel-agregado";
import { foraDaLista } from "../lib/inbox-lista";
import { mesFechado, UM_MINUTO } from "../lib/valor";
import type { BusinessHours } from "../lib/agent-prompt";

// O PAINEL SOBRE AGREGAÇÕES CONTA IGUAL AO PAINEL SOBRE LINHAS (02/10/2026, R-04).
// Sem banco: a massa determinística de `painel-agregado-referencia.ts` passa
// pelas funções antigas (resumoDeValor, computeMetrics, barras, barrasDeHora,
// sobre as linhas) e pelas novas (lib/painel-agregado.ts, sobre o formato que
// `painel_janelas` / `painel_series` devolvem, produzido por `agregarLinhas`).
// Tem que dar IDÊNTICO, janela a janela (a comparação está em
// `painel-agregado-prova.ts`). A outra metade da prova, "o SQL dá o mesmo que
// `agregarLinhas`", está em painel-agregado.serial.spec.ts.
//
// Relógio FIXO e quebrado (milissegundos), de propósito: os limites das janelas
// caem no meio de um minuto e de um milissegundo, que é onde um agrupamento
// grosseiro erraria.

const AGORA_US = Date.UTC(2026, 9, 2, 15, 30, 0, 123) * 1000 + 456;
const AGORA = Math.floor(AGORA_US / 1000);

const dia = (o: Partial<BusinessHours["seg"]> = {}) => ({ open: true, from: "08:00", to: "18:00", ...o });
const COMERCIAL: BusinessHours = {
  seg: dia(), ter: dia(), qua: dia(), qui: dia(), sex: dia(),
  sab: dia({ to: "12:30" }), dom: dia({ open: false }),
};
const NOITE: BusinessHours = {
  seg: dia({ from: "22:00", to: "02:00" }), ter: dia({ from: "22:00", to: "02:00" }),
  qua: dia({ from: "22:00", to: "02:00" }), qui: dia({ from: "22:00", to: "02:00" }),
  sex: dia({ from: "22:00", to: "02:00" }), sab: dia({ open: false }), dom: dia({ open: false }),
};

for (const [nome, hours] of [
  ["horário comercial", COMERCIAL],
  ["faixa que vira a meia-noite", NOITE],
  ["sem horário", null],
] as const) {
  test(`contas sobre agregações = contas sobre linhas (${nome})`, () => {
    const { msgs, quals } = massaDeTeste(AGORA_US, "5500000080");
    const mes = mesFechado(new Date(AGORA));
    const mesMs = { inicioMs: Date.parse(mes.inicioISO), fimMs: Date.parse(mes.fimISO) };
    const plano = montarJanelas(AGORA, { "14": 14, "30": 30 }, mesMs);
    const ref = agregarLinhas({
      msgs, quals, fora: foraDaLista(NUMERO_AVISOS), agora: AGORA,
      de: plano.lista.map((j) => j.de), ate: plano.lista.map((j) => j.ate),
      horasDe: AGORA - 2 * 864e5, mes: { de: mesMs.inicioMs, ate: mesMs.fimMs },
      rapidaMs: UM_MINUTO,
    });
    provarIgualdade({
      agregado: agregadoDe(ref.janelas, ref.series),
      msgs, quals, plano, agora: AGORA, hours,
    });
  });
}
