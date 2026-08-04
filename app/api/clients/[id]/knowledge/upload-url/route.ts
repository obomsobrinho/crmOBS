import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { EMBEDDING_MODEL } from "@/lib/rag";

// Passo 1 do upload da base de conhecimento (padrão gatekeeper). Cria o registro
// do documento (status processing) e devolve uma URL assinada para o navegador
// subir o arquivo DIRETO pro Storage, sem passar pela função (evita o limite de
// corpo da Vercel). Depois o navegador chama /process. Só o dono.

const BUCKET = "knowledge";
const MAX_BYTES = 20 * 1024 * 1024; // teto no app; o hard limit é do bucket

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "arquivo";
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/knowledge/upload-url">
) {
  const { id } = await ctx.params;

  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.id !== id)
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  if (mine.role !== "dono")
    return NextResponse.json(
      { error: "só o dono gerencia a base de conhecimento" },
      { status: 403 }
    );

  // Sem a chave, o /process não conseguiria embedar; falha cedo.
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "a base de conhecimento precisa de OPENAI_API_KEY no servidor" },
      { status: 501 }
    );
  }

  let body: { filename?: string; mime?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const filename = safeName(typeof body.filename === "string" ? body.filename : "");
  const size = typeof body.size === "number" ? body.size : 0;
  if (!filename) {
    return NextResponse.json({ error: "nome de arquivo inválido" }, { status: 400 });
  }
  if (size > MAX_BYTES) {
    return NextResponse.json(
      { error: "arquivo muito grande (máximo 20 MB)" },
      { status: 413 }
    );
  }

  const svc = createServiceClient();

  const { data: doc, error: insErr } = await svc
    .from("knowledge_documents")
    .insert({
      client_id: id,
      title: filename,
      storage_path: "",
      mime_type: body.mime || null,
      byte_size: size || null,
      embedding_model: EMBEDDING_MODEL,
      status: "processing",
    })
    .select("id")
    .single();
  if (insErr || !doc) {
    return NextResponse.json(
      { error: "falha ao registrar o documento", detail: insErr?.message },
      { status: 500 }
    );
  }
  const docId = doc.id as string;
  const path = `${id}/${docId}/${filename}`;

  const { data: signed, error: signErr } = await svc.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (signErr || !signed) {
    await svc.from("knowledge_documents").delete().eq("id", docId);
    return NextResponse.json(
      { error: "falha ao preparar o upload", detail: signErr?.message },
      { status: 500 }
    );
  }

  await svc.from("knowledge_documents").update({ storage_path: path }).eq("id", docId);

  return NextResponse.json({
    documentId: docId,
    bucket: BUCKET,
    path,
    token: signed.token,
    title: filename,
  });
}
