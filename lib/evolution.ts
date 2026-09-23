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

export async function createInstance(instanceName: string, webhookUrl: string) {
  ensureEnv();
  return fetch(`${BASE}/instance/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
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

export async function connectInstance(instanceName: string) {
  ensureEnv();
  return fetch(`${BASE}/instance/connect/${encodeURIComponent(instanceName)}`, {
    method: "GET",
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
