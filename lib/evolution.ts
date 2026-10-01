import "server-only";

// Wrapper mínimo da Evolution API (server-only). Usa a apikey GLOBAL, que
// autoriza operações em qualquer instância.
const BASE = process.env.EVOLUTION_API_URL;
const KEY = process.env.EVOLUTION_API_KEY;

function ensureEnv() {
  if (!BASE || !KEY) {
    throw new Error(
      "Defina EVOLUTION_API_URL e EVOLUTION_API_KEY no ambiente do servidor"
    );
  }
}

function headers() {
  return { "Content-Type": "application/json", apikey: KEY as string };
}

const EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

// Extrai o base64 do QR de formatos diferentes de resposta da Evolution.
export function extractQrBase64(payload: unknown): string | null {
  const p = payload as
    | { qrcode?: { base64?: string; code?: string }; base64?: string; code?: string }
    | null;
  const raw = p?.qrcode?.base64 ?? p?.base64 ?? null;
  if (!raw) return null;
  return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
}

/**
 * Código de pareamento (8 caracteres) da resposta da Evolution, quando a conexão
 * foi pedida com `number`. É a alternativa ao QR para quem está no próprio
 * celular: a pessoa digita o código no WhatsApp, em Aparelhos conectados >
 * Conectar com número de telefone.
 */
export function extractPairingCode(payload: unknown): string | null {
  const p = payload as
    | { pairingCode?: string | null; qrcode?: { pairingCode?: string | null } }
    | null;
  const code = p?.pairingCode ?? p?.qrcode?.pairingCode ?? null;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

export async function createInstance(
  instanceName: string,
  webhookUrl: string,
  /** Só dígitos, com DDI. Presente, a Evolution já devolve o código de pareamento. */
  number?: string
) {
  ensureEnv();
  return fetch(`${BASE}/instance/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      ...(number ? { number } : {}),
      // ⚠️ NÃO pede histórico (23/09/2026, decisão do dono: o CRM não importa
      // o passado de forma nenhuma). Vale para instância criada daqui em
      // diante; as que já existem foram criadas com `true`.
      syncFullHistory: false,
      webhook: { url: webhookUrl, byEvents: false, base64: false, events: EVENTS },
    }),
  });
}

// `findChats` e `findMessages` SAÍRAM junto com a importação de histórico
// (23/09/2026): eram usados só por ela, e deixar o caminho pronto é convite a
// religar sem querer.

export async function connectInstance(instanceName: string, number?: string) {
  ensureEnv();
  const qs = number ? `?number=${encodeURIComponent(number)}` : "";
  return fetch(`${BASE}/instance/connect/${encodeURIComponent(instanceName)}${qs}`, {
    method: "GET",
    headers: headers(),
  });
}

/**
 * Derruba a sessão da instância. ⚠️ Só para instância que NÃO está conectada:
 * a Evolution só gera código de pareamento a partir do estado fechado, e uma
 * instância parada em "connecting" (QR pedido e não lido) precisa voltar a
 * fechado antes. Chamar isto numa instância aberta desconectaria o WhatsApp.
 */
export async function logoutInstance(instanceName: string) {
  ensureEnv();
  return fetch(`${BASE}/instance/logout/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
    headers: headers(),
  });
}

export async function connectionState(instanceName: string) {
  ensureEnv();
  return fetch(
    `${BASE}/instance/connectionState/${encodeURIComponent(instanceName)}`,
    { method: "GET", headers: headers() }
  );
}

// AVISOS NO WHATSAPP (29/09/2026, docs/plano-avisos.md).
// Os três formatos abaixo foram conferidos na doc (context7) E numa leitura real
// da instância da OBM em 29/09/2026 (Evolution 2.3.x). ⚠️ A doc publicada da v2
// ainda mostra `fetchInstances` como `[{ instance: { owner } }]`; a resposta de
// verdade é a linha do banco dela, com `ownerJid` no topo. Não trocar para o
// formato da doc sem medir de novo.

/**
 * Manda um texto. `destino` é o JID inteiro (`...@g.us` ou
 * `...@s.whatsapp.net`), igual ao que o nó "Notifica grupo" do n8n passa.
 * Devolve `true` só com 2xx (a Evolution responde 201).
 */
/**
 * Manda texto. ⚠️ `linkPreview: false` (30/09/2026): com a prévia ligada, o
 * aviso com o link "Abrir no CRM" chegava com o cartão grande do site em cima,
 * maior que a própria mensagem.
 */
export async function sendText(
  instanceName: string,
  destino: string,
  text: string
): Promise<boolean> {
  ensureEnv();
  const res = await fetch(
    `${BASE}/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ number: destino, text, linkPreview: false }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  return res.ok;
}

export interface GrupoWhatsApp {
  jid: string;
  nome: string;
}

/**
 * Grupos em que o número conectado participa (`getParticipants=false`: só o
 * nome interessa, e com participantes a resposta cresce com o tamanho do grupo).
 * ⚠️ A comunidade em si (`isCommunity`) sai da lista: ela é o contêiner dos
 * grupos e não recebe mensagem; os grupos dela aparecem cada um na própria linha.
 * `null` = a Evolution não respondeu ou respondeu algo que não dá para ler.
 */
export async function fetchGroups(
  instanceName: string
): Promise<GrupoWhatsApp[] | null> {
  ensureEnv();
  const res = await fetch(
    `${BASE}/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
    { method: "GET", headers: headers(), signal: AbortSignal.timeout(20_000) }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return null;
  return data
    .filter(
      (g): g is { id: string; subject?: unknown; isCommunity?: unknown } =>
        !!g &&
        typeof g === "object" &&
        typeof (g as { id?: unknown }).id === "string" &&
        (g as { id: string }).id.endsWith("@g.us") &&
        (g as { isCommunity?: unknown }).isCommunity !== true
    )
    .map((g) => ({
      jid: g.id,
      nome:
        typeof g.subject === "string" && g.subject.trim()
          ? g.subject.trim()
          : "Grupo sem nome",
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Dígitos do número conectado na instância (`ownerJid`), ou `null` quando não
 * dá para saber (instância nunca conectada, Evolution fora do ar, formato
 * diferente). Quem usa trata `null` como "não sei" e NÃO bloqueia: dado
 * faltando não derruba quem está configurando, a mesma regra do `publish`.
 */
export async function ownerNumber(instanceName: string): Promise<string | null> {
  try {
    ensureEnv();
    const res = await fetch(
      `${BASE}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
      { method: "GET", headers: headers(), signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    const linha = Array.isArray(data) ? data[0] : null;
    const jid = (linha as { ownerJid?: unknown } | null)?.ownerJid;
    if (typeof jid !== "string" || !jid.includes("@")) return null;
    const d = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
    return d || null;
  } catch {
    return null;
  }
}
