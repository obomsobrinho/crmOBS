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
  primeiraRespostaMs: number | null; // média do tempo até a 1a resposta
}

// Agrega as métricas. `qualPhones` = telefones com qualificação nos 7 dias
// (vem de conversation_qualifications, contado à parte).
export function computeMetrics(
  msgs: WeekMsg[],
  qualPhones: Set<string>
): DashboardMetrics {
  const byPhone = new Map<
    string,
    { manual: boolean; firstUser: string | null; firstBot: string | null }
  >();

  for (const m of msgs) {
    let e = byPhone.get(m.phone);
    if (!e) {
      e = { manual: false, firstUser: null, firstBot: null };
      byPhone.set(m.phone, e);
    }
    if (m.manual) e.manual = true;
    if (m.hasUser && (!e.firstUser || m.created_at < e.firstUser))
      e.firstUser = m.created_at;
    if (m.hasBot && (!e.firstBot || m.created_at < e.firstBot))
      e.firstBot = m.created_at;
  }

  let semIntervencao = 0;
  const diffs: number[] = [];
  for (const e of byPhone.values()) {
    if (!e.manual) semIntervencao++;
    if (e.firstUser && e.firstBot) {
      const d = new Date(e.firstBot).getTime() - new Date(e.firstUser).getTime();
      if (d >= 0) diffs.push(d);
    }
  }

  const primeiraRespostaMs =
    diffs.length > 0
      ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length)
      : null;

  return {
    conversasSemana: byPhone.size,
    semIntervencao,
    leadsQualificados: qualPhones.size,
    primeiraRespostaMs,
  };
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
