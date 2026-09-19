import { parteLocal } from "./valor";
import type { ChatRow, InboxItem } from "./types";

// "Você" vem do pushName de mensagens ENVIADAS (fromMe) — nunca é nome de
// contato. Trata isso (e vazios) como "sem nome".
export function cleanName(n: string | null | undefined): string | null {
  const t = n?.trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (low === "você" || low === "voce") return null;
  return t;
}

// Linha crua da tabela `conversations` (o que o inbox lê).
export interface ConvRow {
  phone: string;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_from: string | null;
  unread_count: number | null;
  assigned_user_id: string | null;
  stage?: string | null; // pipeline (só o board seleciona esta coluna)
  /** Handoff aberto pela IA e ainda não atendido. Opcional: o board não lê. */
  handoff_at?: string | null;
}

// Linha crua de `dados_cliente` usada para resolver nome e estado da IA.
export interface ContatoRow {
  telefone: string;
  nomewpp: string | null;
  atendimento_ia: string | null;
  display_name?: string | null;
}

// Monta a lista do inbox a partir das conversas (já ordenadas por
// last_message_at) e do cadastro de contatos. O nome vem de dados_cliente
// (fonte de verdade do contato); sem nome real, a UI mostra o telefone. Puro:
// usado tanto no Server Component quanto no refetch em realtime do cliente.
export function buildInbox(
  convs: ConvRow[],
  contatos: ContatoRow[]
): { items: InboxItem[]; ia: Record<string, string | null> } {
  const nameByPhone = new Map<string, string | null>();
  const ia: Record<string, string | null> = {};
  for (const c of contatos) {
    // display_name (editado no CRM) precede o nomewpp (pushName do WhatsApp).
    nameByPhone.set(c.telefone, cleanName(c.display_name) ?? cleanName(c.nomewpp));
    ia[c.telefone] = c.atendimento_ia ?? null;
  }
  const items: InboxItem[] = convs.map((c) => ({
    phone: c.phone,
    name: nameByPhone.get(c.phone) ?? null,
    lastPreview: c.last_message_preview ?? "",
    lastFrom: c.last_message_from === "out" ? "out" : "in",
    lastMessageAt: c.last_message_at,
    unread: c.unread_count ?? 0,
    assignedUserId: c.assigned_user_id ?? null,
    stage: c.stage ?? null,
    handoffAt: c.handoff_at ?? null,
  }));
  return { items, ia };
}

// Melhor nome de contato entre um conjunto de linhas (qualquer ordem).
export function bestName(rows: ChatRow[]): string | null {
  for (const r of rows) {
    const nm = cleanName(r.nomewpp);
    if (nm) return nm;
  }
  return null;
}

// Iniciais para avatar. Retorna null quando não há nome real (a UI mostra um
// ícone de pessoa em vez de "55" derivado do telefone). Centraliza a lógica que
// estava duplicada em ContactSidebar/Thread/ContextPanel.
// Avatar determinístico a partir de uma chave (telefone ou e-mail).
// Devolve um PAR de fundo tingido e tinta do mesmo matiz, não uma cor sólida:
// inicial branca sobre cor cheia dava 2,80:1 e reprovava WCAG AA. Os oito pares
// vivem no globals.css (--av-N-bg / --av-N-fg) porque cada tema tem os seus, e
// o componente não sabe qual tema está ativo no momento da renderização.
const AVATAR_SLOTS = 8;

export function avatarPair(key: string): {
  background: string;
  color: string;
} {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const slot = (h % AVATAR_SLOTS) + 1;
  return {
    background: `var(--av-${slot}-bg)`,
    color: `var(--av-${slot}-fg)`,
  };
}

export function initials(name: string | null): string | null {
  const n = cleanName(name);
  if (!n) return null;
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Janela de tempo da lista (19/09/2026)
// ---------------------------------------------------------------------------

/**
 * O recorte de tempo da lista de conversas.
 *
 * POR QUE EXISTE: a lista abria com tudo (48 conversas no tenant do dono), e ele
 * disse "não faz sentido eu querer ficar vendo todas as conversas". O padrão
 * passou a ser HOJE, decisão dele.
 *
 * ⚠️ A REGRA PERIGOSA DESTE RECORTE, e ela não é opcional: **quem espera por
 * você nunca some pelo filtro de tempo.** Uma conversa com handoff aberto desde
 * ontem tem que aparecer mesmo em "Hoje", senão o recorte esconde exatamente o
 * que o produto existe para não deixar esquecer. Quem aplica isso é a lista (o
 * grupo "Esperando você" ignora a janela); aqui mora só a janela.
 */
export type JanelaKey = "hoje" | "7d" | "tudo";

export interface Janela {
  key: JanelaKey;
  /** Rótulo do seletor. */
  rotulo: string;
  /**
   * Quantos DIAS CIVIS a janela cobre, contando o de hoje. `null` = sem recorte.
   * "hoje" é 1 (só o dia de hoje), "7d" é 7 (hoje mais os seis anteriores).
   */
  dias: number | null;
}

export const JANELAS: Record<JanelaKey, Janela> = {
  hoje: { key: "hoje", rotulo: "Hoje", dias: 1 },
  "7d": { key: "7d", rotulo: "7 dias", dias: 7 },
  tudo: { key: "tudo", rotulo: "Tudo", dias: null },
};

/** Ordem do seletor, do recorte mais apertado ao mais largo. */
export const ORDEM_JANELAS: JanelaKey[] = ["hoje", "7d", "tudo"];

/** O recorte com que a lista abre. Decisão do dono em 19/09/2026. */
export const JANELA_PADRAO: JanelaKey = "hoje";

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * O dia CIVIL de São Paulo de um instante, como número comparável (AAAAMMDD).
 *
 * ⚠️ Compara DIA, e não "as últimas 24 horas", porque "hoje" para quem usa o CRM
 * é o dia de hoje: às 9h da manhã, uma janela de 24 horas traria metade de
 * ontem e chamaria isso de hoje.
 *
 * ⚠️ E o dia é o de America/Sao_Paulo, nunca o do relógio de quem abriu o
 * navegador nem UTC: em UTC a mensagem das 22h vira do dia seguinte, que é o
 * mesmo erro que `lib/valor.ts` documenta na classificação de "fora do horário".
 */
export function diaSP(instante: number): number {
  const p = parteLocal(new Date(instante).toISOString());
  if (!p) return 0;
  return p.ano * 10000 + p.mes * 100 + p.dia;
}

/**
 * A conversa entra na janela?
 *
 * Janela ROLANTE em dias civis: `dias = 1` é hoje, `dias = 7` é hoje mais os
 * seis dias anteriores. `dias = null` (o "Tudo") aceita qualquer coisa.
 */
export function dentroDaJanela(
  lastMessageAt: string,
  janela: Janela,
  agora: number
): boolean {
  if (janela.dias == null) return true;
  const t = Date.parse(lastMessageAt);
  if (!Number.isFinite(t)) return true; // sem data confiável, não esconde nada
  return diaSP(t) >= diaSP(agora - (janela.dias - 1) * DIA_MS);
}
