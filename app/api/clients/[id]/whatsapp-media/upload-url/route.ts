import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

// URL assinada para o navegador subir mídia DIRETO pro bucket whatsapp-media
// (sem passar pela função; evita o limite de corpo da Vercel). Depois o composer
// dispara o envio pelo /api/send. Qualquer membro do tenant pode enviar mídia
// numa conversa (não é dono-only). O bucket é privado; a leitura/render usa URL
// assinada e o envio pela Evolution é resolvido no n8n com service_role.

const BUCKET = "whatsapp-media";
const MAX_BYTES = 16 * 1024 * 1024; // teto de mídia do WhatsApp (~16 MB)

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1].slice(0, 8) : "bin";
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/whatsapp-media/upload-url">
) {
  const { id } = await ctx.params;

  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.id !== id)
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });

  let body: { filename?: string; mime?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const filename = typeof body.filename === "string" ? body.filename : "";
  const size = typeof body.size === "number" ? body.size : 0;
  if (!filename) {
    return NextResponse.json({ error: "nome de arquivo inválido" }, { status: 400 });
  }
  if (size > MAX_BYTES) {
    return NextResponse.json(
      { error: "arquivo muito grande (máximo 16 MB)" },
      { status: 413 }
    );
  }

  // Caminho isolado por tenant (1ª pasta = client_id, casa com a RLS do bucket).
  const path = `${id}/out/${crypto.randomUUID()}.${extOf(filename)}`;

  const svc = createServiceClient();
  const { data: signed, error } = await svc.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !signed) {
    return NextResponse.json(
      { error: "falha ao preparar o upload", detail: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ bucket: BUCKET, path, token: signed.token });
}

export const runtime = "nodejs";
