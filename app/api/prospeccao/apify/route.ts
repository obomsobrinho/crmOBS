import { NextResponse } from "next/server";
import { ehId } from "@/lib/campanhas-pedidos";
import { fecharBusca } from "@/lib/campanhas-servidor";
import { fonteApify } from "@/lib/fonte-apify";
import { segredoConfere } from "@/lib/segredo";
import { createServiceClient } from "@/lib/supabase/service";

// O WEBHOOK DA FONTE DE LEADS (Apify, fim de uma execução). Fora de `/api/admin`
// porque o `proxy.ts` responde 404 ali a quem não tem sessão de admin. Confere o
// `APIFY_WEBHOOK_SECRET` no header `x-apify-secret` (posto pelo `headersTemplate`
// da execução, nunca na URL) e então pergunta à FONTE como a execução terminou: o
// corpo do webhook não decide nada. Idempotente (webhook repetido, ou o cron ao
// mesmo tempo): uma busca que já saiu de "buscando" volta como está.
export async function POST(req: Request) {
  if (!segredoConfere(req.headers.get("x-apify-secret"), process.env.APIFY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const buscaId = new URL(req.url).searchParams.get("busca");
  if (!ehId(buscaId)) return NextResponse.json({ error: "busca inválida" }, { status: 400 });
  try {
    const situacao = await fecharBusca(createServiceClient(), fonteApify, buscaId);
    return NextResponse.json({ ok: true, situacao });
  } catch (e) {
    // A busca segue "buscando": o cron tenta de novo (`buscasPresas`).
    console.error("webhook da fonte de leads:", e);
    return NextResponse.json({ error: "falha ao fechar a busca" }, { status: 500 });
  }
}
