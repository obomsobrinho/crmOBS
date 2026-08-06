import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Chamado pelo n8n quando chega mídia do contato. Sobe o base64 (que a Evolution
// entrega no webhook) pro bucket privado whatsapp-media e devolve o caminho, que
// o n8n grava em chat_messages.media_url (o CRM re-assina ao exibir). Sem mídia
// (mensagem de texto), responde { path: null } e o n8n segue igual. NUNCA quebra
// o fluxo: em qualquer falha responde 200 com path null, para o n8n (que chama
// com onError=continua) salvar a mensagem mesmo assim.
// Protegido pelo mesmo segredo compartilhado do /api/agent.

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "whatsapp-media";

// mime -> extensão de arquivo (os tipos comuns do WhatsApp).
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

function extFor(mime: string, filename: string): string {
  const byMime = EXT[mime.toLowerCase()];
  if (byMime) return byMime;
  const byName = filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  if (byName) return byName[1];
  const sub = mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "").slice(0, 8);
  return sub || "bin";
}

export async function POST(req: NextRequest) {
  const secret = process.env.N8N_LOOKUP_SECRET;
  if (!secret || req.headers.get("x-lookup-secret") !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  let body: {
    client_id?: string;
    base64?: string;
    mime?: string;
    filename?: string;
    type?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ path: null, type: null });
  }

  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  const base64 = typeof body.base64 === "string" ? body.base64 : "";
  const mime =
    typeof body.mime === "string" && body.mime
      ? body.mime
      : "application/octet-stream";
  const filename = typeof body.filename === "string" ? body.filename : "";
  const type = typeof body.type === "string" ? body.type : "document";

  // Texto (sem base64) ou payload inválido: nada a subir.
  if (!clientId || !base64) {
    return NextResponse.json({ path: null, type: null });
  }

  // O base64 pode vir como data URI (com prefixo "data:...;base64,").
  const clean = base64.includes(",")
    ? base64.slice(base64.indexOf(",") + 1)
    : base64;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(clean, "base64");
  } catch {
    return NextResponse.json({ path: null, type: null });
  }
  if (bytes.byteLength === 0) {
    return NextResponse.json({ path: null, type: null });
  }

  const path = `${clientId}/in/${crypto.randomUUID()}.${extFor(mime, filename)}`;

  try {
    const svc = createServiceClient();
    const { error } = await svc.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (error) {
      // Não quebra o fluxo do n8n: a mensagem ainda é salva, só sem o arquivo.
      return NextResponse.json({ path: null, type: null, error: error.message });
    }
  } catch (e) {
    return NextResponse.json({
      path: null,
      type: null,
      error: e instanceof Error ? e.message : "falha no upload",
    });
  }

  return NextResponse.json({ path, type });
}
