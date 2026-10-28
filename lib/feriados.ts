// FERIADOS NACIONAIS DO BRASIL, calculados no código (decisão do dono,
// 28/10/2026: fixos e móveis, sem API externa). MÓDULO PURO.
//
// Nacionais (lei): os fixos e a Sexta-feira Santa (Páscoa menos 2 dias).
// Pontos facultativos nacionais (Carnaval e Corpus Christi) aparecem marcados,
// mas NÃO bloqueiam (decisão do dono, 28/10/2026: "Não bloqueiam"); quem fecha
// nesses dias usa o bloqueio de dias inteiros da agenda.
// Feriado estadual e municipal fica com o bloqueio de período da agenda.

export interface Feriado {
  /** AAAA-MM-DD */
  dia: string;
  nome: string;
  tipo: "nacional" | "facultativo";
}

const FIXOS: [string, string][] = [
  ["01-01", "Confraternização Universal"],
  ["04-21", "Tiradentes"],
  ["05-01", "Dia do Trabalho"],
  ["09-07", "Independência do Brasil"],
  ["10-12", "Nossa Senhora Aparecida"],
  ["11-02", "Finados"],
  ["11-15", "Proclamação da República"],
  ["11-20", "Dia da Consciência Negra"],
  ["12-25", "Natal"],
];

/** Domingo de Páscoa (algoritmo de Meeus, calendário gregoriano). */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function somar(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

const porAno = new Map<number, Feriado[]>();

/** Os feriados nacionais e os pontos facultativos de um ano, em ordem. */
export function feriadosDoAno(ano: number): Feriado[] {
  const pronto = porAno.get(ano);
  if (pronto) return pronto;
  const p = pascoa(ano);
  const lista = ([
    ...FIXOS.map(([md, nome]) => ({ dia: `${ano}-${md}`, nome, tipo: "nacional" as const })),
    { dia: somar(p, -2), nome: "Sexta-feira Santa", tipo: "nacional" as const },
    { dia: somar(p, -48), nome: "Carnaval", tipo: "facultativo" as const },
    { dia: somar(p, -47), nome: "Carnaval", tipo: "facultativo" as const },
    { dia: somar(p, 60), nome: "Corpus Christi", tipo: "facultativo" as const },
  ] satisfies Feriado[]).sort((x, y) => x.dia.localeCompare(y.dia));
  porAno.set(ano, lista);
  return lista;
}

/** O feriado (ou ponto facultativo) de um dia, ou null. */
export function feriadoDoDia(dia: string): Feriado | null {
  return feriadosDoAno(Number(dia.slice(0, 4))).find((f) => f.dia === dia) ?? null;
}
