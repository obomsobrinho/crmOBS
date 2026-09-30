import { cleanName, diaSP } from "./inbox";
import { chaveTelefone, ehNumeroDeAvisos } from "./avisos";

// TELA DE CLIENTES (30/09/2026, docs/plano-clientes.md). Módulo puro: monta a
// lista, busca e recorta. Servidor e navegador usam as MESMAS funções.

/** Linha crua de `dados_cliente` que a tela lê. */
export interface ContatoClienteRow {
  id: number;
  telefone: string;
  nomewpp: string | null;
  display_name: string | null;
  atendimento_ia: string | null;
  custom_fields: Record<string, unknown> | null;
  email: string | null;
  birth_date: string | null;
  created_at: string | null;
}

/** Linha crua de `conversations` que a tela lê. */
export interface ConversaClienteRow {
  id: number;
  phone: string;
  last_message_at: string | null;
  assigned_user_id: string | null;
}

/** `conversation_tags` com o rótulo junto. */
export interface TagClienteRow {
  conversation_id: number;
  tags: { name: string; color: string | null } | null;
}

export interface ClienteItem {
  id: number;
  phone: string;
  /** Nome resolvido (display_name, senão pushName limpo). Nulo = mostrar o telefone. */
  name: string | null;
  /** O time deu um nome (display_name). É o que o medidor conta: o campo Nome
   *  da ficha mostra só ele, e o pushName do WhatsApp não é cadastro. */
  nomeCadastrado: boolean;
  lastMessageAt: string | null;
  conversationId: number | null;
  pausada: boolean;
  temAtendente: boolean;
  tags: { name: string; color: string | null }[];
  /** Valores dos campos personalizados, só para a busca. */
  campos: string[];
  email: string | null;
  birthDate: string | null;
}

/**
 * O que conta no medidor de cadastro. Decisão do dono (D1 = B, 30/09/2026):
 * Nome, Nascimento e E-mail. CPF ficou de fora de propósito (LGPD).
 */
export const DADOS_DO_CADASTRO = ["Nome", "Nascimento", "E-mail"] as const;

export function preenchidos(c: Pick<ClienteItem, "nomeCadastrado" | "birthDate" | "email">): boolean[] {
  return [c.nomeCadastrado, !!c.birthDate, !!c.email?.trim()];
}

export function cadastroCompleto(c: Pick<ClienteItem, "nomeCadastrado" | "birthDate" | "email">): boolean {
  return preenchidos(c).every(Boolean);
}

/**
 * "Em conversa": mensagem no DIA CIVIL de hoje em America/Sao_Paulo (D2,
 * 30/09/2026), a mesma régua do "Hoje" da lista de conversas.
 */
export function emConversa(lastMessageAt: string | null, agora: number): boolean {
  if (!lastMessageAt) return false;
  const t = Date.parse(lastMessageAt);
  return Number.isFinite(t) && diaSP(t) === diaSP(agora);
}

export function montarClientes(
  contatos: ContatoClienteRow[],
  conversas: ConversaClienteRow[],
  tags: TagClienteRow[],
  avisos: string | null
): ClienteItem[] {
  const convPorFone = new Map(conversas.map((c) => [c.phone, c]));
  const tagsPorConv = new Map<number, { name: string; color: string | null }[]>();
  for (const t of tags) {
    if (!t.tags) continue;
    const l = tagsPorConv.get(t.conversation_id) ?? [];
    l.push(t.tags);
    tagsPorConv.set(t.conversation_id, l);
  }
  return contatos
    // O número que recebe os avisos nunca é cliente (lib/avisos.ts).
    .filter((c) => !ehNumeroDeAvisos(c.telefone, avisos))
    .map((c) => {
      const conv = convPorFone.get(c.telefone) ?? null;
      return {
        id: c.id,
        phone: c.telefone,
        name: cleanName(c.display_name) ?? cleanName(c.nomewpp),
        nomeCadastrado: !!c.display_name?.trim(),
        lastMessageAt: conv?.last_message_at ?? null,
        conversationId: conv?.id ?? null,
        pausada: c.atendimento_ia === "pause",
        temAtendente: !!conv?.assigned_user_id,
        tags: conv ? tagsPorConv.get(conv.id) ?? [] : [],
        campos: Object.values(c.custom_fields ?? {})
          .map((v) => (v == null ? "" : String(v)))
          .filter(Boolean),
        email: c.email,
        birthDate: c.birth_date,
      };
    })
    .sort((a, b) => ordem(b) - ordem(a));
}

// Mais recente primeiro; sem conversa vai para o fim.
function ordem(c: ClienteItem): number {
  const t = c.lastMessageAt ? Date.parse(c.lastMessageAt) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * A busca olha nome, e-mail, tags, campos personalizados e telefone (pelos
 * dígitos, tolerando o nono dígito). Sem acento e sem caixa.
 */
export function casaBusca(c: ClienteItem, q: string): boolean {
  const nq = normalizar(q.trim());
  if (!nq) return true;
  const texto = normalizar(
    [c.name, c.email, ...c.tags.map((t) => t.name), ...c.campos].filter(Boolean).join(" ")
  );
  if (texto.includes(nq)) return true;
  const dq = q.replace(/\D/g, "");
  if (dq.length < 2) return false;
  const fone = c.phone.replace(/\D/g, "");
  const semNove = chaveTelefone(fone);
  return variantesSemNove(dq).some((v) => fone.includes(v) || semNove.includes(v));
}

// O mesmo celular aparece com e sem o 9 depois do DDD: quem busca com o 9
// precisa achar o número guardado sem ele, com ou sem o 55 na frente.
function variantesSemNove(d: string): string[] {
  const v = [d];
  if (d.length === 11 && d[2] === "9") v.push(d.slice(0, 2) + d.slice(3));
  if (d.length === 13 && d.startsWith("55") && d[4] === "9") v.push(chaveTelefone(d));
  return v;
}

export type FiltroClientes = "todos" | "conversa" | "incompleto";

export const ROTULO_FILTRO: Record<FiltroClientes, string> = {
  todos: "Todos",
  conversa: "Em conversa",
  incompleto: "Cadastro incompleto",
};

export function passaFiltro(c: ClienteItem, f: FiltroClientes, agora: number): boolean {
  if (f === "conversa") return emConversa(c.lastMessageAt, agora);
  if (f === "incompleto") return !cadastroCompleto(c);
  return true;
}

// ---------------------------------------------------------------------------
// Nascimento: a tela mostra DD/MM/AAAA, o banco guarda AAAA-MM-DD (date).
// ---------------------------------------------------------------------------

export function mascaraData(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  let o = d.slice(0, 2);
  if (d.length > 2) o += "/" + d.slice(2, 4);
  if (d.length > 4) o += "/" + d.slice(4, 8);
  return o;
}

export function isoParaTela(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** `""` vira null (apagar); data impossível devolve `undefined` (recusar). */
export function telaParaIso(tela: string): string | null | undefined {
  const t = tela.trim();
  if (!t) return null;
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return undefined;
  }
  if (ano < 1900 || d.getTime() > Date.now()) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function emailValido(v: string): boolean {
  const t = v.trim();
  return !t || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

// ---------------------------------------------------------------------------
// Último contato, em dias civis de São Paulo.
// ---------------------------------------------------------------------------

function diaParaUtc(aaaammdd: number): number {
  return Date.UTC(Math.floor(aaaammdd / 10000), Math.floor((aaaammdd % 10000) / 100) - 1, aaaammdd % 100);
}

/** Quantos dias civis (SP) separam a mensagem de hoje. 0 = hoje. */
export function diasDesde(iso: string, agora: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.round((diaParaUtc(diaSP(agora)) - diaParaUtc(diaSP(t))) / 86_400_000);
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "Ontem", "Há 5 dias", "12 ago". Hoje fica para quem chama (leva a hora). */
export function textoUltimoContato(iso: string, agora: number): string {
  const d = diasDesde(iso, agora);
  if (d <= 1) return d === 1 ? "Ontem" : "Hoje";
  if (d < 30) return `Há ${d} dias`;
  const dia = diaSP(Date.parse(iso));
  return `${dia % 100} ${MESES[Math.floor((dia % 10000) / 100) - 1]}`;
}
