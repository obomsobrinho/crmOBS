import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { segredoConfere } from "@/lib/segredo";
import { caminhoDaMidia, lerPedidoDeMidia } from "@/lib/midia-recebida";

// Chamado pelo n8n quando chega mídia do contato. Devolve o caminho no bucket
// privado whatsapp-media, que o n8n grava em chat_messages.media_url (o CRM
// re-assina ao exibir). Dois modos, regra em `lib/midia-recebida.ts`:
// - base64 no corpo: a rota sobe o arquivo (modo antigo, limitado pelo corpo
//   da Vercel);
// - `assinar: true`: a rota devolve `signedUploadUrl` e o n8n sobe o binário
//   direto no Storage (vídeo e PDF grande).
// Sem mídia, responde { path: null } e o n8n segue igual. NUNCA quebra o fluxo:
// em qualquer falha responde 200 com path null, para o n8n (que chama com
// onError=continua) salvar a mensagem mesmo assim.
// Protegido pelo mesmo segredo compartilhado do /api/agent.

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "whatsapp-media";

export async function POST(req: NextRequest) {
  const secret = process.env.N8N_LOOKUP_SECRET;
  if (!segredoConfere(req.headers.get("x-lookup-secret"), secret)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ path: null, type: null });
  }

  const pedido = lerPedidoDeMidia(body);
  if (pedido.modo === "nada") {
    return NextResponse.json({ path: null, type: null });
  }

  const path = caminhoDaMidia(pedido.clientId, pedido.mime, pedido.filename, crypto.randomUUID());

  try {
    const svc = createServiceClient();
    if (pedido.modo === "assinar") {
      const { data, error } = await svc.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) {
        return NextResponse.json({ path: null, type: null, error: error?.message ?? "falha ao assinar" });
      }
      return NextResponse.json({ path, type: pedido.type, signedUploadUrl: data.signedUrl });
    }
    const { error } = await svc.storage
      .from(BUCKET)
      .upload(path, pedido.bytes, { contentType: pedido.mime, upsert: true });
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

  return NextResponse.json({ path, type: pedido.type });
}
