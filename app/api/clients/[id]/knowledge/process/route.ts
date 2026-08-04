import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { extractText, chunkText, embedTexts, toVector, RagError } from "@/lib/rag";

// Passo 2 do upload da base de conhecimento. Baixa o arquivo do Storage (já subido
// pelo navegador via URL assinada), extrai o texto, quebra em trechos, gera os
// embeddings e grava em knowledge_chunks. É o passo pesado; roda no Node e pede
// um tempo maior de execução. Só o dono.

const BUCKET = "knowledge";
const MAX_CHUNKS = 400;

// Vercel: extração + embedding de vários trechos pode passar bem de 10s.
export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/knowledge/process">
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "a base de conhecimento precisa de OPENAI_API_KEY no servidor" },
      { status: 501 }
    );
  }

  let body: { document_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const documentId = typeof body.document_id === "string" ? body.document_id : "";
  if (!documentId) {
    return NextResponse.json({ error: "document_id obrigatório" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: doc } = await svc
    .from("knowledge_documents")
    .select("id, title, storage_path, byte_size")
    .eq("id", documentId)
    .eq("client_id", id)
    .maybeSingle();
  if (!doc || !doc.storage_path) {
    return NextResponse.json({ error: "documento não encontrado" }, { status: 404 });
  }

  try {
    const { data: blob, error: dlErr } = await svc.storage
      .from(BUCKET)
      .download(doc.storage_path as string);
    if (dlErr || !blob) throw new RagError("não foi possível baixar o arquivo enviado");

    const buffer = Buffer.from(await blob.arrayBuffer());
    const text = await extractText(buffer, doc.title as string);
    const chunks = chunkText(text).slice(0, MAX_CHUNKS);
    if (chunks.length === 0) {
      throw new RagError("não encontrei texto legível no arquivo");
    }

    const embeddings = await embedTexts(apiKey, chunks);
    const rows = chunks.map((content, i) => ({
      client_id: id,
      document_id: documentId,
      chunk_index: i,
      content,
      embedding: toVector(embeddings[i]),
    }));
    // Reprocessamento: limpa chunks anteriores deste documento antes de inserir.
    await svc.from("knowledge_chunks").delete().eq("document_id", documentId);
    const { error: chunkErr } = await svc.from("knowledge_chunks").insert(rows);
    if (chunkErr) throw new RagError(chunkErr.message);

    await svc
      .from("knowledge_documents")
      .update({ status: "ready", chunk_count: chunks.length, error: null })
      .eq("id", documentId);

    return NextResponse.json({
      ok: true,
      document: {
        id: documentId,
        title: doc.title,
        status: "ready",
        chunk_count: chunks.length,
        byte_size: doc.byte_size,
      },
    });
  } catch (e) {
    const detail = e instanceof RagError ? e.message : "falha ao processar o arquivo";
    await svc
      .from("knowledge_documents")
      .update({ status: "error", error: detail })
      .eq("id", documentId);
    return NextResponse.json({ error: detail }, { status: 422 });
  }
}
