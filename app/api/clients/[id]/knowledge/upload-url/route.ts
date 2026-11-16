import { NextResponse, type NextRequest } from "next/server";
import { lerCorpo, sessaoDaRota } from "@/lib/rota";
import { corpoDoEnvioDeArquivo } from "@/lib/agent-schemas";
import { createServiceClient } from "@/lib/supabase/service";
import { KNOWLEDGE_MAX_BYTES, KNOWLEDGE_MAX_LABEL } from "@/lib/crm";
import { EMBEDDING_MODEL } from "@/lib/rag";

// Passo 1 do upload da base de conhecimento (padrão gatekeeper). Cria o registro
// do documento (status processing) e devolve uma URL assinada para o navegador
// subir o arquivo DIRETO pro Storage, sem passar pela função (evita o limite de
// corpo da Vercel). Depois o navegador chama /process. Só o dono.

const BUCKET = "knowledge";
// ⚠️ O teto mora em lib/crm.ts, com a tela: aqui ele era 20 MB e a area de
// envio prometia 8, ou seja, duas verdades sobre o mesmo limite.

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "arquivo";
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/knowledge/upload-url">
) {
  const { id } = await ctx.params;

  const r = await sessaoDaRota({ id, dono: "só o dono gerencia a base de conhecimento", ativa: true });
  if ("erro" in r) return r.erro;

  // Sem a chave, o /process não conseguiria embedar; falha cedo.
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "a base de conhecimento precisa de OPENAI_API_KEY no servidor" },
      { status: 501 }
    );
  }

  // O corpo cruza o esquema (`lib/agent-schemas.ts`); o resto é conferido abaixo, como antes.
  const lido = await lerCorpo(req, corpoDoEnvioDeArquivo, { motivo: true });
  if ("erro" in lido) return lido.erro;
  const body = lido.dados;
  const filename = safeName(typeof body.filename === "string" ? body.filename : "");
  const size = typeof body.size === "number" ? body.size : 0;
  if (!filename) {
    return NextResponse.json({ error: "nome de arquivo inválido" }, { status: 400 });
  }
  if (size > KNOWLEDGE_MAX_BYTES) {
    return NextResponse.json(
      { error: `arquivo muito grande (máximo ${KNOWLEDGE_MAX_LABEL})` },
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
