import { ehImportada, respostaDaIa, respostaHumana } from "../lib/mensagem";
import { primeirasMensagens } from "../lib/metrics";
import type {
  JanelaAgregada,
  SeriesAgregadas,
} from "../lib/painel-agregado";
import { parteLocal } from "../lib/valor";

// A REFERÊNCIA EXECUTÁVEL DAS FUNÇÕES `painel_janelas` E `painel_series`
// (supabase/migrations/20261002200100_...). Recebe as MESMAS linhas que o banco
// agrega e devolve o MESMO formato, usando só `lib/mensagem.ts` e `lib/valor.ts`
// para a regra. Dois usos:
//   - e2e/painel-agregado.design.spec.ts (sem banco): prova que as contas sobre as
//     agregações (lib/painel-agregado.ts) dão EXATAMENTE o que as funções sobre
//     linhas (resumoDeValor, computeMetrics, barras, barrasDeHora) davam;
//   - e2e/painel-agregado.serial.spec.ts (com banco): prova que o SQL dá o mesmo
//     que esta referência, linha a linha do resultado, e portanto concorda com
//     `lib/mensagem.ts` (a regra "quem respondeu" escrita em SQL, R-18).

export interface LinhaRef {
  phone: string;
  created_at: string;
  message_type: string | null;
  user_message: string | null;
  bot_message: string | null;
}

export interface QualRef {
  phone: string;
  action: string | null;
  created_at: string;
}

export interface EntradaRef {
  msgs: LinhaRef[];
  quals: QualRef[];
  /** As grafias do número de avisos (`foraDaLista`). */
  fora: string[];
  agora: number;
  de: number[];
  ate: number[];
  horasDe: number;
  mes: { de: number; ate: number } | null;
  rapidaMs: number;
}

const digitos = (s: string) => s.replace(/\D/g, "");

export function agregarLinhas(e: EntradaRef): {
  janelas: JanelaAgregada[];
  series: SeriesAgregadas;
} {
  const fora = new Set(e.fora);
  const t = (iso: string) => Date.parse(iso);
  const msgs = e.msgs.filter(
    (m) =>
      !ehImportada(m.message_type) &&
      t(m.created_at) < e.agora &&
      !fora.has(digitos(m.phone))
  );
  const quals = e.quals.filter((q) => !fora.has(digitos(q.phone)));
  const primeiras = primeirasMensagens(
    msgs.map((m) => ({ ...m })) as Parameters<typeof primeirasMensagens>[0]
  );

  const limites = [
    { k: 0, de: -Infinity, ate: e.agora },
    ...e.de.map((de, i) => ({ k: i + 1, de, ate: e.ate[i] })),
  ];

  const janelas: JanelaAgregada[] = limites.map(({ k, de, ate }) => {
    const por = new Map<
      string,
      { pu: number | null; pia: number | null; h: boolean; nia: number; nu: number }
    >();
    for (const m of msgs) {
      const x = t(m.created_at);
      if (!(x >= de && x < ate)) continue;
      let p = por.get(m.phone);
      if (!p) {
        p = { pu: null, pia: null, h: false, nia: 0, nu: 0 };
        por.set(m.phone, p);
      }
      if (respostaHumana(m)) p.h = true;
      if (m.user_message) {
        p.nu++;
        if (p.pu === null || x < p.pu) p.pu = x;
      }
      if (respostaDaIa(m)) {
        p.nia++;
        if (p.pia === null || x < p.pia) p.pia = x;
      }
    }
    const difs: number[] = [];
    let semHumano = 0;
    let nia = 0;
    let nu = 0;
    for (const p of por.values()) {
      if (!p.h) semHumano++;
      nia += p.nia;
      nu += p.nu;
      if (p.pu !== null && p.pia !== null && p.pia - p.pu >= 0) difs.push(p.pia - p.pu);
    }
    difs.sort((a, b) => a - b);
    const n = difs.length;

    let novas = 0;
    for (const f of primeiras.values()) if (f >= de && f < ate) novas++;

    const qs = quals.filter((q) => {
      const x = t(q.created_at);
      return x >= de && x < ate;
    });

    return {
      janela: k,
      conversas: por.size,
      sem_humano: semHumano,
      respostas_ia: nia,
      recebidas: nu,
      dif_n: n,
      dif_lo: n ? difs[Math.floor((n - 1) / 2)] : null,
      dif_hi: n ? difs[Math.floor(n / 2)] : null,
      dif_soma: difs.reduce((a, b) => a + b, 0),
      dif_rapidas: difs.filter((d) => d < e.rapidaMs).length,
      pessoas_novas: novas,
      primeira_em:
        k === 0 && primeiras.size > 0 ? Math.min(...primeiras.values()) : null,
      leads: new Set(qs.map((q) => q.phone)).size,
      pausar: qs.filter((q) => q.action === "pausar").length,
      agendar: qs.filter((q) => q.action === "agendar").length,
    };
  });

  // ── séries ────────────────────────────────────────────────────────────────
  const dois = (n: number) => String(n).padStart(2, "0");
  const dias = new Map<string, [number, number]>();
  const horas = new Map<string, [number, number]>();
  const cubo = new Map<string, number>();
  const cuboMes = new Map<string, number>();
  const picos = new Map<string, [number, number]>();
  const picosMes = new Map<string, [number, number]>();
  const soma = <K>(m: Map<K, number>, k: K, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  const par = (m: Map<string, [number, number]>, k: string, i: 0 | 1) => {
    const v = m.get(k) ?? [0, 0];
    v[i]++;
    m.set(k, v);
  };

  for (const m of msgs) {
    const p = parteLocal(m.created_at);
    if (!p) continue;
    const x = t(m.created_at);
    const data = `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`;
    const ia = respostaDaIa(m);
    const man = respostaHumana(m); // o importado já saiu: só sobra 'manual'
    const noMes = !!e.mes && x >= e.mes.de && x < e.mes.ate;
    if (ia) {
      par(dias, data, 0);
      soma(cubo, `${p.diaSemana}:${p.hora * 60 + p.minuto}`, 1);
      if (noMes) soma(cuboMes, `${p.diaSemana}:${p.hora * 60 + p.minuto}`, 1);
      if (x >= e.horasDe) par(horas, `${data}|${p.hora}`, 0);
    }
    if (man) {
      par(dias, data, 1);
      if (x >= e.horasDe) par(horas, `${data}|${p.hora}`, 1);
    }
    if (m.user_message) {
      const k = `${p.diaSemana}:${p.hora}`;
      for (const [alvo, vale] of [
        [picos, true],
        [picosMes, noMes],
      ] as const) {
        if (!vale) continue;
        const v = alvo.get(k) ?? [0, 0];
        v[0]++;
        v[1] = Math.max(v[1], x);
        alvo.set(k, v);
      }
    }
  }

  const ordem = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  };
  const cuboSaida = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([k, n]) => [...k.split(":").map(Number), n] as [number, number, number])
      .sort(ordem);
  const picosSaida = (m: Map<string, [number, number]>) =>
    [...m.entries()]
      .map(([k, [n, ult]]) => [...k.split(":").map(Number), n, ult] as [number, number, number, number])
      .sort(ordem);

  const series: SeriesAgregadas = {
    dias: [...dias.entries()]
      .map(([d, [ia, man]]) => [d, ia, man] as [string, number, number])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    horas: [...horas.entries()]
      .map(([k, [ia, man]]) => {
        const [d, h] = k.split("|");
        return [d, Number(h), ia, man] as [string, number, number, number];
      })
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1])),
    cubo: cuboSaida(cubo),
    cubo_mes: cuboSaida(cuboMes),
    picos: picosSaida(picos),
    picos_mes: picosSaida(picosMes),
  };
  return { janelas, series };
}

// ── a massa ──────────────────────────────────────────────────────────────────
//
// Determinística, em MICROssegundos inteiros (o banco guarda µs, o JS lê ms: a
// prova precisa exercitar esse truncamento). Cobre todas as combinações de tipo
// de mensagem e texto (recebida, IA, manual, importada, linha mista, resposta só
// de espaços, vazio), uma resposta da IA colada na linha de outro instante (para
// os "menos de 1 minuto"), e DUAS grafias do número de avisos (com e sem o nono
// dígito, DDD 00, que nunca existe de verdade). `n` = 1500 linhas a cada 61
// minutos cobre ~63 dias, mais que a janela anterior do mês e o mês fechado.
//
// A MESMA massa é gerada em SQL (`generate_series`) no roteiro que valida as
// funções contra o banco; qualquer mudança aqui muda lá.
export const NUMERO_AVISOS = "5500912345678@s.whatsapp.net";
const NUMERO_AVISOS_SEM_NONO = "550012345678@s.whatsapp.net";

const pad = (n: number, t: number) => String(n).padStart(t, "0");

/** µs desde a época para o ISO com 6 casas decimais que o PostgREST devolve. */
export function isoDeMicros(us: number): string {
  const ms = Math.floor(us / 1000);
  return new Date(ms).toISOString().slice(0, -1) + pad(us % 1000, 3) + "+00:00";
}

export function massaDeTeste(
  agoraUs: number,
  prefixo: string,
  n = 1500
): { msgs: LinhaRef[]; quals: QualRef[] } {
  const fone = (i: number) =>
    i % 31 === 0
      ? NUMERO_AVISOS
      : i % 47 === 0
        ? NUMERO_AVISOS_SEM_NONO
        : `${prefixo}${pad(i % 23, 2)}@s.whatsapp.net`;
  const tipos = [null, "text", "manual", "imported", "audio"];
  const usDe = (i: number) =>
    agoraUs - (i * 61 + 5) * 60e6 - ((i * 7919) % 1000000) - (i % 11) * 13e6;

  const msgs: LinhaRef[] = [];
  for (let i = 0; i < n; i++) {
    const k = i % 7;
    msgs.push({
      phone: fone(i),
      message_type: tipos[i % 5],
      user_message: k === 0 || k === 3 ? `pergunta ${i}` : k === 5 ? "" : null,
      bot_message:
        k === 1
          ? `resposta curta ${i}`
          : k === 2
            ? "x".repeat(130) + i
            : k === 3
              ? "   "
              : k === 4
                ? `misto ${i}`
                : null,
      created_at: isoDeMicros(usDe(i)),
    });
    if (i % 13 === 0) {
      msgs.push({
        phone: fone(i),
        message_type: i % 2 === 0 ? "text" : null,
        user_message: null,
        bot_message: "resp",
        created_at: isoDeMicros(usDe(i) + ((i * 7) % 100) * 1e6 + 123000),
      });
    }
  }
  const acoes = ["pausar", "agendar", "none", "none"];
  const quals: QualRef[] = [];
  for (let q = 0; q < 200; q++) {
    quals.push({
      phone:
        q % 31 === 0
          ? NUMERO_AVISOS
          : q % 41 === 0
            ? NUMERO_AVISOS_SEM_NONO
            : `${prefixo}${pad(q % 23, 2)}@s.whatsapp.net`,
      action: acoes[q % 4],
      created_at: isoDeMicros(
        agoraUs - q * 5 * 3600e6 - (q % 9) * 7 * 60e6 - q * 1234
      ),
    });
  }
  return { msgs, quals };
}
