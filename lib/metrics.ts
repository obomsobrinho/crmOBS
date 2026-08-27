// Métricas de operação do painel. Módulo puro: a página faz o fetch por RLS
// (tenant) e passa as linhas cruas; aqui só se calcula.
//
// ⚠️ REGRA QUE MANDA EM TUDO AQUI (27/08/2026): o painel só conta o que
// aconteceu DEPOIS que a IA entrou. O histórico importado no onboarding
// (`message_type = 'imported'`) fica fora de todos os números, e continua
// visível no inbox, que é o lugar dele.
//
// Antes disso, "resposta da IA" era qualquer linha com `bot_message` e
// `message_type <> 'manual'`, e `imported` passava por essa peneira: as
// respostas que o próprio dono digitou à mão no WhatsApp, antes de existir
// agente, contavam como trabalho da IA. Ver lib/mensagem.ts para o tamanho
// medido do estrago.

import { ehImportada, respostaDaIa, respostaHumana } from "@/lib/mensagem";

/** Uma mensagem da janela (derivada de chat_messages). */
export interface JanelaMsg {
  phone: string;
  /** Texto recebido do cliente, ou null. */
  user_message: string | null;
  /** Texto enviado (IA ou humano), ou null. */
  bot_message: string | null;
  message_type: string | null;
  created_at: string;
}

export interface DashboardMetrics {
  /** Conversas com atividade na janela. */
  conversas: number;
  /** Dessas, quantas seguiram sem nenhuma resposta humana. */
  semIntervencao: number;
  /** Contatos com qualificação da IA na janela. */
  leadsQualificados: number;
  /**
   * MEDIANA do tempo até a primeira resposta DA IA.
   *
   * Mediana e não média: uma conversa esquecida arrastava a média inteira, e o
   * dono via um número que não corresponde a nenhum atendimento real. Só
   * resposta da IA entra, senão um humano respondendo seis horas depois pesa num
   * cartão que se lê como "velocidade do agente".
   */
  primeiraRespostaMs: number | null;
  /**
   * Quantos atendimentos entraram na mediana. Vai na legenda do cartão: mediana
   * de 3 e mediana de 138 não são o mesmo número, e o cartão precisa dizer qual
   * dos dois ele é.
   */
  amostraMediana: number;
  /**
   * Vezes em que a IA passou o caso para o time em vez de arriscar uma resposta
   * (qualificação com action "pausar", o que inclui o guardrail, que degrada
   * para "pausar" quando retém uma resposta).
   *
   * É a contenção virando PROVA e não falha: uma promessa de "não inventa" é
   * impossível de verificar; uma contagem de vezes em que ela se conteve, não.
   */
  preferiuConfirmar: number;
  /** Respostas da IA na janela. É o denominador de `preferiuConfirmar`. */
  respostasIa: number;
  /** Contatos cuja PRIMEIRA mensagem nesta conta caiu dentro da janela. */
  pessoasNovas: number;
}

/**
 * Instante da primeira mensagem de cada telefone, sobre o acumulado INTEIRO.
 *
 * Fica separado de `computeMetrics` porque é sobre todo o histórico, não sobre a
 * janela: dentro de uma janela de 7 dias, todo mundo parece novo.
 */
export function primeirasMensagens(msgs: JanelaMsg[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const msg of msgs) {
    if (ehImportada(msg.message_type)) continue;
    const t = Date.parse(msg.created_at);
    if (!Number.isFinite(t)) continue;
    const atual = m.get(msg.phone);
    if (atual === undefined || t < atual) m.set(msg.phone, t);
  }
  return m;
}

export interface MetricsInput {
  /** Mensagens JÁ recortadas para a janela. */
  msgs: JanelaMsg[];
  /** Qualificações JÁ recortadas para a janela. */
  quals: { phone: string; action: string | null }[];
  /** Saída de `primeirasMensagens` sobre o acumulado. */
  primeiras: Map<string, number>;
  /** Limites da janela, para saber se a primeira mensagem caiu dentro. */
  de: number;
  ate: number;
}

export function computeMetrics(input: MetricsInput): DashboardMetrics {
  const byPhone = new Map<
    string,
    { humano: boolean; primeiraUser: number | null; primeiraIa: number | null }
  >();
  let respostasIa = 0;

  for (const m of input.msgs) {
    // O importado não entra em NADA: é o que a empresa fazia antes da IA.
    if (ehImportada(m.message_type)) continue;

    const t = Date.parse(m.created_at);
    if (!Number.isFinite(t)) continue;

    let e = byPhone.get(m.phone);
    if (!e) {
      e = { humano: false, primeiraUser: null, primeiraIa: null };
      byPhone.set(m.phone, e);
    }
    if (respostaHumana(m)) e.humano = true;
    if (m.user_message && (e.primeiraUser === null || t < e.primeiraUser)) {
      e.primeiraUser = t;
    }
    if (respostaDaIa(m)) {
      respostasIa++;
      if (e.primeiraIa === null || t < e.primeiraIa) e.primeiraIa = t;
    }
  }

  let semIntervencao = 0;
  const diffs: number[] = [];
  for (const e of byPhone.values()) {
    if (!e.humano) semIntervencao++;
    if (e.primeiraUser !== null && e.primeiraIa !== null) {
      const d = e.primeiraIa - e.primeiraUser;
      if (d >= 0) diffs.push(d);
    }
  }

  let pessoasNovas = 0;
  for (const t of input.primeiras.values()) {
    if (t >= input.de && t < input.ate) pessoasNovas++;
  }

  return {
    conversas: byPhone.size,
    semIntervencao,
    leadsQualificados: new Set(input.quals.map((q) => q.phone)).size,
    primeiraRespostaMs: mediana(diffs),
    amostraMediana: diffs.length,
    preferiuConfirmar: input.quals.filter((q) => q.action === "pausar").length,
    respostasIa,
    pessoasNovas,
  };
}

/** Mediana de uma lista de durações. `null` quando não há amostra. */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 1
    ? ord[meio]
    : Math.round((ord[meio - 1] + ord[meio]) / 2);
}

/** Letras dos dias na ordem de `getUTCDay` (0 = domingo). */
const DIA_CURTO = ["D", "S", "T", "Q", "Q", "S", "S"];

export interface Barra {
  /** Chave estável do balde. */
  chave: string;
  /** Rótulo do eixo. */
  eixo: string;
  /** Texto da dica, já legível. */
  titulo: string;
  ia: number;
  time: number;
}

const FUSO = "America/Sao_Paulo";

const FMT_DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FMT_HORA = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO,
  hour: "2-digit",
  hour12: false,
});

/** Chave do balde de um instante, por hora ou por dia. */
function balde(inst: Date, porHora: boolean): string {
  const dia = FMT_DIA.format(inst);
  return porHora ? `${dia}T${FMT_HORA.format(inst)}` : dia;
}

/**
 * Baldes do gráfico, seguindo o período escolhido.
 *
 * Janela de 1 dia sai por HORA; qualquer outra sai por dia. Uma janela de 24h
 * desenhada como uma coluna só não é gráfico, é um número com moldura.
 *
 * ⚠️ O balde sai em America/Sao_Paulo, nunca em UTC. Em UTC a mensagem das 21h
 * cai no dia seguinte e a barra mente. A conversão usa `Intl`, nunca aritmética
 * de fuso. É a mesma regra escrita em lib/valor.ts.
 */
export function barras(msgs: JanelaMsg[], dias: number, agora: number): Barra[] {
  const porHora = dias <= 1;
  const passos = porHora ? 24 : dias;
  const passoMs = porHora ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  // Esqueleto: existe para balde vazio aparecer como buraco em vez de sumir e
  // encurtar o eixo, porque o buraco É a informação (um dia sem movimento).
  const ordem: string[] = [];
  const mapa = new Map<string, Barra>();
  for (let i = passos - 1; i >= 0; i--) {
    const inst = new Date(agora - i * passoMs);
    const chave = balde(inst, porHora);
    const eixo = porHora
      ? `${FMT_HORA.format(inst)}h`
      : DIA_CURTO[new Date(`${FMT_DIA.format(inst)}T12:00:00Z`).getUTCDay()];
    ordem.push(chave);
    mapa.set(chave, { chave, eixo, titulo: "", ia: 0, time: 0 });
  }

  for (const m of msgs) {
    if (!m.bot_message || ehImportada(m.message_type)) continue;
    const e = mapa.get(balde(new Date(m.created_at), porHora));
    if (!e) continue; // fora da janela
    if (respostaDaIa(m)) e.ia++;
    else if (respostaHumana(m)) e.time++;
  }

  return ordem.map((c) => {
    const b = mapa.get(c)!;
    const quando = porHora ? b.eixo : legivel(c);
    return { ...b, titulo: `${quando}: ${b.ia} da IA, ${b.time} do time` };
  });
}

/** "2026-08-20" vira "20/08". Sem `Date` no meio: a string já está no fuso certo. */
function legivel(dia: string): string {
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}

// Duração legível (linguagem de dono): 12s, 3min, 1h 5min.
export function formatDuration(ms: number | null): string {
  if (ms == null) return "sem dados";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}min` : `${h}h`;
}

/** Espera em linguagem de dono: "há 6 horas", "há 12 minutos". */
export function esperaLegivel(desdeISO: string, agora: number): string {
  const t = Date.parse(desdeISO);
  if (!Number.isFinite(t)) return "";
  const min = Math.max(0, Math.round((agora - t) / 60000));
  if (min < 60) return `há ${min} ${min === 1 ? "minuto" : "minutos"}`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
