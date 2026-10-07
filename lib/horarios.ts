// HORÁRIOS CITADOS, CONTADOS EM CÓDIGO (01/10/2026).
//
// Módulo PURO. Existe porque o modelo não compara horários com confiança: com a
// orientação "tenho disponibilidade às 16h" às 22h, ele respondia "hoje às 16h"
// ou "às 16h" sem o dia; com a regra reforçada, passou a empurrar para amanhã
// também de manhã, quando 16h ainda estava no futuro. A conta "já passou ou
// não" é aritmética, então quem faz é o código, e o prompt recebe a conclusão
// pronta ("16h já passou hoje: diga amanhã às 16h").

import { DAY_LABEL, DAY_ORDER, normalizeHours, type BusinessHours, type DayKey } from "./agent-prompt";
import { diaIsoSP, FUSO } from "./fuso";

/** Minutos desde a meia-noite em São Paulo. */
export function minutosAgoraSP(now: Date): number {
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24;
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function horaTexto(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/**
 * Horários escritos com número: "16h", "16hrs", "16 horas", "16:30", "16h30",
 * "às 16". Por extenso ("às seis") fica de fora de propósito: é ambíguo (6h ou
 * 18h), e quem desfaz a ambiguidade é a conversa, não uma regra.
 */
export function horariosCitados(texto: string): number[] {
  const achados = new Set<number>();
  const re =
    /(?<![\p{L}\d])([01]?\d|2[0-3])\s*(?:(?:h|hs|hrs?|horas?)(?!\p{L})(?:\s*e?\s*([0-5]\d)(?!\d))?|:([0-5]\d)(?!\d))|(?<!\p{L})[àa]s\s+([01]?\d|2[0-3])(?![\d\p{L}])(?!\s*(?:%|reais|r\$|anos|dias|meses|minutos))/giu;
  for (const m of texto.matchAll(re)) {
    const h = Number(m[1] ?? m[4]);
    const min = Number(m[2] ?? m[3] ?? 0);
    if (Number.isFinite(h)) achados.add(h * 60 + min);
  }
  return [...achados].sort((a, b) => a - b);
}

/**
 * A conclusão pronta para o prompt, uma linha por horário citado: se já passou
 * hoje (diga amanhã) ou se ainda vai acontecer (é hoje). `null` quando o texto
 * não cita horário com número.
 */
export function notaDeHorarios(texto: string, now: Date): string | null {
  const horas = horariosCitados(texto);
  if (horas.length === 0) return null;
  const agora = minutosAgoraSP(now);
  return horas
    .map((m) =>
      m <= agora
        ? `${horaTexto(m)} de hoje já passou (agora são ${horaTexto(agora)}): ofereça para amanhã (ou o próximo dia de atendimento) e diga "amanhã às ${horaTexto(m)}". Nunca diga "hoje" para esse horário.`
        : `${horaTexto(m)} ainda não chegou hoje (agora são ${horaTexto(agora)}): é hoje, diga "hoje às ${horaTexto(m)}". Não empurre para amanhã.`
    )
    .join("\n");
}

/** A orientação já diz o dia ("amanhã", "quinta", "02/10")? Então ninguém precisa decidir. */
export function citaDia(texto: string): boolean {
  // ⚠️ `\b` não serve aqui: "amanhã" termina em letra acentuada, que o `\b` do
  // JavaScript não trata como letra (o teste pegou isso em 01/10/2026).
  return /(?<!\p{L})(hoje|amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?!\p{L})|(?<!\d)\d{1,2}\/\d{1,2}(?!\d)/iu.test(texto);
}

/**
 * O dia de cada horário citado, para grudar no FIM da própria orientação
 * ("tenho disponibilidade às 16h [amanhã às 16h]"), que é a última coisa que o
 * modelo lê. `null` quando não há horário ou quando a orientação já diz o dia.
 */
export function diaDosHorarios(texto: string, now: Date): string | null {
  if (citaDia(texto)) return null;
  const horas = horariosCitados(texto);
  if (horas.length === 0) return null;
  const agora = minutosAgoraSP(now);
  return horas
    .map((m) => `${m <= agora ? "amanhã" : "hoje"} às ${horaTexto(m)}`)
    .join(", ");
}

// ————————————————————————————————————————————————————————————————
// CALENDÁRIO DOS PRÓXIMOS DIAS, CONTADO EM CÓDIGO (05/10/2026)
// ————————————————————————————————————————————————————————————————
//
// A bateria de diagnóstico de 05/10/2026 (31 casos x 3, cérebro real) achou o
// mesmo erro nos dois sentidos, sempre de CONTA: agendou "amanhã de manhã" numa
// sexta às 19h (amanhã é sábado, fechado), disse às 16h que 17h "já passou", e
// se perdeu no "amanhã cedo" às 23h50. Com o prompt simplificado o modelo errou
// igual; com o modelo maior acertou. Com este bloco, o modelo de hoje passou nos
// 30 casos checáveis, 3 de 3. O princípio é o de `notaDeHorarios`: o modelo
// conversa, o código faz a conta de dia da semana, expediente e "já passou".

/** Dias cobertos pelo bloco: hoje mais 7, para "semana que vem" cair dentro. */
export const DIAS_DO_CALENDARIO = 8;

// getUTCDay() (0 = domingo) para a chave do formulário.
const CHAVE_POR_DIA: DayKey[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * O horário CADASTRADO pelo tenant, ou `null` quando não há nenhum.
 *
 * ⚠️ `null` é estado válido e NÃO vira o horário padrão: `normalizeHours`
 * completa dia faltante com `DEFAULT_HOURS`, e servir ao modelo "aberto 8h às
 * 18h" que ninguém cadastrou seria inventar expediente. Sem horário (ou com
 * todos os dias fechados, que no guiado também omite a seção), o calendário sai
 * só com as datas.
 */
export function horarioCadastrado(agentConfig: unknown): BusinessHours | null {
  const bruto = (agentConfig as { hours?: unknown } | null)?.hours;
  if (!bruto || typeof bruto !== "object") return null;
  const h = normalizeHours(bruto);
  return DAY_ORDER.some((d) => h[d].open) ? h : null;
}

/**
 * PERÍODOS DO DIA, TIRADOS DO EXPEDIENTE DE CADA EMPRESA (decisão do dono,
 * 06/10/2026: "tem que olhar de acordo com as configurações da empresa, deve ser
 * algo automático e não engessado").
 *
 * As faixas são fixas (tarde das 13h às 17h foi o dono quem disse; a manhã vai
 * até as 11h porque a tarde começa às 13h; a noite começa às 18h, quando a tarde
 * acaba), mas o que é OFERECIDO é a faixa cortada pelo horário cadastrado de cada
 * dia: hora cheia a partir da abertura e antes do fechamento. Por isso a OBM (8h
 * às 18h) tem manhã 8h a 11h e tarde 13h a 17h, e nenhuma noite; a pizzaria (18h
 * às 23h) só tem noite, 18h a 22h. Hoje, só o que ainda não chegou: às 13h, "agora
 * à tarde" vale 14h a 17h. Sem horário cadastrado não há lista: inventar
 * expediente é pior que perguntar.
 */
export const PERIODOS_DO_DIA = [
  { chave: "manha", nome: "manhã", de: 0, ate: 11 },
  { chave: "tarde", nome: "tarde", de: 13, ate: 17 },
  { chave: "noite", nome: "noite", de: 18, ate: 23 },
] as const;

export type PeriodoDoDia = (typeof PERIODOS_DO_DIA)[number]["chave"];

/**
 * As horas cheias de um período que valem num dia: dentro da faixa, dentro do
 * expediente (início a partir da abertura e antes do fechamento; o que vira a
 * noite vale até a meia-noite) e, hoje, depois de agora. Dia fechado ou sem
 * horário cadastrado: nenhuma.
 */
export function horariosDoPeriodo(
  periodo: PeriodoDoDia,
  agoraMin: number | null,
  dia: { open: boolean; from: string; to: string } | null
): number[] {
  if (!dia || !dia.open) return [];
  const faixa = PERIODOS_DO_DIA.find((p) => p.chave === periodo)!;
  const de = minutos(dia.from);
  const ate = minutos(dia.to);
  const fim = ate > de ? ate : 24 * 60;
  const out: number[] = [];
  for (let h = faixa.de; h <= faixa.ate; h++) {
    const m = h * 60;
    if (m < de || m >= fim) continue;
    if (agoraMin !== null && m <= agoraMin) continue;
    out.push(h);
  }
  return out;
}

function listaDeHoras(hs: number[]): string {
  const t = hs.map((h) => `${h}h`);
  return t.length <= 1 ? t.join("") : `${t.slice(0, -1).join(", ")} e ${t[t.length - 1]}`;
}

/**
 * Bloco `### CALENDÁRIO` do turno: uma linha por dia, de hoje a 7 dias, com o
 * dia da semana, a data e (quando há horário cadastrado) a situação já
 * resolvida: fechado, aberto, ainda não abriu, já encerrou. Vai DEPOIS do AGORA
 * (`runAgent`), porque muda a cada minuto e não pode mexer no prefixo do cache.
 */
export function calendarioBlock(now: Date, hours: BusinessHours | null): string {
  const [y, m, d0] = diaIsoSP(now).split("-").map(Number);
  const agora = minutosAgoraSP(now);
  const linhas: string[] = [];
  // Primeiro horário de abertura daqui para a frente, quando está fechado
  // agora. Sem ele o agente dizia "hoje está fechado" e parava, sem dizer
  // quando abre (segunda rodada da bateria, 05/10/2026).
  let proxima: string | null = null;
  let abertoAgora = false;
  for (let i = 0; i < DIAS_DO_CALENDARIO; i++) {
    // Meio-dia UTC: somar dias nunca escorrega de data.
    const dia = new Date(Date.UTC(y, m - 1, d0 + i, 12));
    const chave = CHAVE_POR_DIA[dia.getUTCDay()];
    const data = `${String(dia.getUTCDate()).padStart(2, "0")}/${String(dia.getUTCMonth() + 1).padStart(2, "0")}`;
    const nome = `${DAY_LABEL[chave]} ${data}`;
    const rotulo = i === 0 ? `hoje (${nome})` : i === 1 ? `amanhã (${nome})` : nome;
    if (!hours) {
      linhas.push(`- ${rotulo}`);
      continue;
    }
    const h = hours[chave];
    const de = minutos(h.from);
    const ate = minutos(h.to);
    // Expediente que vira a noite (ex.: 18:00 às 02:00) termina no dia seguinte.
    const viraNoite = ate <= de;
    const faixa = `${horaTexto(de)} às ${horaTexto(ate)}${viraNoite ? " do dia seguinte" : ""}`;
    // Madrugada dentro do expediente de ONTEM que virou a noite (ex.: ontem
    // 18:00 às 02:00, agora 01:00): está aberto, e dizer "não abriu" ou
    // "fechado" mandaria o cliente embora com a casa funcionando.
    const ontem = hours[CHAVE_POR_DIA[(dia.getUTCDay() + 6) % 7]];
    const fimDeOntem = minutos(ontem.to);
    const ontemAberto =
      i === 0 && ontem.open && fimDeOntem <= minutos(ontem.from) && agora < fimDeOntem;
    let situacao: string;
    if (ontemAberto)
      situacao = `ABERTO AGORA (expediente de ontem), até ${horaTexto(fimDeOntem)}${h.open ? `; o de hoje abre às ${horaTexto(de)}` : ""}`;
    else if (!h.open) situacao = "FECHADO, não atende";
    else if (i > 0) situacao = `aberto das ${faixa}`;
    else if (agora < de) situacao = `ainda NÃO abriu: abre hoje às ${horaTexto(de)} e vai até ${horaTexto(ate)}${viraNoite ? " do dia seguinte" : ""}`;
    else if (!viraNoite && agora >= ate) situacao = `expediente de hoje JÁ ENCERROU às ${horaTexto(ate)}: nada mais hoje`;
    else situacao = `ABERTO AGORA, até ${horaTexto(ate)}${viraNoite ? " do dia seguinte" : ""}: horário de hoje depois de ${horaTexto(agora)} ainda vale`;
    if (i === 0) abertoAgora = situacao.startsWith("ABERTO AGORA");
    if (!abertoAgora && proxima === null && h.open && (i > 0 || agora < de))
      proxima = `${rotulo} às ${horaTexto(de)}`;
    linhas.push(`- ${rotulo}: ${situacao}`);
  }
  if (proxima) linhas.push(`- Fechado agora. Próxima abertura: ${proxima}. Ao dizer que está fechado, diga também quando abre.`);
  // Os horários por período de hoje e de amanhã, já resolvidos pelo expediente
  // (decisão do dono, 06/10/2026). Sem horário cadastrado, a linha não existe.
  if (hours) {
    const diaDe = (i: number) => hours[CHAVE_POR_DIA[new Date(Date.UTC(y, m - 1, d0 + i, 12)).getUTCDay()]];
    const doDia = (i: number) =>
      PERIODOS_DO_DIA.map((p) => ({ p, hs: horariosDoPeriodo(p.chave, i === 0 ? agora : null, diaDe(i)) }))
        .filter((x) => x.hs.length > 0)
        .map((x) => `${x.p.nome} ${listaDeHoras(x.hs)}`)
        .join("; ");
    linhas.push(
      `- Horários para oferecer quando a pessoa diz só o período (hora cheia, dentro do expediente). Hoje: ${
        doDia(0) || "nenhum"
      }. Amanhã: ${doDia(1) || "nenhum"}. Período que não aparece aqui não é atendido. Remarcar também precisa do horário: ofereça estes horários mesmo que a conversa anterior tenha sido marcada só com o período.`
    );
  }
  return [
    "### CALENDÁRIO",
    hours
      ? "Os próximos dias, com o expediente da empresa já calculado pelo sistema. Confie nesta lista para saber que dia é \"amanhã\", se está aberto agora e se um dia ou horário pode ser combinado: nunca combine em dia FECHADO nem em horário que já passou, ofereça o próximo dia aberto."
      : "Os próximos dias, calculados pelo sistema. Confie nesta lista para saber que dia da semana é \"amanhã\" ou uma data.",
    ...linhas,
    "Ao combinar ou citar um dia, diga o dia da semana junto (\"quinta de manhã\", \"amanhã, sexta, às 15h\").",
  ].join("\n");
}
