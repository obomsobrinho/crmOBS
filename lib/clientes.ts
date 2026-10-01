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

/**
 * Quantos dias civis sem mensagem fazem um contato FRIO. Decisão do dono (D3,
 * 30/09/2026): 60 fixo no beta, configurável quando um testador pedir. 60 cobre
 * com folga quem volta todo mês (barbeiro, ótica) sem chamar de frio.
 */
export const LIMIAR_FRIO_DIAS = 60;

export type FiltroClientes = "todos" | "conversa" | "frio" | "nunca" | "incompleto";

export const ROTULO_FILTRO: Record<FiltroClientes, string> = {
  todos: "Todos",
  conversa: "Em conversa",
  frio: `Sem contato há ${LIMIAR_FRIO_DIAS}+ dias`,
  nunca: "Nunca escreveram",
  incompleto: "Cadastro incompleto",
};

export function passaFiltro(c: ClienteItem, f: FiltroClientes, agora: number): boolean {
  if (f === "conversa") return emConversa(c.lastMessageAt, agora);
  if (f === "frio") return estadoContato(c.lastMessageAt, agora) === "frio";
  if (f === "nunca") return estadoContato(c.lastMessageAt, agora) === "nunca";
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

// ---------------------------------------------------------------------------
// Contato frio (fatia C, 30/09/2026).
// ---------------------------------------------------------------------------

/**
 * O estado do contato pela última mensagem, em dias civis de São Paulo.
 *
 * ⚠️ "Nunca escreveu" NÃO é frio: frio é quem conversou e parou, e é a lista de
 * quem vale a pena procurar de novo. Quem nunca escreveu (o contato criado à
 * mão da fatia B) é outro estado, com outro risco ao escrever.
 */
export type EstadoContato = "nunca" | "conversa" | "normal" | "frio";

export function estadoContato(lastMessageAt: string | null, agora: number): EstadoContato {
  if (!lastMessageAt || !Number.isFinite(Date.parse(lastMessageAt))) return "nunca";
  const d = diasDesde(lastMessageAt, agora);
  if (d <= 0) return "conversa";
  return d >= LIMIAR_FRIO_DIAS ? "frio" : "normal";
}

/** Dias sem contato quando o contato está frio; `null` nos outros estados. */
export function diasSemContato(lastMessageAt: string | null, agora: number): number | null {
  return estadoContato(lastMessageAt, agora) === "frio" ? diasDesde(lastMessageAt!, agora) : null;
}

// ---------------------------------------------------------------------------
// Novo cliente (fatia B, 01/10/2026).
// ---------------------------------------------------------------------------

/**
 * O telefone digitado no "Novo cliente" (com a máscara de `mascaraTelefoneBR`)
 * virando os dígitos com o 55. Só Brasil: o 55 é automático no produto.
 * Celular tem 9 dígitos começando por 9; fixo tem 8. DDD 00 passa de propósito:
 * é o número impossível da suíte de testes (`telefoneImpossivel`), que nunca
 * chega a ninguém.
 */
export function telefoneDoCadastro(
  texto: string
): { ok: true; digitos: string } | { ok: false; motivo: string } {
  let d = texto.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) {
    return { ok: false, motivo: "Digite o DDD e o número, como (11) 91234-5678." };
  }
  const ddd = d.slice(0, 2);
  if (ddd !== "00" && (ddd[0] === "0" || ddd[1] === "0")) {
    return { ok: false, motivo: "Esse DDD não existe." };
  }
  if (d.length === 11 && d[2] !== "9" && ddd !== "00") {
    return { ok: false, motivo: "Celular com 9 dígitos começa com 9." };
  }
  return { ok: true, digitos: `55${d}` };
}

/** O endereço de WhatsApp de uma pessoa, no formato que o n8n grava. */
export function jidDePessoa(digitos: string): string {
  return `${digitos.replace(/\D/g, "")}@s.whatsapp.net`;
}

/**
 * As grafias com que o mesmo número pode estar gravado: com e sem o nono dígito,
 * com e sem o sufixo do WhatsApp. É o que impede o "Novo cliente" de duplicar
 * quem já escreveu (o WhatsApp entrega números antigos sem o 9).
 */
export function grafiasDoTelefone(digitos: string): string[] {
  const chave = chaveTelefone(digitos);
  const nums = new Set([digitos, chave]);
  if (chave.length === 12 && chave.startsWith("55")) nums.add(`${chave.slice(0, 4)}9${chave.slice(4)}`);
  return [...nums].flatMap((n) => [n, jidDePessoa(n)]);
}
