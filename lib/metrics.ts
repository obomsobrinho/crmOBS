// Métricas do painel (dashboard mínimo). Módulo puro: a página faz o fetch por
// RLS (tenant) e passa as linhas cruas; aqui só se calcula. Janela: 7 dias.

// Uma mensagem da janela (derivada de chat_messages).
export interface WeekMsg {
  phone: string;
  hasUser: boolean; // linha tem user_message (recebida)
  hasBot: boolean; // linha tem bot_message (resposta IA ou humano)
  manual: boolean; // message_type === 'manual' (humano respondeu)
  created_at: string;
}

export interface DashboardMetrics {
  conversasSemana: number; // conversas com atividade nos 7 dias
  semIntervencao: number; // dessas, quantas a IA tocou sem humano responder
  leadsQualificados: number; // leads que a IA qualificou nos 7 dias
  /**
   * MEDIANA do tempo até a primeira resposta DA IA. Duas mudanças em 26/08/2026,
   * as duas para o número parar de mentir sobre o agente:
   *
   * 1. Só resposta da IA conta (`hasBot && !manual`). Antes qualquer linha com
   *    `bot_message` entrava, então um humano que respondeu seis horas depois
   *    pesava num cartão que o dono lê como "velocidade do agente". É a mesma
   *    regra já aplicada em `lib/valor.ts` para "fora do horário".
   * 2. Mediana e não média: uma conversa esquecida arrastava a média inteira, e o
   *    dono via um número que não corresponde a nenhum atendimento real.
   */
  primeiraRespostaMs: number | null;
}

// Agrega as métricas. `qualPhones` = telefones com qualificação nos 7 dias
// (vem de conversation_qualifications, contado à parte).
export function computeMetrics(
  msgs: WeekMsg[],
  qualPhones: Set<string>
): DashboardMetrics {
  const byPhone = new Map<
    string,
    { manual: boolean; firstUser: string | null; firstIaBot: string | null }
  >();

  for (const m of msgs) {
    let e = byPhone.get(m.phone);
    if (!e) {
      e = { manual: false, firstUser: null, firstIaBot: null };
      byPhone.set(m.phone, e);
    }
    if (m.manual) e.manual = true;
    if (m.hasUser && (!e.firstUser || m.created_at < e.firstUser))
      e.firstUser = m.created_at;
    // `!m.manual`: resposta manual é humano trabalhando, não velocidade da IA.
    if (m.hasBot && !m.manual && (!e.firstIaBot || m.created_at < e.firstIaBot))
      e.firstIaBot = m.created_at;
  }

  let semIntervencao = 0;
  const diffs: number[] = [];
  for (const e of byPhone.values()) {
    if (!e.manual) semIntervencao++;
    if (e.firstUser && e.firstIaBot) {
      const d = new Date(e.firstIaBot).getTime() - new Date(e.firstUser).getTime();
      if (d >= 0) diffs.push(d);
    }
  }

  return {
    conversasSemana: byPhone.size,
    semIntervencao,
    leadsQualificados: qualPhones.size,
    primeiraRespostaMs: mediana(diffs),
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

export interface BarraDia {
  /** "2026-08-20", já no fuso de São Paulo. */
  dia: string;
  /** Letra do dia da semana, para o eixo. */
  letra: string;
  /** Mensagens respondidas pela IA nesse dia. */
  ia: number;
  /** Mensagens respondidas por alguém do time nesse dia. */
  time: number;
}

/**
 * Balde por dia dos últimos N dias, para o gráfico de barras.
 *
 * ⚠️ O dia sai em **America/Sao_Paulo**, não em UTC. Em UTC a mensagem das 21h
 * cai no dia seguinte e a barra mente, que é a mesma regra escrita em
 * `lib/valor.ts`. A conversão usa `Intl`, nunca aritmética de fuso.
 */
export function barrasPorDia(
  msgs: {
    bot_message: string | null;
    message_type: string | null;
    created_at: string;
  }[],
  dias = 14,
  agora: number = Date.now()
): BarraDia[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // Esqueleto dos dias, do mais antigo ao mais novo. Existe para dia sem
  // mensagem aparecer como barra vazia em vez de sumir e encurtar o eixo.
  const ordem: string[] = [];
  const mapa = new Map<string, BarraDia>();
  for (let i = dias - 1; i >= 0; i--) {
    const dia = fmt.format(new Date(agora - i * 24 * 60 * 60 * 1000));
    ordem.push(dia);
    mapa.set(dia, {
      dia,
      // A letra sai do próprio dia já convertido, lido ao meio-dia UTC para
      // nenhum fuso conseguir virar a data.
      letra: DIA_CURTO[new Date(`${dia}T12:00:00Z`).getUTCDay()],
      ia: 0,
      time: 0,
    });
  }

  for (const m of msgs) {
    if (!m.bot_message) continue;
    const e = mapa.get(fmt.format(new Date(m.created_at)));
    if (!e) continue; // fora da janela
    if (m.message_type === "manual") e.time++;
    else e.ia++;
  }

  return ordem.map((d) => mapa.get(d)!);
}

// Início da janela de 7 dias, em ISO. Função comum (não é componente), então o
// Date.now aqui não fere a regra de pureza de render dos Server Components.
export function weekCutoffISO(now: number = Date.now()): string {
  return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
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
