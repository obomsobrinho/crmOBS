import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { findChats, findMessages } from "@/lib/evolution";
import { cleanName } from "@/lib/inbox";

export const maxDuration = 300;

type EvoMsg = {
  key?: { fromMe?: boolean; remoteJid?: string; id?: string };
  pushName?: string;
  message?: Record<string, unknown> | null;
  messageTimestamp?: number;
};

function asArray(json: unknown, keys: string[]): unknown[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown> | null;
  if (!obj) return [];
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) return v;
    // Evolution v2: { messages: { records: [...] } }
    if (v && typeof v === "object" && Array.isArray((v as Record<string, unknown>).records)) {
      return (v as { records: unknown[] }).records;
    }
  }
  return [];
}

function extractText(m: Record<string, unknown> | null | undefined): string {
  if (!m) return "";
  const anym = m as Record<string, unknown>;
  const conv = anym.conversation as string | undefined;
  if (conv) return conv;
  const ext = anym.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return ext.text;
  const img = anym.imageMessage as { caption?: string } | undefined;
  if (img) return img.caption || "[imagem]";
  if (anym.audioMessage) return "[áudio]";
  if (anym.videoMessage) return "[vídeo]";
  if (anym.documentMessage) return "[documento]";
  if (anym.stickerMessage) return "[figurinha]";
  return "";
}

function isIndividual(jid: string | undefined): jid is string {
  // Individual real: número com pelo menos 8 dígitos. Ignora grupos (@g.us),
  // broadcast/status e JIDs-lixo como "0@s.whatsapp.net".
  return !!jid && /^\d{8,}@s\.whatsapp\.net$/.test(jid);
}

async function chunked<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

// Importa a base existente da instância Evolution do tenant (contatos + histórico).
// Idempotente: roda uma vez por cliente (clients.imported_at).
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/import">
) {
  const { id } = await ctx.params;

  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.id !== id)
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  if (!mine.evolution_instance)
    return NextResponse.json({ error: "sem instância conectada" }, { status: 400 });

  const instance = mine.evolution_instance;
  const svc = createServiceClient();

  // Idempotência: não reimporta.
  const { data: cli } = await svc
    .from("clients")
    .select("imported_at")
    .eq("id", id)
    .maybeSingle();
  if (cli?.imported_at) {
    return NextResponse.json({ skipped: true, reason: "já importado" });
  }

  // 1) Conversas individuais
  let chats: { remoteJid?: string; pushName?: string | null }[];
  try {
    const res = await findChats(instance);
    if (!res.ok) throw new Error(String(res.status));
    chats = asArray(await res.json(), ["chats", "data"]) as typeof chats;
  } catch {
    return NextResponse.json({ error: "falha ao ler conversas da Evolution" }, { status: 502 });
  }

  const individuals = chats.filter((c) => isIndividual(c.remoteJid));

  // 2) Contatos → dados_cliente (upsert, ignora duplicados por (client_id, telefone))
  const contatos = individuals.map((c) => ({
    client_id: id,
    telefone: c.remoteJid as string,
    nomewpp: cleanName(c.pushName),
    atendimento_ia: "ativa",
  }));
  if (contatos.length) {
    await svc
      .from("dados_cliente")
      .upsert(contatos, { onConflict: "client_id,telefone", ignoreDuplicates: true });
  }

  // 3) Mensagens de cada conversa → chat_messages
  const perChatRows = await chunked(individuals, 5, async (c) => {
    const jid = c.remoteJid as string;
    try {
      const res = await findMessages(instance, jid);
      if (!res.ok) return [];
      const msgs = asArray(await res.json(), ["messages", "records", "data"]) as EvoMsg[];
      const rows = [];
      for (const m of msgs) {
        const text = extractText(m.message);
        if (!text) continue;
        const fromMe = !!m.key?.fromMe;
        const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toISOString() : new Date().toISOString();
        // Nome do contato: em msg recebida o pushName é o contato; em msg
        // enviada o pushName é "Você" (ignorado). Nunca grava "Você".
        const nomewpp = cleanName(fromMe ? c.pushName : m.pushName ?? c.pushName);
        rows.push({
          client_id: id,
          phone: jid,
          nomewpp,
          user_message: fromMe ? null : text,
          bot_message: fromMe ? text : null,
          message_type: "imported",
          created_at: ts,
        });
      }
      return rows;
    } catch {
      return [];
    }
  });

  const allRows = perChatRows.flat();

  // Insere em lotes
  let inserted = 0;
  for (let i = 0; i < allRows.length; i += 500) {
    const batch = allRows.slice(i, i + 500);
    const { error } = await svc.from("chat_messages").insert(batch);
    if (!error) inserted += batch.length;
  }

  await svc.from("clients").update({ imported_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({
    ok: true,
    contatos: contatos.length,
    mensagens: inserted,
    conversas: individuals.length,
  });
}
