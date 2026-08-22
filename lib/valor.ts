// Valor percebido: transforma operação em evidência de dependência.
//
// Módulo PURO (só importa tipos, nada de I/O), como lib/billing.ts e
// lib/metrics.ts: a página busca as linhas por RLS e passa cruas para cá, e o
// /design passa mock. Assim servidor e browser leem a MESMA regra.
//
// POR QUE ESTE ITEM EXISTE: o valor deste produto é invisível. A IA responde
// dentro do WhatsApp e o dono vê tudo no celular dele de qualquer jeito, então
// ele não sente que precisa da ferramenta. Estes números viram frase pronta que
// mostra o trabalho que humano nenhum teria feito.
//
// REGRA QUE NÃO SE NEGOCIA: nunca inventar nem inflar. O cliente confere no
// WhatsApp dele, e confiança é o nosso eixo de competição. Onde falta dado, a
// frase é OMITIDA, não estimada.

import type { BusinessHours, DayKey } from "@/lib/agent-prompt";
import { DAY_ORDER } from "@/lib/agent-prompt";

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Uma linha de chat_messages, como vem do banco. */
export interface ValorMsg {
  phone: string;
  /** Mensagem recebida do cliente (null quando a linha é só resposta). */
  user_message: string | null;
  /** Resposta enviada (IA ou humano). */
  bot_message: string | null;
  /** 'manual' = um humano respondeu. Qualquer outro valor = IA. */
  message_type: string | null;
  /** ISO 8601 com fuso, ex.: 2026-08-19T20:41:50.190Z */
  created_at: string;
}

/** Uma linha de conversation_qualifications. */
export interface ValorQual {
  phone: string;
  /** 'agendar' | 'pausar' | 'none' */
  action: string | null;
  created_at: string;
}

export interface ValorInput {
  msgs: ValorMsg[];
  quals: ValorQual[];
  /**
   * Horário de atendimento do tenant (clients.agent_config -> hours).
   * null = não configurado, e aí os números que dependem dele NÃO são
   * calculados nem estimados.
   */
  hours: BusinessHours | null;
}

// ---------------------------------------------------------------------------
// Fuso e calendário
// ---------------------------------------------------------------------------

// O produto atende PME brasileira e o agente já trabalha em America/Sao_Paulo
// (o bloco AGORA da persona usa esse fuso). Classificar em UTC jogaria as
// mensagens da noite para o dia seguinte e estragaria justamente o número mais
// forte, que é "fora do horário".
const FUSO = "America/Sao_Paulo";

/** Partes locais de um instante, sem depender de o servidor estar no Brasil. */
export interface ParteLocal {
  ano: number;
  mes: number; // 1 a 12
  dia: number;
  hora: number;
  minuto: number;
  /** 0 = domingo, 6 = sábado (igual ao getDay do JS). */
  diaSemana: number;
}

const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

const DOW: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Converte um ISO para as partes locais de São Paulo. null se a data é inválida. */
export function parteLocal(iso: string): ParteLocal | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const p: Record<string, string> = {};
  for (const parte of FMT.formatToParts(new Date(t))) {
    if (parte.type !== "literal") p[parte.type] = parte.value;
  }
  const ano = Number(p.year);
  const mes = Number(p.month);
  const dia = Number(p.day);
  const hora = Number(p.hour);
  const minuto = Number(p.minute);
  const diaSemana = DOW[p.weekday ?? ""];
  if (
    !Number.isFinite(ano) ||
    !Number.isFinite(mes) ||
    !Number.isFinite(dia) ||
    !Number.isFinite(hora) ||
    !Number.isFinite(minuto) ||
    diaSemana === undefined
  ) {
    return null;
  }
  // Intl devolve 24 para meia-noite em algumas engines; normaliza para 0.
  return { ano, mes, dia, hora: hora === 24 ? 0 : hora, minuto, diaSemana };
}

/** Chave de DAY_ORDER (seg..dom) a partir do dia da semana do JS (dom..sáb). */
function chaveDoDia(diaSemana: number): DayKey {
  // JS: 0=dom ... 6=sáb. DAY_ORDER: seg,ter,qua,qui,sex,sab,dom.
  const mapa = [6, 0, 1, 2, 3, 4, 5];
  return DAY_ORDER[mapa[diaSemana]];
}

/**
 * Feriados NACIONAIS do Brasil, calculados aqui dentro: os de data fixa mais os
 * móveis derivados da Páscoa (Carnaval, Sexta-feira Santa, Corpus Christi).
 * Sem serviço externo e sem tabela para manter.
 *
 * Escopo fechado em nacional de propósito: feriado municipal e estadual exigiria
 * cadastro por tenant, e chutar o município transformaria um dia útil em feriado
 * dentro da frase que o cliente vai conferir.
 */
export function feriadosNacionais(ano: number): Set<string> {
  const dias = new Set<string>();
  const add = (mes: number, dia: number) =>
    dias.add(
      `${mes.toString().padStart(2, "0")}-${dia.toString().padStart(2, "0")}`
    );

  // Fixos.
  add(1, 1); // Confraternização Universal
  add(4, 21); // Tiradentes
  add(5, 1); // Dia do Trabalho
  add(9, 7); // Independência
  add(10, 12); // Nossa Senhora Aparecida
  add(11, 2); // Finados
  add(11, 15); // Proclamação da República
  add(11, 20); // Consciência Negra (feriado nacional desde 2024)
  add(12, 25); // Natal

  // Móveis, a partir do domingo de Páscoa (algoritmo de Gauss/Butcher).
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
  const mesPascoa = Math.floor((h + l - 7 * m + 114) / 31);
  const diaPascoa = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = Date.UTC(ano, mesPascoa - 1, diaPascoa);
  const DIA = 86_400_000;
  const desloca = (offset: number) => {
    const dt = new Date(pascoa + offset * DIA);
    add(dt.getUTCMonth() + 1, dt.getUTCDate());
  };
  desloca(-48); // segunda de Carnaval
  desloca(-47); // terça de Carnaval
  desloca(-2); // Sexta-feira Santa
  desloca(60); // Corpus Christi

  return dias;
}

/** O instante caiu em feriado nacional? */
export function ehFeriado(
  p: ParteLocal,
  cache: Map<number, Set<string>>
): boolean {
  let doAno = cache.get(p.ano);
  if (!doAno) {
    doAno = feriadosNacionais(p.ano);
    cache.set(p.ano, doAno);
  }
  const chave = `${p.mes.toString().padStart(2, "0")}-${p.dia
    .toString()
    .padStart(2, "0")}`;
  return doAno.has(chave);
}

function paraMinutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * O instante está DENTRO do horário de atendimento declarado?
 * Dia fechado conta como fora. Faixa que vira a meia-noite (ex.: 22:00 às 02:00)
 * é tratada, porque bar e delivery existem.
 */
export function dentroDoHorario(p: ParteLocal, hours: BusinessHours): boolean {
  const dia = hours[chaveDoDia(p.diaSemana)];
  if (!dia || !dia.open) return false;
  const min = p.hora * 60 + p.minuto;
  const de = paraMinutos(dia.from);
  const ate = paraMinutos(dia.to);
  if (de === null || ate === null) return false;
  if (de <= ate) return min >= de && min <= ate;
  // Vira o dia: dentro se está depois da abertura OU antes do fechamento.
  return min >= de || min <= ate;
}

/** Todos os dias fechados = horário não serve para calcular nada. */
export function horarioUtil(hours: BusinessHours | null): boolean {
  if (!hours) return false;
  return DAY_ORDER.some((d) => hours[d]?.open === true);
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

export interface PicoValor {
  /** 0 = domingo. */
  diaSemana: number;
  hora: number;
  mensagens: number;
}

export interface ValorResumo {
  /** Mensagens recebidas do cliente no período. */
  recebidas: number;
  /**
   * Respostas da IA enquanto a empresa estava fechada.
   * null quando não há horário configurado (não estimamos).
   */
  atendidasForaDoHorario: number | null;
  /** Respostas da IA em fim de semana ou feriado nacional. */
  atendidasEmFimDeSemanaOuFeriado: number;
  /** Conversas em que nenhum humano respondeu nenhuma vez. */
  conversasSemHumano: number;
  /** Conversas com qualificação da IA no período. */
  leadsQualificados: number;
  /** Qualificações com action 'agendar' (pedido de marcar com o time). */
  pedidosDeAgendamento: number;
  /** Quantas primeiras respostas saíram em menos de 1 minuto. */
  respostasEmMenosDeUmMinuto: number;
  /** Média do tempo até a primeira resposta, em ms. null sem dado. */
  primeiraRespostaMs: number | null;
  /** Dia e hora com mais mensagens recebidas. null sem dado. */
  pico: PicoValor | null;
  /** false = horário de atendimento não configurado; a UI precisa avisar. */
  temHorario: boolean;
}

const DIA_NOME = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const UM_MINUTO = 60_000;

/**
 * Calcula o resumo de valor. `msgs` e `quals` já vêm filtradas pelo período que
 * o chamador escolheu (mês fechado, acumulado, etc.), porque a janela é decisão
 * de produto e não deste módulo.
 */
export function resumoDeValor(input: ValorInput): ValorResumo {
  const hours = input.hours;
  const comHorario = horarioUtil(hours);
  const cacheFeriados = new Map<number, Set<string>>();

  let recebidas = 0;
  let fora = 0;
  let fimDeSemanaOuFeriado = 0;
  let menosDeUmMinuto = 0;

  // Por conversa: se algum humano respondeu, e o par (primeira recebida,
  // primeira resposta) para medir o tempo de primeira resposta.
  const porTelefone = new Map<
    string,
    { humano: boolean; primeiraUser: number | null; primeiraBot: number | null }
  >();
  const picos = new Map<string, number>();

  for (const m of input.msgs) {
    const p = parteLocal(m.created_at);
    if (!p) continue;

    const t = Date.parse(m.created_at);
    const temUser = !!m.user_message;
    const temBot = !!m.bot_message;
    const manual = m.message_type === "manual";

    let e = porTelefone.get(m.phone);
    if (!e) {
      e = { humano: false, primeiraUser: null, primeiraBot: null };
      porTelefone.set(m.phone, e);
    }
    if (manual) e.humano = true;
    if (temUser && (e.primeiraUser === null || t < e.primeiraUser)) {
      e.primeiraUser = t;
    }
    if (temBot && (e.primeiraBot === null || t < e.primeiraBot)) {
      e.primeiraBot = t;
    }

    if (temUser) {
      recebidas++;
      // Pico é sobre DEMANDA (mensagem que chega), não sobre resposta: ele
      // mostra quando o cliente procura a empresa.
      const chave = `${p.diaSemana}:${p.hora}`;
      picos.set(chave, (picos.get(chave) ?? 0) + 1);
    }

    // Fora do horário e fim de semana contam a linha em que a IA RESPONDEU.
    // Resposta manual fica de fora de propósito: aquilo foi alguém do time
    // trabalhando de madrugada, e somar as duas inflaria a frase.
    if (temBot && !manual) {
      const feriado = ehFeriado(p, cacheFeriados);
      const fimDeSemana = p.diaSemana === 0 || p.diaSemana === 6;
      if (fimDeSemana || feriado) fimDeSemanaOuFeriado++;
      if (comHorario && hours && !dentroDoHorario(p, hours)) fora++;
    }
  }

  const diffs: number[] = [];
  let semHumano = 0;
  for (const e of porTelefone.values()) {
    if (!e.humano) semHumano++;
    if (e.primeiraUser !== null && e.primeiraBot !== null) {
      const d = e.primeiraBot - e.primeiraUser;
      if (d >= 0) {
        diffs.push(d);
        if (d < UM_MINUTO) menosDeUmMinuto++;
      }
    }
  }

  let pico: PicoValor | null = null;
  for (const [chave, n] of picos) {
    if (!pico || n > pico.mensagens) {
      const [d, h] = chave.split(":").map(Number);
      pico = { diaSemana: d, hora: h, mensagens: n };
    }
  }

  const telefonesQual = new Set(input.quals.map((q) => q.phone));

  return {
    recebidas,
    atendidasForaDoHorario: comHorario ? fora : null,
    atendidasEmFimDeSemanaOuFeriado: fimDeSemanaOuFeriado,
    conversasSemHumano: semHumano,
    leadsQualificados: telefonesQual.size,
    pedidosDeAgendamento: input.quals.filter((q) => q.action === "agendar").length,
    respostasEmMenosDeUmMinuto: menosDeUmMinuto,
    primeiraRespostaMs:
      diffs.length > 0
        ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length)
        : null,
    pico,
    temHorario: comHorario,
  };
}

// ---------------------------------------------------------------------------
// Frases
// ---------------------------------------------------------------------------

export interface FraseValor {
  /** Chave estável, para teste e para ordenar. */
  key: string;
  /** O número em destaque, já formatado. */
  numero: string;
  /** A frase, em linguagem de dono. */
  texto: string;
}

function plural(n: number, um: string, muitos: string): string {
  return n === 1 ? um : muitos;
}

/**
 * Frases prontas, em ordem de força do argumento. Só entra o que tem número
 * maior que zero: frase com zero não convence ninguém e ocupa espaço.
 */
export function frasesDeValor(r: ValorResumo, periodo: string): FraseValor[] {
  const f: FraseValor[] = [];

  if (r.atendidasForaDoHorario !== null && r.atendidasForaDoHorario > 0) {
    const n = r.atendidasForaDoHorario;
    f.push({
      key: "fora-do-horario",
      numero: String(n),
      texto: `${plural(
        n,
        "mensagem respondida",
        "mensagens respondidas"
      )} fora do horário de atendimento ${periodo}, sem ninguém do time precisar entrar.`,
    });
  }

  if (r.atendidasEmFimDeSemanaOuFeriado > 0) {
    const n = r.atendidasEmFimDeSemanaOuFeriado;
    f.push({
      key: "fim-de-semana",
      numero: String(n),
      texto: `${plural(
        n,
        "mensagem respondida",
        "mensagens respondidas"
      )} em fim de semana ou feriado ${periodo}.`,
    });
  }

  if (r.conversasSemHumano > 0) {
    const n = r.conversasSemHumano;
    f.push({
      key: "sem-humano",
      numero: String(n),
      texto: `${plural(
        n,
        "conversa atendida",
        "conversas atendidas"
      )} do início ao fim sem nenhuma intervenção do time.`,
    });
  }

  if (r.leadsQualificados > 0) {
    const n = r.leadsQualificados;
    const extra =
      r.pedidosDeAgendamento > 0
        ? `, ${r.pedidosDeAgendamento} querendo marcar com o time`
        : "";
    f.push({
      key: "qualificados",
      numero: String(n),
      texto: `${plural(
        n,
        "lead qualificado",
        "leads qualificados"
      )} pela IA ${periodo}${extra}.`,
    });
  }

  if (r.respostasEmMenosDeUmMinuto > 0) {
    const n = r.respostasEmMenosDeUmMinuto;
    f.push({
      key: "menos-de-um-minuto",
      numero: String(n),
      texto: `${plural(
        n,
        "cliente respondido",
        "clientes respondidos"
      )} em menos de 1 minuto.`,
    });
  }

  if (r.pico) {
    f.push({
      key: "pico",
      numero: `${r.pico.hora}h`,
      texto: `O pico de mensagens é ${
        DIA_NOME[r.pico.diaSemana]
      } nesse horário. É quando você estaria perdendo cliente sem atendimento.`,
    });
  }

  return f;
}

const MES_NOME = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Rótulo do período para a frase, ex.: "em julho de 2026". */
export function rotuloDoMes(ano: number, mes: number): string {
  return `em ${MES_NOME[mes - 1]} de ${ano}`;
}

/**
 * Mês fechado anterior ao instante dado, em ISO, para montar a consulta.
 * Mês FECHADO e não mês corrente porque a frase precisa de um período inteiro;
 * mês pela metade dá número que parece pequeno e vende contra a gente.
 */
export function mesFechado(agora: Date = new Date()): {
  inicioISO: string;
  fimISO: string;
  ano: number;
  mes: number;
} {
  const p = parteLocal(agora.toISOString());
  const ano = p ? p.ano : agora.getUTCFullYear();
  const mes = p ? p.mes : agora.getUTCMonth() + 1;
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  // Fronteiras em UTC deslocadas por 3 horas: São Paulo é UTC-3 e não tem mais
  // horário de verão desde 2019, então o deslocamento é constante.
  const inicio = new Date(Date.UTC(anoAnt, mesAnt - 1, 1, 3, 0, 0));
  const fim = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0));
  return {
    inicioISO: inicio.toISOString(),
    fimISO: fim.toISOString(),
    ano: anoAnt,
    mes: mesAnt,
  };
}
