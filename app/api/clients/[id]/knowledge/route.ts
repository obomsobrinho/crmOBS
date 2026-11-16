import { NextResponse, type NextRequest } from "next/server";
import { lerCorpo, sessaoDaRota } from "@/lib/rota";
import { corpoDoDocumento } from "@/lib/agent-schemas";
import { createServiceClient } from "@/lib/supabase/service";

// Base de conhecimento: remover um documento. O upload virou dois passos
// (upload-url + process) por causa do limite de corpo de requisição da Vercel;
// o navegador sobe direto pro Storage. Só o dono gerencia.

const BUCKET = "knowledge";

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/knowledge">
) {
  const { id } = await ctx.params;

  const r = await sessaoDaRota({ id, dono: "só o dono gerencia a base de conhecimento", ativa: true });
  if ("erro" in r) return r.erro;

  // O corpo cruza o esquema (`lib/agent-schemas.ts`); o resto é conferido abaixo, como antes.
  const lido = await lerCorpo(req, corpoDoDocumento, { motivo: true });
  if ("erro" in lido) return lido.erro;
  const body = lido.dados;
  const documentId = typeof body.document_id === "string" ? body.document_id : "";
  if (!documentId) {
    return NextResponse.json({ error: "document_id obrigatório" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: doc } = await svc
    .from("knowledge_documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .eq("client_id", id)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "documento não encontrado" }, { status: 404 });
  }

  if (doc.storage_path) {
    await svc.storage.from(BUCKET).remove([doc.storage_path as string]);
  }
  // Os chunks somem por cascade (FK on delete cascade).
  const { error: delErr } = await svc
    .from("knowledge_documents")
    .delete()
    .eq("id", documentId)
    .eq("client_id", id);
  if (delErr) {
    return NextResponse.json(
      { error: "falha ao remover", detail: delErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
